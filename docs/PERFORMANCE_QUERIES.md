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
