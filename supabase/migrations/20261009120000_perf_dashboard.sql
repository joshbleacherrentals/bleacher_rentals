-- The performance dashboard's database side — docs/specs/performance-dashboard.md.
--
-- WHO: only an active developer, enforced here and not in the page. A SELECT policy on PerfEvents
-- uses the check DevAllowedEmails already uses, `get_user_roles() && ARRAY['developer']`, and the
-- functions below run with the CALLER's rights (SECURITY INVOKER), so that policy applies inside
-- them: anyone else gets empty results. anon cannot execute them at all. There is still no policy
-- for insert, update or delete: the only writer is /api/telemetry with the service-role key.
--
-- WHAT: the queries of docs/PERFORMANCE_QUERIES.md as functions, because the Supabase client
-- cannot run percentile_cont itself. Every one filters on received_at (the server's clock), not
-- event_at (the browser's). The environment and version filters are arguments; a NULL version
-- means every version.

CREATE POLICY "rbac_select" ON public."PerfEvents"
  AS PERMISSIVE FOR SELECT TO authenticated
  USING (public.get_user_roles() && ARRAY['developer']::text[]);

-- ── perf_versions: the app versions seen in the period, newest first ────────────────────────────

CREATE FUNCTION public.perf_versions(p_since timestamptz, p_env text)
RETURNS TABLE (app_version text, events bigint)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public AS $$
  SELECT e.app_version, count(*)
  FROM public."PerfEvents" e
  WHERE e.received_at >= p_since AND e.env = p_env
  GROUP BY e.app_version
  ORDER BY max(e.received_at) DESC, e.app_version DESC
$$;

-- ── perf_percentiles: every metric with a duration, except sqlite.* (see perf_sqlite) ───────────
-- Failed calls stay in the percentiles: a slow failure is part of what a user waited.

CREATE FUNCTION public.perf_percentiles(p_since timestamptz, p_env text, p_version text)
RETURNS TABLE (
  name text, n bigint, errors bigint,
  p50 double precision, p75 double precision, p90 double precision,
  p95 double precision, p99 double precision, max_ms double precision
)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public AS $$
  SELECT e.name,
         count(*),
         count(*) FILTER (WHERE e.outcome = 'error'),
         percentile_cont(0.50) WITHIN GROUP (ORDER BY e.duration_ms),
         percentile_cont(0.75) WITHIN GROUP (ORDER BY e.duration_ms),
         percentile_cont(0.90) WITHIN GROUP (ORDER BY e.duration_ms),
         percentile_cont(0.95) WITHIN GROUP (ORDER BY e.duration_ms),
         percentile_cont(0.99) WITHIN GROUP (ORDER BY e.duration_ms),
         max(e.duration_ms)
  FROM public."PerfEvents" e
  WHERE e.received_at >= p_since AND e.env = p_env
    AND (p_version IS NULL OR e.app_version = p_version)
    AND e.duration_ms IS NOT NULL
    AND e.name NOT LIKE 'sqlite.%'
  GROUP BY e.name
  ORDER BY e.name
$$;

-- ── perf_sqlite: the fast calls are only counted (in buckets), the slow ones are single events ──
-- A percentile that falls among the fast calls is known to a bucket, so it is returned as the
-- bucket's upper edge with kind 'bucket'; one that falls among the slow calls is exact.
-- The five percentiles are rows, so the page does not depend on a column per percentile.

CREATE FUNCTION public.perf_sqlite(p_since timestamptz, p_env text, p_version text)
RETURNS TABLE (name text, calls bigint, slow_calls bigint, p numeric, kind text, value double precision)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public AS $$
  WITH base AS (
    SELECT * FROM public."PerfEvents" e
    WHERE e.name LIKE 'sqlite.%' AND e.received_at >= p_since AND e.env = p_env
      AND (p_version IS NULL OR e.app_version = p_version)
  ),
  fast AS (
    SELECT b.name,
           (b.attrs ->> 'count')::bigint AS n,
           (b.attrs ->> 'b1')::bigint AS b1, (b.attrs ->> 'b2')::bigint AS b2,
           (b.attrs ->> 'b3')::bigint AS b3, (b.attrs ->> 'b4')::bigint AS b4,
           (b.attrs ->> 'b5')::bigint AS b5, (b.attrs ->> 'b6')::bigint AS b6
    FROM base b
    WHERE b.duration_ms IS NULL AND b.attrs ? 'count'
    UNION ALL
    SELECT b.name, 1,
           (b.duration_ms <= 1)::int, (b.duration_ms > 1 AND b.duration_ms <= 2)::int,
           (b.duration_ms > 2 AND b.duration_ms <= 5)::int, (b.duration_ms > 5 AND b.duration_ms <= 10)::int,
           (b.duration_ms > 10 AND b.duration_ms <= 20)::int, (b.duration_ms > 20 AND b.duration_ms <= 50)::int
    FROM base b
    WHERE b.duration_ms IS NOT NULL AND b.duration_ms <= 50
  ),
  fast_total AS (
    SELECT f.name, sum(f.n) AS n_fast, sum(f.b1) AS b1, sum(f.b2) AS b2, sum(f.b3) AS b3,
           sum(f.b4) AS b4, sum(f.b5) AS b5, sum(f.b6) AS b6
    FROM fast f GROUP BY f.name
  ),
  slow AS (
    SELECT b.name, count(*) AS n_slow, array_agg(b.duration_ms ORDER BY b.duration_ms) AS ms
    FROM base b
    WHERE b.duration_ms IS NOT NULL AND b.duration_ms > 50
    GROUP BY b.name
  ),
  t AS (
    SELECT coalesce(f.name, s.name) AS name,
           coalesce(f.n_fast, 0) AS n_fast, coalesce(s.n_slow, 0) AS n_slow,
           coalesce(f.b1, 0) AS b1, coalesce(f.b2, 0) AS b2, coalesce(f.b3, 0) AS b3,
           coalesce(f.b4, 0) AS b4, coalesce(f.b5, 0) AS b5, coalesce(f.b6, 0) AS b6,
           s.ms
    FROM fast_total f FULL JOIN slow s ON s.name = f.name
  ),
  ranked AS (
    SELECT t.*, q.p, ceil(q.p * (t.n_fast + t.n_slow))::bigint AS rank
    FROM t CROSS JOIN (VALUES (0.50), (0.75), (0.90), (0.95), (0.99)) AS q(p)
    WHERE t.n_fast + t.n_slow > 0
  )
  SELECT r.name,
         r.n_fast + r.n_slow,
         r.n_slow,
         r.p,
         CASE WHEN r.rank <= r.n_fast THEN 'bucket' ELSE 'exact' END,
         CASE
           WHEN r.rank <= r.n_fast THEN
             CASE
               WHEN r.rank <= r.b1                                  THEN 1
               WHEN r.rank <= r.b1 + r.b2                           THEN 2
               WHEN r.rank <= r.b1 + r.b2 + r.b3                    THEN 5
               WHEN r.rank <= r.b1 + r.b2 + r.b3 + r.b4             THEN 10
               WHEN r.rank <= r.b1 + r.b2 + r.b3 + r.b4 + r.b5      THEN 20
               ELSE 50
             END
           ELSE r.ms[(r.rank - r.n_fast)::int]
         END::double precision
  FROM ranked r
  ORDER BY r.name, r.p
$$;

-- ── perf_errors ──────────────────────────────────────────────────────────────────────────────────

CREATE FUNCTION public.perf_errors(p_since timestamptz, p_env text, p_version text)
RETURNS TABLE (
  name text, kind text, count bigint, median_ms double precision, max_ms double precision,
  first_seen timestamptz, last_seen timestamptz
)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public AS $$
  SELECT e.name,
         coalesce(e.error_kind, 'unknown'),
         count(*),
         percentile_cont(0.5) WITHIN GROUP (ORDER BY e.duration_ms),
         max(e.duration_ms),
         min(e.received_at),
         max(e.received_at)
  FROM public."PerfEvents" e
  WHERE e.outcome = 'error' AND e.received_at >= p_since AND e.env = p_env
    AND (p_version IS NULL OR e.app_version = p_version)
  GROUP BY e.name, coalesce(e.error_kind, 'unknown')
  ORDER BY count(*) DESC, e.name
$$;

-- ── perf_health: the telemetry's own state ───────────────────────────────────────────────────────
-- The first three figures follow the filters; the table's rows, oldest, newest and size are the
-- whole table's. One row for a developer, no row for anyone else: the table's size is not theirs.

CREATE FUNCTION public.perf_health(p_since timestamptz, p_env text, p_version text)
RETURNS TABLE (
  events bigint, dropped bigint, loads bigint,
  table_rows bigint, oldest timestamptz, newest timestamptz, size_bytes bigint
)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public AS $$
  SELECT
    (SELECT count(*) FROM public."PerfEvents" e
      WHERE e.received_at >= p_since AND e.env = p_env AND (p_version IS NULL OR e.app_version = p_version)),
    (SELECT coalesce(sum((e.attrs ->> 'dropped')::bigint), 0) FROM public."PerfEvents" e
      WHERE e.name = 'app.telemetry_dropped' AND e.received_at >= p_since AND e.env = p_env
        AND (p_version IS NULL OR e.app_version = p_version)),
    (SELECT count(*) FROM public."PerfEvents" e
      WHERE e.name = 'app.start' AND e.received_at >= p_since AND e.env = p_env
        AND (p_version IS NULL OR e.app_version = p_version)),
    (SELECT count(*) FROM public."PerfEvents"),
    (SELECT min(received_at) FROM public."PerfEvents"),
    (SELECT max(received_at) FROM public."PerfEvents"),
    pg_total_relation_size('public."PerfEvents"')
  WHERE public.get_user_roles() && ARRAY['developer']::text[]
$$;

-- ── perf_breakdown: one metric split by who and where ────────────────────────────────────────────
-- An ordinary metric: by role, device class, OS and browser, with percentiles. A sqlite.* metric:
-- by op and by tables, as calls, slow calls and the slowest call seen, and NO percentiles: its
-- fast calls are only known to a bucket, so a percentile per slice would be invented precision.

CREATE FUNCTION public.perf_breakdown(p_metric text, p_since timestamptz, p_env text, p_version text)
RETURNS TABLE (
  dimension text, value text, n bigint, errors bigint,
  p50 double precision, p95 double precision, p99 double precision,
  calls bigint, slow_calls bigint, max_ms double precision
)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public AS $$
  WITH base AS (
    SELECT * FROM public."PerfEvents" e
    WHERE e.name = p_metric AND e.received_at >= p_since AND e.env = p_env
      AND (p_version IS NULL OR e.app_version = p_version)
  ),
  sliced AS (
    SELECT 'role'::text AS dimension, r AS value, b.outcome, b.duration_ms
      FROM base b, unnest(coalesce(b.roles, ARRAY['(unknown)'])) AS r
      WHERE b.duration_ms IS NOT NULL
    UNION ALL
    SELECT 'device_class', coalesce(b.device_class, '(unknown)'), b.outcome, b.duration_ms
      FROM base b WHERE b.duration_ms IS NOT NULL
    UNION ALL
    SELECT 'os', coalesce(b.os, '(unknown)'), b.outcome, b.duration_ms
      FROM base b WHERE b.duration_ms IS NOT NULL
    UNION ALL
    SELECT 'browser', coalesce(b.browser, '(unknown)'), b.outcome, b.duration_ms
      FROM base b WHERE b.duration_ms IS NOT NULL
  ),
  sqlite_sliced AS (
    SELECT d.dimension, coalesce(nullif(b.attrs ->> d.key, ''), '(none)') AS value,
           b.outcome, b.duration_ms,
           CASE WHEN b.duration_ms IS NULL THEN (b.attrs ->> 'count')::bigint ELSE 1 END AS calls,
           CASE WHEN b.duration_ms > 50 THEN 1 ELSE 0 END AS slow,
           CASE WHEN b.duration_ms IS NULL THEN (b.attrs ->> 'maxMs')::double precision ELSE b.duration_ms END AS max_ms
    FROM base b CROSS JOIN (VALUES ('op', 'op'), ('tables', 'tables')) AS d(dimension, key)
    WHERE p_metric LIKE 'sqlite.%'
  )
  SELECT s.dimension, s.value, count(*), count(*) FILTER (WHERE s.outcome = 'error'),
         percentile_cont(0.50) WITHIN GROUP (ORDER BY s.duration_ms),
         percentile_cont(0.95) WITHIN GROUP (ORDER BY s.duration_ms),
         percentile_cont(0.99) WITHIN GROUP (ORDER BY s.duration_ms),
         NULL::bigint, NULL::bigint, NULL::double precision
  FROM sliced s
  WHERE p_metric NOT LIKE 'sqlite.%'
  GROUP BY s.dimension, s.value
  UNION ALL
  SELECT q.dimension, q.value, sum(q.calls), count(*) FILTER (WHERE q.outcome = 'error'),
         NULL, NULL, NULL,
         sum(q.calls), sum(q.slow), max(q.max_ms)
  FROM sqlite_sliced q
  GROUP BY q.dimension, q.value
  ORDER BY 1, 3 DESC, 2
$$;

-- Supabase grants EXECUTE on new functions to anon and PUBLIC by default; take it back.
REVOKE EXECUTE ON FUNCTION
  public.perf_versions(timestamptz, text),
  public.perf_percentiles(timestamptz, text, text),
  public.perf_sqlite(timestamptz, text, text),
  public.perf_errors(timestamptz, text, text),
  public.perf_health(timestamptz, text, text),
  public.perf_breakdown(text, timestamptz, text, text)
FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION
  public.perf_versions(timestamptz, text),
  public.perf_percentiles(timestamptz, text, text),
  public.perf_sqlite(timestamptz, text, text),
  public.perf_errors(timestamptz, text, text),
  public.perf_health(timestamptz, text, text),
  public.perf_breakdown(text, timestamptz, text, text)
TO authenticated;
