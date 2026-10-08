# Performance telemetry — the pipeline: event, buffer, batch, table

Status: **AWAITING APPROVAL** — 0 open decisions (D1–D7 answered by the user).
Request (user, 2026-10-08): a minimal Performance Metrics + Monitoring + RUM system for
Supabase / PostgreSQL / PowerSync / local SQLite / Next.js. Measure first, find the
bottleneck second, optimise third. No second monitoring service, no personal data.
Branch: `q4-sprint1-finance-role`.
Builds on: [src/lib/perf/perfTrace.ts](../../src/lib/perf/perfTrace.ts) (kept; the
pipeline is a new module beside it, not a replacement).

This is spec 1 of 5. It builds the pipe and measures **nothing yet**. The metrics
themselves are specs 2–5 (§9), each blocked on this one.

## 0. The request, and what it is not

**Decided by the user (2026-10-08):**

- **Backend:** a Supabase table. No Sentry, no other service.
- **Volume:** 100% of events are stored, errors included. Slow events are **not**
  removed from percentile calculations.
- **Transport:** events are buffered on the client and sent in batches, not one HTTP
  request per event.
- **Percentiles:** P50, P75, P90, P95 and P99 per event name, computed in SQL.
- **Later, if volume grows:** session-based sampling or client-side histograms, decided
  on real traffic. Not built now.
- **Dashboard:** none yet. Percentiles are read with SQL queries kept in `docs/`.
- **Canary / delta sync:** a separate spec later. Not part of this one.

**Not part of this spec, so not changed:**

- any metric: no event is emitted by the app after this spec, only the API exists;
- `SystemProvider.tsx`, `BackendConnector.ts`, `typedQuery.ts`, `SignedInComponents.tsx`;
- the unconditional `LogLevel.DEBUG` in `SystemProvider.tsx` (spec 2 touches that file);
- PowerSync: `AppSchema.ts`, `sync_rules.yaml`, buckets. The table is **not** synced;
- the roles matrix: no role gains or loses a capability (§8).

**To confirm at review (my reading of the request):**

- **C1.** Only signed-in users send telemetry. `SystemProvider` renders nothing before
  sign-in, so no startup event exists for a signed-out visitor.
- **C2.** `session_id` is a random UUID per page load (one per tab), never a Clerk id.
- **C3.** A batch is capped at 100 events and 64 KB; the route refuses more (§6).

## 1. Naming

Metric names are `domain.thing`, lowercase, dot-separated. This spec fixes the
convention and the registry; specs 2–5 add the names.

- Domains: `app`, `sqlite`, `powersync`, `sync`, `ui`.
- Example: `powersync.connect`, `sync.initial`, `sqlite.query`, `ui.first_data`.
- A name outside the registry does not compile (`MetricName` is a union) and is refused
  by the route.
- Forbidden: `syncTime`, `powerSyncTime`, `initialLoad`, camelCase, spaces.

## 2. The event

One type, shared by the client and the route (`telemetryEvent.ts`).

```ts
// the registry is a const array: this spec adds "app.telemetry_dropped" (§11),
// specs 2-5 add the rest
export type MetricName = "app.telemetry_dropped";

export type Outcome = "ok" | "error";

export type PerfEvent = {
  name: MetricName;
  durationMs: number | null; // performance.now() difference; null for a pure count event
  outcome: Outcome;
  errorKind: string | null; // classified, never error.message (§7)
  at: number; // Date.now() at the end of the measured span (ordering only)
  sessionId: string; // C2
  tabRole: "leader" | "follower" | "unknown"; // multi-tab (Web Locks); see §11
  appVersion: string; // package.json version (D7)
  env: "development" | "production";
  browser: string; // family + major, e.g. "chrome 141"
  os: string; // family, e.g. "macos"
  deviceClass: "desktop" | "tablet" | "mobile";
  network: { effectiveType: string | null; rttMs: number | null } | null; // Chromium only
  roles: string[] | null; // WebRole[] (D3); null before access is resolved
  attrs: Record<string, number | string | boolean> | null; // metric-specific, flat
};
```

**Durations** come from `performance.now()`. `at` is a wall-clock timestamp used for
ordering and for the 30-day retention, never for a duration.

**`attrs`** holds only technical numbers and flags (`ops`, `buckets`, `cacheHit`). The
route accepts keys from a per-metric allow-list and drops the rest.

**`network`** is `navigator.connection` and exists only in Chromium. It is a coarse
channel hint (the RTT is rounded by the browser), not a PowerSync latency, and it is
never described as one.

## 3. The collector API (client)

New `src/lib/perf/metrics.ts`. It is the only place that calls `performance.now()` for
telemetry, so call sites never touch it.

- `metrics.start(name, attrs?)` returns a handle; `handle.end(extra?)` records an event
  with `outcome: "ok"`; `handle.fail(kind, extra?)` records `outcome: "error"`.
- `metrics.record(event)` records an already-measured duration (for spans that are
  measured elsewhere, e.g. from `performance.timeOrigin`).
- `metrics.count(name, attrs?)` records an event with `durationMs: null`.
- Context (`sessionId`, `appVersion`, `env`, browser, OS, device class, network, roles)
  is attached once at record time from `eventContext.ts`; the call site never builds it.
- **Development:** every event also goes to `console.debug` with the `PERF` badge that
  `perfTrace.ts` already uses. **Production:** no console output from this module.
- A call that throws inside the collector is swallowed. Telemetry must never break the
  app (§7).

`perfTrace.ts` stays as it is: it keeps its in-tab buffer, `window.perfLog`, the counters
and `nearestRank`. The new module does not duplicate any of them.

## 4. Buffer, batch, transport

New `telemetryTransport.ts`.

- **Buffer:** in memory, bounded at **500 events** (D6).
- **Flush triggers (D5):** every **10 s** (only if the buffer is not empty), **or** when
  the buffer reaches **50 events**, whichever comes first. One flush sends up to 100
  events (C3); a larger buffer drains over successive flushes.
- **Final flush:** on `visibilitychange` to `hidden` and on `pagehide`, using
  `navigator.sendBeacon` (`fetch` with `keepalive: true` where `sendBeacon` is missing).
  `sendBeacon` cannot read the response, so a final flush that fails is lost.
- **Request:** `POST /api/telemetry`, JSON body `{ events: PerfEvent[] }`, Clerk session
  cookie on the same origin. No token is placed in the body.
- **On failure (D6):** the events stay in the buffer and the next flush retries them.
  When the buffer is full, the **oldest** events are dropped first (FIFO). There is no
  persistence across a reload and no IndexedDB queue.
- **Timer:** started lazily on the first event; no mount point and no provider.
- **Offline:** a failed fetch is a failure like any other; the buffer holds up to its cap.

## 5. The table

New migration `supabase/migrations/20261008120000_perf_events.sql`.

```sql
CREATE UNLOGGED TABLE public."PerfEvents" (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  received_at   timestamptz NOT NULL DEFAULT now(),
  event_at      timestamptz NOT NULL,
  name          text        NOT NULL,
  duration_ms   double precision,
  outcome       text        NOT NULL CHECK (outcome IN ('ok', 'error')),
  error_kind    text,
  session_id    uuid        NOT NULL,
  tab_role      text        NOT NULL CHECK (tab_role IN ('leader', 'follower', 'unknown')),
  app_version   text        NOT NULL,
  env           text        NOT NULL,
  browser       text,
  os            text,
  device_class  text,
  network_type  text,
  rtt_ms        integer,
  roles         text[],
  attrs         jsonb
);
CREATE INDEX "PerfEvents_name_received_idx" ON public."PerfEvents" (name, received_at);
ALTER TABLE public."PerfEvents" ENABLE ROW LEVEL SECURITY;
-- no policy: the table is written and read only with the service-role key
```

- **`UNLOGGED` (D1).** The `powersync` publication is `FOR ALL TABLES`. A logged table
  would send every insert (and the daily delete) through the WAL and the PowerSync
  replication slot, loading the system being measured. An unlogged table is not written
  to the WAL and is **not** in the publication.
  - **Checked 2026-10-08** on the local database (Postgres 17.6) in a rolled-back
    transaction: a logged table appeared in `pg_publication_tables` for `powersync`, an
    unlogged one did not. The migration's verification repeats this on `PerfEvents`.
  - **Cost, accepted by the user:** the rows are truncated after a Postgres crash and
    are not in backups. For 30 days of telemetry that is a gap in the graph, not a loss
    of business data.
- **No RLS policy.** With RLS on and no policy, `anon` and `authenticated` see nothing.
  The route uses the service-role key (the existing pattern in
  `src/app/api/payments/history/route.ts`).
- **Not in PowerSync.** No entry in `AppSchema.ts` or `sync_rules.yaml`, so no device
  ever receives a row of this table.
- **`database.types.ts`** gets the new table by hand (never `npm run gtl` while the local
  database lags the migrations).

### Retention (D2)

The same migration schedules the delete with `pg_cron`, the way
`20260918150000_schedule_delete_past_alerts.sql` does:

```sql
SELECT cron.schedule(
  'prune-perf-events', '20 5 * * *',
  $$DELETE FROM public."PerfEvents" WHERE received_at < now() - interval '30 days';$$
);
```

## 6. The route

New `src/app/api/telemetry/route.ts`, `POST` only, `dynamic = "force-dynamic"`.

- **Auth:** `auth()` from Clerk; no `userId` returns 401. The `userId` is **not** stored.
- **Validation** (`telemetryEvent.ts`, shared with the client):
  - body is `{ events: [...] }`, 1 to 100 events, at most 64 KB; more returns 413;
  - `name` is in the registry; `outcome`, `tabRole`, `env`, `deviceClass` are in their
    sets; `durationMs` is a finite number between 0 and 3 600 000, or null;
  - `attrs` keys are on the metric's allow-list, values are number / string / boolean,
    strings at most 64 characters;
  - `roles` are `WebRole` values only;
  - one invalid event is dropped, the valid ones of the batch are kept; the response
    says how many were dropped. A batch with no valid event returns 400.
- **Write:** one `insert` of all valid rows with the service-role client.
- **Failure:** a database error returns 500; the client keeps the batch (§4).
- **Response size:** `{ accepted: number, dropped: number }`, nothing else.

## 7. Privacy and errors

**Never sent, by construction:**

- email, user id, Clerk id, tokens, cookies, IP-derived data (the route does not read it);
- SQL parameters, row contents, customer, order or payment data;
- `error.message` or a stack. `BackendConnector.uploadData` builds its message with
  `JSON.stringify(result)`, which can contain a row.

**`errorKind`** is a closed set produced by one function `classifyError(error)`:
`timeout`, `network`, `auth`, `http_4xx`, `http_5xx`, `pg:<sqlstate>`, `aborted`,
`unknown`. Anything else becomes `unknown`.

**Collector failures** (storage full, `sendBeacon` missing, a throw in the context
builder) are swallowed. A telemetry fault is never shown to the user and never changes
what the app does.

## 8. Permissions

No role gains or loses a capability, so [permissionPageData.ts](../../src/features/userAccess/permissionPageData.ts)
is not changed. Every signed-in role _sends_ events; no role _reads_ them in the app
(there is no dashboard). Reading is done by a developer in Supabase Studio. If a
dashboard is specified later, that spec asks the question and updates the matrix.

## 9. The five specs

- **1. This spec.** Event, collector, transport, table, route, retention.
- **2. PowerSync lifecycle.** `sqlite.open`, `powersync.connect`, `reconnect`,
  `disconnect`, `sync.initial`, `sync.catchup`. Blocked on a probe of the raw
  `statusChanged` sequence (does `hasSynced` survive a restart, does the ~40 s stream
  restart look like a reconnect, how the shared worker reports to several tabs). Also
  removes the unconditional `LogLevel.DEBUG` in production.
- **3. Connector.** `powersync.credentials`, `sync.upload`, `classifyError` at the call
  sites in `BackendConnector.ts`.
- **4. SQLite.** `sqlite.query`, `write`, `batch` in `typedQuery.ts` (there is no
  separate `tx`: the only write transaction is the batch). Development records each call;
  production records calls over 50 ms individually and the rest as one aggregate per key
  per 10 s (decided in spec 4). Its percentile query is added to
  `docs/PERFORMANCE_QUERIES.md` by spec 4.
- **5. UI.** `ui.first_data` in `useUserAccess.ts`, tagged `source: local|fallback`
  so the Supabase fallback does not pollute the local figure.

**Not measurable, said here so nobody expects them:** bytes received (the WebSocket is
invisible to Resource Timing and the SDK does not report it), rows and tables synced
(only operations and bucket counts exist), the Postgres commit time on the client, the
Postgres to PowerSync leg from the client, the duration of watched queries inside
`useQuery`.

## 10. Percentile queries

New `docs/PERFORMANCE_QUERIES.md` (D4): SQL the developer runs in Supabase Studio. No
view, no migration object.

- Per `name`, `app_version` and `env`: `count(*)` and
  `percentile_cont(ARRAY[0.5, 0.75, 0.9, 0.95, 0.99]) WITHIN GROUP (ORDER BY duration_ms)`
  over the last N days.
- `outcome = 'error'` counted separately, **not** removed from the percentile set.
- A grouping by `roles[1]` and by `device_class`.
- A query that lines the stages up (spec 2–4 names) in one result, which is the
  "where is the delay" view the request asks for.
- Each percentile is printed with its `count`: a P99 over a few dozen rows is flagged as
  not meaningful.

## 11. Edge cases

- **Clerk signed out mid-session:** the route returns 401; the client keeps the batch
  and retries; after sign-out `SystemProvider` unmounts and the buffer is lost with the
  page.
- **PowerSync offline:** telemetry does not use PowerSync, so it is independent of the
  sync being measured.
- **Several tabs (decided 2026-10-08, user):** every tab has its own buffer and
  `sessionId`. `tabRole` is `leader` for the one tab that currently holds the Web Lock
  `powersync-telemetry-leader`, `follower` for the others, and `unknown` where
  `navigator.locks` does not exist. The role is read **at the moment the event is
  recorded**, because it can change: when the leader closes the lock is released and
  another tab becomes leader. Which metrics only the leader records is in spec 2 (§1a);
  the rest are per tab.
- **Clock skew:** `at` is client wall-clock and can be wrong; `received_at` is the
  server's. The queries filter by `received_at`.
- **Buffer overflow:** FIFO drop; the number of dropped events is itself reported as a
  count event `app.telemetry_dropped` (name added to the registry by this spec).
- **`navigator.connection` absent (Firefox, Safari):** `network` is null.
- **Dev server / Playwright:** `env: "development"`; the route accepts it; rows are
  separable by `env`.

## 12. Tests

Written first (red), per the TDD rule.

- **Vitest, `telemetryEvent`:** accepts a valid event; refuses an unknown name, a
  negative or non-finite duration, an `attrs` key off the allow-list, a string over 64
  characters, a non-`WebRole` role.
- **Vitest, `metrics`:** `start/end` records a duration from `performance.now()`;
  `fail` records `outcome: "error"` with a classified kind; a throw inside the collector
  does not propagate; production writes nothing to the console.
- **Vitest, `classifyError`:** maps timeout, fetch failure, 401/403, 4xx, 5xx, a
  Postgres SQLSTATE, an abort; anything else is `unknown`; a message containing a row
  is never returned.
- **Vitest, transport (fake timers):** flush at 10 s; flush at 50 events; no flush on an
  empty buffer; a failed send keeps the events and the next flush retries; over 500
  events the oldest are dropped and the drop is counted; `hidden` triggers the final
  send.
- **Vitest, route:** 401 without a session; 413 over the cap; a batch with one bad event
  stores the rest and reports `dropped: 1`; no `userId` appears in the inserted rows.
- **SQL, rolled-back transaction in the local container:** the table is `UNLOGGED`
  (`relpersistence = 'u'`); it is absent from `pg_publication_tables` for `powersync`;
  `anon` and `authenticated` get zero rows and cannot insert; the retention statement
  deletes a row older than 30 days and keeps a newer one.
- **Playwright:** none. The pipeline has no screen. Per the standing rule E2E is not run
  locally; the final report marks it SKIPPED with this reason.

## 13. Files

- **Created:** `src/lib/perf/telemetryEvent.ts`, `src/lib/perf/metrics.ts`,
  `src/lib/perf/telemetryTransport.ts`, `src/lib/perf/eventContext.ts`,
  `src/lib/perf/classifyError.ts`, `src/app/api/telemetry/route.ts`,
  `supabase/migrations/20261008120000_perf_events.sql`, `docs/PERFORMANCE_QUERIES.md`.
- **Edited:** `database.types.ts` (by hand), `next.config.ts` (exposes the
  `package.json` version as `NEXT_PUBLIC_APP_VERSION`).
- **Tests (not counted):** one `*.test.ts` per module above, plus the SQL test file.
- **Counted: 9** (8 created + `next.config.ts`; `database.types.ts` and tests do not
  count), within the cap of 10.

## 14. Decisions (all answered)

- **D1.** Table kind. Options: `UNLOGGED` (not in the WAL or the publication; rows lost
  on a Postgres crash and not in backups) or a normal table (durable, but every insert
  and delete runs through the WAL and the PowerSync slot). **User's answer:**
  `UNLOGGED`, with a mandatory local check — done on 2026-10-08 (§5).
- **D2.** Retention. Options: 30 days, 90 days, none. **User's answer:** 30 days.
- **D3.** Roles in the event. Options: the role array, or nothing. **User's answer:** the
  role array.
- **D4.** Where percentiles are computed with no dashboard. Options: a SQL view in a
  migration, or queries in `docs/`. **User's answer:** queries in `docs/`.
- **D5.** Flush. Options: every 10 s or 50 events, or every 30 s or 100 events. **User's
  answer:** every 10 s or 50 events.
- **D6.** Failed send. Options: drop the batch, or keep in memory up to a cap and retry.
  **User's answer:** bounded in-memory buffer, up to about 500 events, retry on the next
  flush, FIFO drop on overflow.
- **D7.** `appVersion`. Options: the `package.json` version, or the version plus a short
  git SHA. **User's answer:** the `package.json` version. Consequence stated before the
  choice: two deploys with the same version cannot be told apart.
