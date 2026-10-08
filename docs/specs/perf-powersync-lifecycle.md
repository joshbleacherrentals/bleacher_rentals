# Performance telemetry — PowerSync lifecycle: open, connect, reconnect, initial sync

Status: **BLOCKED** — 4 open decisions (D1–D4) and 4 facts to measure first (P1–P4).
Spec 2 of 5. Builds on [perf-telemetry-pipeline.md](perf-telemetry-pipeline.md), which must
be approved and implemented first (the `metrics` API and the event type come from it).
Request (user, 2026-10-08): measure application startup, the PowerSync connection and the
initial sync as separate stages; do not mix "connection established" with "initial sync
completed"; use the SDK's own events, never a `setTimeout`; reconnects counted per session.
Branch: `q4-sprint1-finance-role`.

## 0. The request, and what it is not

**Measured by this spec** (names are added to the registry of spec 1):

- `app.start`: one count event per page load. It is the denominator for every other
  metric ("how many loads had a slow connect"). Its `attrs`: `navType`
  (`navigate` | `reload` | `back_forward`, from the Navigation Timing entry).
- `sqlite.open`: the local database becoming ready.
- `powersync.connect`: the channel to the PowerSync service being established.
- `powersync.disconnect`: a count event with the session's running disconnect number.
- `powersync.reconnect`: the gap between losing the connection and having it again.
- `sync.initial`: the first-ever full download on this device.
- `sync.catchup`: for a returning user, how long until local data is brought up to date.

**Not part of this spec:** credentials and upload timing (spec 3), SQLite calls (spec 4),
`ui.first_data` (spec 5), bytes received, rows and tables synced (not available, see spec
1 §9), and any change to `sync_rules.yaml` or `AppSchema.ts`.

## 1. Where each metric starts and ends

**`sqlite.open`.** _Starts_ when `createPowerSyncDb()` constructs `PowerSyncDatabase`
(`SystemProvider.tsx`). _Ends_ when `waitForReady()` resolves. It covers the worker start,
the IndexedDB open and the schema apply. It cannot be split further from outside the
SDK. Note: the database is created lazily on first access of the `powerSyncDb` or `db`
proxy, which can be before the provider mounts; the start is the construction, not the
mount.

**`powersync.connect`.** _Starts_ when the provider calls `instance.connect(...)`. _Ends_
at the first status with `connected === true`. It does **not** end when the `connect()`
promise resolves (P4). It includes the credentials fetch (Clerk and `/api/powersync/credentials`);
spec 3 measures that part on its own so the two can be told apart.

**`powersync.disconnect`.** An event at each transition from `connected: true` to
`false`, with `attrs.n` (1, 2, 3 ... within the session) and `attrs.hadError` (whether
`dataFlowStatus.downloadError` was set). It carries no message (spec 1 §7).

**`powersync.reconnect`.** _Starts_ at the disconnect above. _Ends_ at the next
`connected === true`. `outcome: "error"` and an `errorKind` when `downloadError` was set
during the gap.

**`sync.initial`.** Only when the device had never synced: `hasSynced` was `false` when
`connect()` was called (P1). _Starts_ at that `connect()` call. _Ends_ when `hasSynced`
becomes `true`. `attrs`: `ops` (the last `downloadProgress.totalOperations` seen) and
`buckets` (number of buckets in `downloadProgress`). Operations are not rows.

**`sync.catchup`.** Only when `hasSynced` was already `true` at `connect()`. _Starts_ at
that call. _Ends_ at the first `lastSyncedAt` newer than the one seen at the start, which
is the first complete checkpoint of the session. `attrs`: `ops` as above (0 when nothing
changed). This is what a returning user waits for; `sync.initial` happens once per device.

**The two sync metrics share one signal** (the SDK's own `hasSynced` / `lastSyncedAt`
status), not a timer. They are never both emitted for one connect.

**What the instrumentation does not claim:** `powersync.connect` is not network latency
and not replication latency; `sync.initial` is not "PowerSync latency". The stage names
say which stage was timed.

## 2. Facts to measure first (the probe)

None of these can be answered from the SDK types. A temporary, uncommitted logger prints
every `statusChanged` with `performance.now()` and a tab id; it is run once in a signed-in
browser and the findings are written into this section before the spec is approved.

- **P1.** Does `hasSynced` stay `true` across a page reload on a device that has synced
  before? If not, `sync.catchup` cannot be told from `sync.initial` and the split in §1
  changes.
- **P2.** The web stream restarts about every 40 s (the SDK refreshes credentials before
  the Clerk token expires; recorded in a 2026-10-01 investigation). Does that restart
  appear as `connected: false` then `true`? If it does, `powersync.reconnect` would be
  dominated by planned restarts (D1).
- **P3.** With two tabs open (shared worker), does each tab receive its own
  `statusChanged`, and does each tab's `connect()` produce its own `connected` transition
  or only the first? This sets how `tabRole` is decided (D2).
- **P4.** When does the `connect()` promise resolve: at the first `connected`, or
  earlier? §1 does not depend on it, but the answer is recorded so nobody later times the
  promise by mistake.

_Findings:_ **not yet measured.** This session cannot sign in through Clerk; the probe is
run in a signed-in browser by the user or in a session that has one.

## 3. Design

New `src/lib/powersync/syncObserver.ts`:

- `observeSync(db: PowerSyncDatabase): () => void` registers one `registerListener({
statusChanged })`, keeps the small state machine for §1 (connect started at, last
  `connected`, disconnect count, `hasSynced`/`lastSyncedAt` at connect), emits through
  `metrics`, and returns an unsubscribe.
- It is called from the existing `useEffect` in `SystemProvider.tsx`, just before
  `instance.connect(...)`; the cleanup unsubscribes. It runs once per `connector`
  change, so a sign-in or sign-out resets the state machine.
- `sqlite.open` is recorded in `createPowerSyncDb()` using `metrics.start` and
  `waitForReady()`.
- `app.start` is recorded once per page load from the module that holds the
  `metrics` singleton on its first event.

The state machine is a pure function `(state, status, now) -> { state, events }` so it is
tested without a browser or the SDK.

**Edit to `SystemProvider.tsx` beyond the observer:** the unconditional
`logger.setLevel(LogLevel.DEBUG)` (D3). The request asks for no verbose logging in
production.

## 4. Edge cases

- **Sign-out then sign-in in one page load:** the effect cleanup runs `disconnect()`.
  That disconnect is not counted as a lost connection (the observer is unsubscribed first).
- **Offline at start:** `connected` never becomes `true`; `powersync.connect` is never
  emitted. A connection that fails produces `outcome: "error"` on the connect attempt
  when `downloadError` is set, with the classified kind; a connect that is still pending
  when the page is hidden is emitted as `outcome: "error", errorKind: "aborted"`.
- **Connected, then the tab goes to the background:** browsers throttle timers, not
  `performance.now()`; durations stay correct but a hidden tab can be slow for reasons
  unrelated to PowerSync. `attrs.hidden` (true when `document.visibilityState` was
  `hidden` at any point in the span) is recorded on every span of this spec.
- **A very long span (over 10 minutes):** recorded as is; it is a real wait.
- **SSR:** `observeSync` and `metrics` are browser-only; the provider is already
  `ssr: false`.
- **Clerk errors:** surface as `downloadError` through `fetchCredentials` and are
  classified; no Clerk message is stored.

## 5. Tests

- **Vitest, state machine (the core):** first connect yields `powersync.connect` once;
  `hasSynced` false at connect then true yields `sync.initial` and never `sync.catchup`;
  `hasSynced` true at connect then a newer `lastSyncedAt` yields `sync.catchup` and never
  `sync.initial`; `connected` true then false then true yields one disconnect event with
  `n: 1` and one reconnect with the gap; a second loss gives `n: 2`; `downloadError`
  during the gap gives `outcome: "error"`; a repeated identical status yields nothing.
- **Vitest, `observeSync`:** with a fake `registerListener`, events reach `metrics`;
  unsubscribing stops them.
- **Vitest, `SystemProvider`:** the existing `SystemProvider.test.ts` keeps passing; a new
  case checks the observer is registered before `connect` and unsubscribed on cleanup,
  and that DEBUG is not set in production (D3).
- **Playwright:** none written. The spec's behaviour is read from a real browser by the
  probe (§2). Per the standing rule E2E is not run locally; reported SKIPPED.

## 6. Files

- **Created:** `src/lib/powersync/syncObserver.ts`.
- **Edited:** `src/components/providers/SystemProvider.tsx`, `src/lib/perf/telemetryEvent.ts`
  (registry names and `attrs` allow-lists).
- **Tests (not counted):** `syncObserver.test.ts`, additions to `SystemProvider.test.ts`.
- **Counted: 3.**

## 7. Decisions

- **D1.** _Planned stream restarts._ Applies only if P2 shows they look like reconnects.
  Options: (a) record them like any reconnect, with `attrs.planned: true` set when the
  restart follows a credentials refresh within the same second, so queries can include or
  exclude them; (b) do not record them at all, which hides a real reconnect that happens
  to coincide with one; (c) record them and leave them unmarked, so every reconnect
  figure includes them. **User's answer:** _unanswered — BLOCKED on P2._
- **D2.** _How `tabRole` is decided._ Options: (a) the tab that holds a Web Locks lock is
  `first`, the rest `other` (precise, fails on browsers without `navigator.locks`);
  (b) a `BroadcastChannel` election (works everywhere, can briefly report two firsts);
  (c) every tab is `first`; the figures then count one shared connection once per open
  tab, and queries cannot tell them apart. **User's answer:**
  _unanswered — BLOCKED on P3._
- **D3.** _PowerSync log level._ It is DEBUG everywhere today. Options: (a) DEBUG in
  development, WARN in production; (b) DEBUG in development, ERROR in production; (c) leave
  it as it is and treat it as a separate change. **User's answer:** _unanswered._
- **D4.** _`sqlite.open` outliers._ The database can be opened by another tab already, in
  which case the open is near-instant. Options: (a) record every open and tag
  `attrs.shared: true` when the shared worker was already running; (b) record only the
  tab that actually opens the database. **User's answer:** _unanswered._
