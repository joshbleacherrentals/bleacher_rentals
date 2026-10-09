# Performance queries

SQL for the real-user performance events in `public."PerfEvents"`. Run it in Supabase Studio
(SQL editor); the app has no dashboard. Spec:
[docs/specs/perf-telemetry-pipeline.md](specs/perf-telemetry-pipeline.md).

## Read this first

- **Events are 100% of what the browsers recorded**, not a sample. Slow events and errors are
  **not** removed from any percentile below.
- **A percentile needs enough rows.** Every query prints `n` and a `note`. A P99 over fewer than
  100 rows, or a P95 over fewer than 20, is a number but not a measurement; do not act on it.
- **The table is `UNLOGGED`.** After a Postgres crash it comes back empty, and it is not in
  backups. A gap in the graph can be that, not a quiet week.
- **Raw events are kept 30 days** (the `prune-perf-events` cron job).
- **Filter by `received_at`, not `event_at`.** `event_at` is the browser's wall clock and can be
  wrong; `received_at` is the server's.
- **Filter by `env`.** `production` is real users; `development` is developers' machines and
  the Playwright dev server.
- **`duration_ms` is `NULL` for count events.** The queries that need a duration exclude them.

## 1. P50 / P75 / P90 / P95 / P99 per metric

The headline view. Change the interval and the `env`.

```sql
SELECT
  name,
  app_version,
  count(*)                                              AS n,
  count(*) FILTER (WHERE outcome = 'error')             AS errors,
  round(percentile_cont(0.50) WITHIN GROUP (ORDER BY duration_ms)::numeric, 1) AS p50_ms,
  round(percentile_cont(0.75) WITHIN GROUP (ORDER BY duration_ms)::numeric, 1) AS p75_ms,
  round(percentile_cont(0.90) WITHIN GROUP (ORDER BY duration_ms)::numeric, 1) AS p90_ms,
  round(percentile_cont(0.95) WITHIN GROUP (ORDER BY duration_ms)::numeric, 1) AS p95_ms,
  round(percentile_cont(0.99) WITHIN GROUP (ORDER BY duration_ms)::numeric, 1) AS p99_ms,
  round(max(duration_ms)::numeric, 1)                   AS max_ms,
  CASE
    WHEN count(*) < 20  THEN 'too few rows: P95 and P99 not meaningful'
    WHEN count(*) < 100 THEN 'P99 not meaningful (n < 100)'
  END                                                   AS note
FROM public."PerfEvents"
WHERE received_at > now() - interval '7 days'
  AND env = 'production'
  AND duration_ms IS NOT NULL
  AND name NOT LIKE 'sqlite.%' -- these are individual slow calls only: see section 8
GROUP BY name, app_version
ORDER BY name, app_version;
```

## 2. Where is the delay: every stage side by side

The metric names are `domain.thing`; ordering by domain lines the stages up in the order of
the request (`app`, `sqlite`, `powersync`, `sync`, `ui`). The bottleneck is the row with the
largest P95 that also has a meaningful `n`.

```sql
SELECT
  split_part(name, '.', 1)                               AS domain,
  name,
  count(*)                                               AS n,
  round(percentile_cont(0.50) WITHIN GROUP (ORDER BY duration_ms)::numeric, 1) AS p50_ms,
  round(percentile_cont(0.95) WITHIN GROUP (ORDER BY duration_ms)::numeric, 1) AS p95_ms,
  round(percentile_cont(0.99) WITHIN GROUP (ORDER BY duration_ms)::numeric, 1) AS p99_ms,
  CASE WHEN count(*) < 100 THEN 'few rows' END            AS note
FROM public."PerfEvents"
WHERE received_at > now() - interval '7 days'
  AND env = 'production'
  AND duration_ms IS NOT NULL
  AND name NOT LIKE 'sqlite.%' -- these are individual slow calls only: see section 8
GROUP BY name
ORDER BY array_position(ARRAY['app','sqlite','powersync','sync','ui'], split_part(name, '.', 1)),
         name;
```

## 3. Split by role, device and browser

`roles` is the array of the user's roles (null before access was known), so a user with two
roles counts once under each of them in the first query. Replace `'sync.initial'` with the
metric to look at.

```sql
-- by role
SELECT
  r AS role,
  count(*) AS n,
  round(percentile_cont(0.50) WITHIN GROUP (ORDER BY duration_ms)::numeric, 1) AS p50_ms,
  round(percentile_cont(0.95) WITHIN GROUP (ORDER BY duration_ms)::numeric, 1) AS p95_ms,
  round(percentile_cont(0.99) WITHIN GROUP (ORDER BY duration_ms)::numeric, 1) AS p99_ms
FROM public."PerfEvents", unnest(coalesce(roles, ARRAY['(unknown)'])) AS r
WHERE name = 'sync.initial'
  AND received_at > now() - interval '30 days'
  AND env = 'production'
  AND duration_ms IS NOT NULL
GROUP BY r
ORDER BY p95_ms DESC;

-- by device class, OS and browser
SELECT
  device_class, os, browser,
  count(*) AS n,
  round(percentile_cont(0.50) WITHIN GROUP (ORDER BY duration_ms)::numeric, 1) AS p50_ms,
  round(percentile_cont(0.95) WITHIN GROUP (ORDER BY duration_ms)::numeric, 1) AS p95_ms
FROM public."PerfEvents"
WHERE name = 'sync.initial'
  AND received_at > now() - interval '30 days'
  AND env = 'production'
  AND duration_ms IS NOT NULL
GROUP BY device_class, os, browser
ORDER BY p95_ms DESC;
```

## 4. Errors next to the durations

A slow span with an error is a different problem from a slow span without one.

```sql
SELECT
  name,
  error_kind,
  count(*)                                               AS errors,
  round(percentile_cont(0.50) WITHIN GROUP (ORDER BY duration_ms)::numeric, 1) AS p50_ms,
  round(max(duration_ms)::numeric, 1)                    AS max_ms,
  min(received_at)                                       AS first_seen,
  max(received_at)                                       AS last_seen
FROM public."PerfEvents"
WHERE outcome = 'error'
  AND received_at > now() - interval '7 days'
  AND env = 'production'
GROUP BY name, error_kind
ORDER BY errors DESC;
```

## 5. Is telemetry itself healthy?

`app.telemetry_dropped` is recorded when a browser had to throw events away (its buffer is 500) or the server refused a batch for good.

```sql
SELECT
  date_trunc('day', received_at) AS day,
  count(*)                       AS drop_reports,
  sum((attrs ->> 'dropped')::int) AS events_dropped
FROM public."PerfEvents"
WHERE name = 'app.telemetry_dropped'
  AND received_at > now() - interval '14 days'
GROUP BY 1
ORDER BY 1 DESC;
```

## 6. How big is the table?

```sql
SELECT
  count(*)                                   AS rows,
  min(received_at)                           AS oldest,
  max(received_at)                           AS newest,
  pg_size_pretty(pg_total_relation_size('public."PerfEvents"')) AS size
FROM public."PerfEvents";
```

## 7. Did the nightly delete run?

```sql
SELECT status, start_time, end_time, return_message
FROM cron.job_run_details
WHERE command LIKE '%PerfEvents%'
ORDER BY start_time DESC
LIMIT 10;
```

## 8. SQLite calls: percentiles from the aggregate and the slow calls

In production a `sqlite.*` call is recorded one of two ways: a call of **more than 50 ms**, or one
that **failed**, is an event with its own `duration_ms`; every other call is only counted, in an
aggregate event (`duration_ms` is `NULL`, with `count` and the duration buckets `b1` to `b6`:
up to 1, 2, 5, 10, 20 and 50 ms). So sections 1 and 2 would show only the slow calls for these
names, which is why they leave them out.

This query puts the two together. A percentile that falls among the fast calls is **only known
to a bucket** and is printed as such (`<= 5 ms`); a percentile that falls among the slow calls is
exact. The call counts per bucket come from the aggregates plus the failed calls that were fast.

```sql
WITH win AS (SELECT now() - interval '7 days' AS since),
fast AS (
  -- the aggregates ...
  SELECT name,
         (attrs ->> 'count')::bigint AS n,
         (attrs ->> 'b1')::bigint AS b1, (attrs ->> 'b2')::bigint AS b2,
         (attrs ->> 'b3')::bigint AS b3, (attrs ->> 'b4')::bigint AS b4,
         (attrs ->> 'b5')::bigint AS b5, (attrs ->> 'b6')::bigint AS b6
  FROM public."PerfEvents", win
  WHERE name LIKE 'sqlite.%' AND env = 'production' AND received_at > win.since
    AND duration_ms IS NULL AND attrs ? 'count'
  UNION ALL
  -- ... and the individual calls that were not slow (failures), placed in their bucket
  SELECT name, 1,
         (duration_ms <= 1)::int, (duration_ms > 1 AND duration_ms <= 2)::int,
         (duration_ms > 2 AND duration_ms <= 5)::int, (duration_ms > 5 AND duration_ms <= 10)::int,
         (duration_ms > 10 AND duration_ms <= 20)::int, (duration_ms > 20 AND duration_ms <= 50)::int
  FROM public."PerfEvents", win
  WHERE name LIKE 'sqlite.%' AND env = 'production' AND received_at > win.since
    AND duration_ms IS NOT NULL AND duration_ms <= 50
),
fast_total AS (
  SELECT name, sum(n) AS n_fast, sum(b1) AS b1, sum(b2) AS b2, sum(b3) AS b3,
         sum(b4) AS b4, sum(b5) AS b5, sum(b6) AS b6
  FROM fast GROUP BY name
),
slow AS (
  SELECT name, count(*) AS n_slow, array_agg(duration_ms ORDER BY duration_ms) AS ms
  FROM public."PerfEvents", win
  WHERE name LIKE 'sqlite.%' AND env = 'production' AND received_at > win.since
    AND duration_ms IS NOT NULL AND duration_ms > 50
  GROUP BY name
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
  SELECT t.*, p.p, ceil(p.p * (t.n_fast + t.n_slow))::bigint AS rank
  FROM t CROSS JOIN (VALUES (0.50), (0.75), (0.90), (0.95), (0.99)) AS p(p)
  WHERE t.n_fast + t.n_slow > 0
)
SELECT name,
       n_fast + n_slow AS calls,
       n_slow          AS slow_calls,
       p               AS percentile,
       CASE
         WHEN rank <= n_fast THEN
           '<= ' || CASE
             WHEN rank <= b1                               THEN '1'
             WHEN rank <= b1 + b2                          THEN '2'
             WHEN rank <= b1 + b2 + b3                     THEN '5'
             WHEN rank <= b1 + b2 + b3 + b4                THEN '10'
             WHEN rank <= b1 + b2 + b3 + b4 + b5           THEN '20'
             ELSE '50'
           END || ' ms (bucket)'
         ELSE round(ms[rank - n_fast]::numeric, 1)::text || ' ms'
       END AS value,
       CASE WHEN n_fast + n_slow < 100 THEN 'few calls' END AS note
FROM ranked
ORDER BY name, p;
```

For one `op` or one set of `tables`, add `AND attrs ->> 'op' = 'update'` (or `'tables' = 'Events'`) to the
four `WHERE` clauses.
