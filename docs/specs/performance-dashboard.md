# Performance dashboard — /dev-tools/performance

Status: **IMPLEMENTED 2026-10-09, awaiting review** (approved the same day; filters in the address
added at approval) — 0 open decisions (D1–D6 answered by the user). Not opened in a browser by me
(Clerk sign-in is unavailable here); the migration is applied to no database, only dry-run in a
rolled-back transaction on the local one. What differs from the text above is in §10.
Request (user, 2026-10-09): "create a new page at /dev-tools/performance showing all the
statistics we need. Only a developer may see the page, and the table too. Maybe not through
PowerSync, but straight from the database."
Branch: `q4-sprint1-finance-role`.
Builds on: [perf-telemetry-pipeline.md](perf-telemetry-pipeline.md) (the `PerfEvents` table),
[perf-sqlite.md](perf-sqlite.md) (the aggregate the SQLite block reads) and
[../PERFORMANCE_QUERIES.md](../PERFORMANCE_QUERIES.md) (the queries this page turns into
functions).

## 0. The request, and what it is not

**The page** shows what the telemetry collected, to developers only, read **directly from
Supabase** — not through PowerSync, so it works the same whether or not the local database is
healthy, and it does not add a synced table.

**Decided by the user (2026-10-09):**

- **Data path (D1):** straight from Supabase with a **row-level-security policy** and **SQL
  functions** called through the Supabase client. No API route in between.
- **Blocks (D2):** percentiles with the stages side by side; errors with the telemetry's own
  health; SQLite calls; breakdowns.
- **Filters (D3):** period, environment, app version.
- **Refresh (D4):** one load when the page opens, and a Refresh button.
- **Three more things the user asked for:**
  - **A shared time range** for every block.
  - **Sample size beside every percentile** (the number of events behind it), so a number
    that rests on few events is seen to.
  - **From problem to cause:** a click on a metric opens its breakdown (D6).
- **Starting values (D5):** 7 days, production, all versions. The period switch offers
  24 hours, 7 days and 30 days (30 is the retention).
- **Click behaviour (D6):** the metric goes in the address (`?metric=`).
- **Filters in the address too (user, at approval):** `period`, `env`, `version` and `metric` are
  all in the query string, so a link reproduces exactly what was on screen.

**Not part of this spec, so not changed:** what is collected; the telemetry table's
retention; `ui.page_ready`, `sync_scope`, the canary for delta sync (each its own spec); any
chart (the page is tables); alerts or thresholds; exporting data.

**To confirm at review (my reading of the request):**

- **C1.** "The table too" means the **data** (`PerfEvents`) is readable only by a developer,
  as well as the page. Today no API role can read it; after this spec exactly the developer
  role can, and nobody else.
- **C2.** The page reuses the existing `developerGate` of Allowed Emails rather than a third
  copy of the same check (`syncHealthGate` is already an identical twin).
- **C3.** A "Performance" entry is added to the Dev Tools section of the sidebar, as every
  other `/dev-tools` page has one.

## 1. Who can see what

- **The page:** an active developer. Everyone else is redirected, exactly as Allowed Emails
  does. This only keeps others from seeing an empty page.
- **The data (the real fence):** a policy on `PerfEvents`, and the functions below, which run
  with the caller's rights (`SECURITY INVOKER`), so the policy applies inside them. A
  non-developer who calls a function gets empty results; `anon` cannot call them at all.
- **The policy** uses the repo's existing check, `public.get_user_roles() && ARRAY['developer']`,
  the same as `DevAllowedEmails`. It is `SELECT` only: no role can insert, update or delete
  through the API. The only writer stays `/api/telemetry` with the service-role key.
- **After this spec** a developer can also read raw `PerfEvents` rows through the Supabase
  REST API, not only through the page. They are the people who can already open Supabase Studio.

## 2. The functions

All `LANGUAGE sql`, `STABLE`, `SECURITY INVOKER`, `SET search_path = public`; `EXECUTE`
revoked from `public` and `anon`, granted to `authenticated`. Every one takes
`p_since timestamptz` (the start of the period), `p_env text`, and `p_version text`
(`NULL` = all versions), and filters on `received_at`, not `event_at`.

- **`perf_versions(p_since, p_env)`** — the app versions seen in the period, newest first, with
  their event counts. Fills the version filter.
- **`perf_percentiles(...)`** — one row per metric that has durations: `name`, `n`, `errors`,
  `p50`, `p75`, `p90`, `p95`, `p99`, `max_ms`. Leaves out `sqlite.*` (see below) and count
  events (`duration_ms IS NULL`). Errors stay **in** the percentiles.
- **`perf_sqlite(...)`** — the section-8 query of the queries document as a function: per
  `sqlite.*` metric, `calls`, `slow_calls`, and for each of the five percentiles either a
  bucket edge (`<= 5 ms`, when it falls among the fast calls) or an exact value (when it falls
  among the slow ones).
- **`perf_errors(...)`** — per `name` and `error_kind`: `errors`, `median_ms`, `max_ms`,
  `first_seen`, `last_seen`.
- **`perf_health(...)`** — events in the period; events a browser reported dropping
  (`app.telemetry_dropped`); rows in the table; oldest and newest `received_at`; the table's
  size in bytes.
- **`perf_breakdown(p_metric text, ...)`** — for one metric, rows of `dimension`
  (`role`, `device_class`, `os`, `browser`) and `value`, with `n`, `errors`, `p50`, `p95`,
  `p99`. For a `sqlite.*` metric the dimensions are `op` and `tables` and the columns are
  `calls`, `slow_calls` and `max_ms` only: its fast calls are known to a bucket, so a
  percentile per `op` would be invented precision.

`p_since` is computed on the client from the period (24 hours, 7 days, 30 days), so the
functions stay pure and testable with fixed dates.

## 3. The page

**Header:** the breadcrumb and a one-line description. **Filter bar:** Period (three buttons),
Environment (production / development), Version ("All versions" plus the versions the period
has), a **Refresh** button and "Updated hh:mm:ss". Changing a filter reloads every block.

**Block A — Metrics.** One table, rows grouped by stage in the order the request gave
(`app`, `sqlite`'s open, `powersync`, `sync`, `ui`): Metric, **n**, P50, P75, P90, P95, P99,
Max, Errors. A value that rests on too few events is shown muted with a "few events" hint:
P95 below 20 events, P99 below 100 (the thresholds of the queries document). Each row is
clickable (D6).

**Block B — SQLite calls.** One table, the three `sqlite.*` metrics: Metric, Calls, Slow calls
(> 50 ms), then the five percentiles, each either `≤ 5 ms` (a bucket) or an exact figure, with
a short note saying why. Clickable like Block A.

**Block C — Errors.** Metric, kind, count, median, max, first and last seen.

**Block D — Telemetry health.** Events in the period, events dropped, rows, oldest, newest,
size. If the table is empty it says so plainly (the table is `UNLOGGED`: after a Postgres
crash it starts empty, which looks like a quiet week).

**Block E — Breakdowns.** Shown when `?metric=` names a metric. By role, device class, OS and
browser (for `sqlite.*`: by op and by tables), with its own heading, the metric's name and a
**Clear** control. With no metric chosen it says "Choose a metric above".

**What a click does (D6):** it sets `?metric=<name>` in the address (`router.replace`, no
scroll jump), highlights the row, and Block E loads that metric's breakdown. An unknown or
missing metric in the address shows no breakdown and no error. The whole view is in the address:
`?period=24h|7d|30d&env=production|development&version=<x>&metric=<name>`. A value equal to
its starting value (D5) is left out, so the plain page has a plain address; anything missing,
unknown or malformed in the address falls back to the starting value (and an unknown `metric`
shows no breakdown and no error). Changing a filter uses `router.replace`, so Back does not
step through every filter click. The link can be sent to a colleague, who sees the same view
(they must be a developer).

## 4. Types

```ts
type PerformancePeriod = "24h" | "7d" | "30d";
type PerformanceFilters = {
  period: PerformancePeriod;
  env: "production" | "development";
  version: string | null; // null = all versions
};

type MetricRow = {
  name: string;
  n: number;
  errors: number;
  p50: number;
  p75: number;
  p90: number;
  p95: number;
  p99: number;
  maxMs: number;
};
type SqliteRow = {
  name: string;
  calls: number;
  slowCalls: number;
  percentiles: Array<{
    p: 0.5 | 0.75 | 0.9 | 0.95 | 0.99;
    kind: "bucket" | "exact";
    value: number;
  }>; // bucket: the edge in ms
};
type ErrorRow = {
  name: string;
  kind: string;
  count: number;
  medianMs: number | null;
  maxMs: number | null;
  firstSeen: string;
  lastSeen: string;
};
type HealthRow = {
  events: number;
  dropped: number;
  rows: number;
  oldest: string | null;
  newest: string | null;
  sizeBytes: number;
};
type BreakdownRow = {
  dimension: string;
  value: string;
  n: number;
  errors: number;
  p50: number | null;
  p95: number | null;
  p99: number | null;
  calls?: number;
  slowCalls?: number;
  maxMs?: number;
};
```

All durations are milliseconds. The functions' return types are written by hand into
`database.types.ts` (never `npm run gtl` while the local database lags the migrations).

## 5. Edge cases

- **No events** (new install, empty table, a quiet filter): each block says "No events for
  this period and environment" instead of an empty grid.
- **Offline or a Supabase error:** a message that the page needs a connection, with the error
  kind only (the same classifier as the telemetry); the Refresh button retries. Nothing is
  cached.
- **Statement timeout** (Supabase allows an authenticated query about 8 seconds): reported as
  "the query took too long; try a shorter period", not as a generic failure. Not a concern at
  today's volume; it is the cost of D1 as volumes grow.
- **A version that is no longer in the period** (the period was changed): the filter falls back
  to "All versions".
- **A developer who is deactivated mid-session:** the next request returns nothing and the
  page shows the empty state; the gate redirects on the next navigation.
- **Rounding:** durations are shown to one decimal under 100 ms and as whole milliseconds
  above; counts with thousands separators.
- **Slow first paint:** the six functions are requested together and each block fills as its
  own request returns.

## 6. Permissions

[permissionPageData.ts](../../src/features/userAccess/permissionPageData.ts) is updated in the
same commit: the **Dev Tools** row names Performance among the developer-only pages, as Sync
Health and Allowed Emails are. Admin and viewer keep their existing wording and gain the same
sentence ("Performance is for developers only"); no other role changes.

## 7. Tests

- **SQL (pgTAP, rolled-back transaction, local container):**
  - an active developer reads `PerfEvents` and every function returns the sample data;
  - an admin, an account manager, a viewer, an accountant, a driver, a user with no role and an
    inactive developer read **zero rows** and get empty results from every function;
  - `anon` cannot execute any function; no role can insert, update or delete through the API;
  - the percentiles equal a hand-computed set; errors stay in them; `sqlite.*` is absent from
    `perf_percentiles`;
  - `perf_sqlite` on 103 sample calls gives the bucket and the exact value found by hand
    (the case already checked in the queries document);
  - the version and environment filters change the result; `p_version = NULL` means all;
  - mutation run: a policy `USING (true)` makes the "reads zero rows" tests go red.
- **Vitest (pure logic):** period to `p_since`; grouping and ordering by stage; the "few
  events" thresholds; bucket versus exact formatting; the duration formatter; reading and
  writing the address (all four values, starting values left out, malformed values fall back,
  an unknown metric is ignored); the version fallback.
- **Vitest (render):** the page's states through `renderToStaticMarkup` — loading, empty,
  error, populated, a metric chosen — and that a non-developer sees nothing of the data.
- **Playwright:** none. There is no developer project in the Playwright configuration, and the
  standing rule is not to run E2E locally; the final report marks it SKIPPED.

## 8. Files

- **Created:** `supabase/migrations/20261009120000_perf_dashboard.sql` (the policy and the
  functions), `src/app/dev-tools/performance/page.tsx`,
  `src/features/performanceStats/components/PerformancePage.tsx`,
  `.../components/StatTables.tsx`, `.../components/Breakdowns.tsx`,
  `.../hooks/usePerformanceStats.ts`, `.../logic/stats.ts` (periods, grouping, formatting,
  URL state).
- **Edited:** `src/components/sidebar/useSidebarItems.ts`.
- **Not counted:** tests (`supabase/tests/perf_dashboard.test.sql`, the Vitest files, the
  sidebar test's list), `database.types.ts`, `permissionPageData.ts`.
- **Counted: 8.**

## 9. Decisions (all answered)

- **D1.** How the page reads the data. Options: an API route that checks the developer role on
  the server and reads with the service-role key; or an RLS policy plus SQL functions called
  through the Supabase client. **User's answer:** straight to Supabase with RLS and functions,
  asked as "can't we go directly to Supabase with RLS?". Consequences stated before the
  choice: the policy follows the existing `DevAllowedEmails` pattern; the table becomes
  readable by developers through the REST API; the statement timeout; production needs the
  migration applied.
- **D2.** The blocks. **User's answer:** percentiles with the stages side by side; errors with
  telemetry health; SQLite calls; breakdowns; plus a shared time range, a sample size beside
  every percentile, and drill-down from a problem to its cause.
- **D3.** The filters. Options: fixed 7 days and production; period and environment; period,
  environment and version. **User's answer:** period, environment and version.
- **D4.** Refresh. Options: on open plus a button; auto-refresh every 30 s. **User's answer:**
  on open plus a button.
- **D5.** The starting filters. Options: 7 days, production, all versions; 24 hours,
  production, the latest version; 30 days, production, all versions. **User's answer:**
  7 days, production, all versions.
- **D6.** What a click on a metric does, and (user, at approval) where the filters live. Options: a panel under the table; the metric in the
  address; only a highlighted row. **User's answer:** the metric in the address (`?metric=`); at approval, the filters too.

## 10. What differs from the text above

- **`perf_health` also returns `loads`** (the number of `app.start` events in the view), and the
  health block shows it as "Page loads". Without it the sample sizes beside the percentiles
  have no denominator.
- **A non-developer gets no row at all from `perf_health`**, not a row of zeros: its table size is
  not theirs to see, and the row's `WHERE` carries the same role check as the policy.
- **The nullable columns are written as nullable in `database.types.ts`** (a breakdown row has no
  percentile for a `sqlite.*` metric, an error row may have no duration), which the first draft
  of the types did not say.
- **The "version no longer in the period" fallback** runs when the list of versions arrives, and
  rewrites the address, so the address and the filter never disagree.
- **Admin and viewer** still reach `/dev-tools` by prefix, so they can open this URL; the page's
  gate redirects them and the database gives them nothing. The permissions page says
  "Performance is for developers only" for both.
- **An info icon beside every metric name** (user, after the first build): the Metrics, SQLite and
  Errors tables and the breakdown heading show an icon whose tooltip says what the metric times
  and where it starts and stops (`logic/metricInfo.ts`, one sentence for each of the 14 metrics,
  and a test that fails when a metric is added to the registry without one). The icon sits in
  clickable rows, so it stops its own click and key from selecting the row; its text is also its
  accessible name.
- **An info icon on every column heading too** (user, a second request): Metrics, SQLite calls,
  Errors and the breakdown tables. The text depends on the table, because the same heading means
  different things: a SQLite "P95" is a bucket or an exact figure, a metric's is interpolated
  (`logic/columnInfo.ts`; every heading of every table has a test for its text).
- **Files counted: 10** (the eight planned, `logic/metricInfo.ts` and `logic/columnInfo.ts`) (the migration, `page.tsx`, `PerformancePage.tsx`,
  `StatTables.tsx`, `Breakdowns.tsx`, `usePerformanceStats.ts`, `logic/stats.ts`,
  `useSidebarItems.ts`).
- **Verified:** `npm run tc`; the whole Vitest suite; the SQL test, 49 of 49 in a rolled-back
  transaction, and red for every non-developer test when a policy `USING (true)` is added.
  **Not verified:** the page in a browser as a developer; the functions through PostgREST with a
  Clerk token; the statement timeout at production volume; the migration on any database.
