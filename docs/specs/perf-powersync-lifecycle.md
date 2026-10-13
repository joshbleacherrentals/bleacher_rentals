# Performance telemetry — PowerSync lifecycle: open, connect, reconnect, initial sync

Status: **IMPLEMENTED 2026-10-09, awaiting review** (approved the same day) — 0 open decisions
(D1–D5 answered by the user). Not run in a real browser by me (Clerk sign-in is unavailable
here); the observer is covered by unit tests only. What differs from the text below is in §8.
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
mount. There is no `shared` tag (D4): a tab cannot tell that the shared worker already
existed, so a near-instant open in a second tab is recorded like any other and can be told
apart only by its duration.

**`powersync.connect`.** _Starts_ at the **later** of two moments: the provider's
`instance.connect(...)` call and the local database becoming ready. _Ends_ at the first status
with `connected === true`. The probe showed why: `connect()` waits for the database inside the
SDK, so a call made before the database is ready would otherwise count the database's opening
twice, once here and once in `sqlite.open` (353 ms of a 1.3 s `connect()` in the probe run).
It does **not** end when the `connect()` promise resolves, although in the probe the two were
the same millisecond (P4). It includes the credentials fetch; spec 3 measures that part on its
own. **To confirm at review:** this start rule is mine; the alternative is the plain call time.

**`powersync.disconnect`.** An event at each transition from `connected: true` to
`false`, with `attrs.n` (1, 2, 3 ... within the session) and `attrs.hadError` (whether
`dataFlowStatus.downloadError` was set). It carries no message (spec 1 §7).

**`powersync.reconnect`.** _Starts_ at the disconnect above. _Ends_ at the next
`connected === true`. `outcome: "error"` and an `errorKind` when `downloadError` was set
during the gap. `attrs.cause: "tab_connect"` when the gap was started by another tab calling
`connect()` (D5, below); without that attribute the cause is not known. The status flaps
while reconnecting (`connecting` true, false, true within a millisecond, several identical
statuses in a row), so only two transitions count: `connected` true to false starts the gap,
the next `connected` false to true ends it; everything between is ignored.

**`sync.initial`.** Only when the device had never synced: `hasSynced` was `false` when
`connect()` was called (P1). _Starts_ at that `connect()` call. _Ends_ when `hasSynced`
becomes `true`. `attrs`: `ops` (the last `downloadProgress.totalOperations` seen) and
`buckets` (number of buckets in `downloadProgress`). Operations are not rows.

**`sync.catchup`.** Only when `hasSynced` was already `true` at `connect()`. _Starts_ at
that call. _Ends_ at the first `lastSyncedAt` newer than the one seen at the start, which
is the first complete checkpoint of the session. The end is the **time the status event
arrived**, not the value of `lastSyncedAt`: the probe showed `lastSyncedAt` has one-second
resolution (every value ended `.000`) and can be `null` for a moment while connecting, so a
`null` is ignored and the value is used only to see that it changed. `attrs`: `ops` as above (0
when nothing changed). This is what a returning user waits for; `sync.initial` happens once per device.

**The two sync metrics share one signal** (the SDK's own `hasSynced` / `lastSyncedAt`
status), not a timer. They are never both emitted for one connect.

**What the instrumentation does not claim:** `powersync.connect` is not network latency
and not replication latency; `sync.initial` is not "PowerSync latency". The stage names
say which stage was timed.

## 1a. Which tab records what (D2)

The PowerSync connection is shared by all tabs (shared worker); a tab is not. So:

- **Connection-level, recorded only by the leader tab** (`tabRole: "leader"`):
  `powersync.connect`, `powersync.disconnect`, `powersync.reconnect`.
- **Per tab, recorded by every tab:** `app.start`, `sqlite.open`, and (other specs)
  `ui.first_data`, `sqlite.*`, `powersync.credentials`, `sync.upload`.
- **No Web Locks (`unknown`):** every tab records the connection-level metrics, tagged
  `unknown`, so they can be filtered or counted knowing they may repeat.
- **How the role is found:** a lock named `powersync-telemetry-leader` is requested with
  `ifAvailable: true`; if granted, the tab is `leader` and never releases it until the tab
  closes; if not, the tab is `follower` and queues a normal request; when that is granted
  (the leader closed) the tab becomes `leader`. The role is not "the first tab forever".
- **Every tab runs the state machine**, because each tab calls `connect()` and gets its
  own `statusChanged` (to be confirmed by P3); only the _emission_ is gated by the role.
  A new leader therefore has its own complete spans. A span that was running in a leader
  that then closed is lost; it is not reconstructed.

**To confirm at review (my reading of the request):** `sync.initial` and `sync.catchup`
are connection-level too (one download is shared), so they are recorded by the leader
only. The request named only connect, disconnect and reconnect.

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
  or only the first? The leader rule in §1a depends on it.
- **P4.** When does the `connect()` promise resolve: at the first `connected`, or
  earlier? §1 does not depend on it, but the answer is recorded so nobody later times the
  promise by mistake.
- **P5.** Can a tab tell that the shared database worker was already running when it
  opened the database (D4 tags such an open `attrs.shared: true`)? If the SDK exposes
  nothing, the tag is replaced by "the open took under a few milliseconds" only if the
  user agrees; otherwise `sqlite.open` is recorded without the tag.

_Findings (2026-10-08, from the SDK source and the user's DevTools runs on the local dev server):_

- **P1 — answered: yes, it survives a reload.** The probe (a reload of a device that had
  synced 17 minutes earlier) showed `hasSynced: true` and `lastSyncedAt` set in the very first
  status after the database was ready, before the tab had connected. The offline-reload test
  earlier could not show this (Chrome cannot load the page offline), so the probe replaced it.
  `sync.initial` and `sync.catchup` therefore split on `hasSynced`; no `localStorage` flag is
  needed for spec 2. (Spec 5's `cold` flag follows its own answer; see that spec.)
- **P2 — explained, one check left.** One `stream` WebSocket stayed open for **4 minutes**
  (22:06:35 to about 22:10:33) with only a 14 B ping and a 14 B reply every 20 s after the
  opening exchange (864 B and 579 B up, 946 B and 61 B down). The earlier ~40 s restart
  (2026-10-01) came from the **60 s lifetime of the PowerSync JWT template**: the SDK asks for
  a new token before the old one expires and restarts the stream (`FetchCredentials` in the
  SDK source). The lifetime has since been raised to **3600 s** (user, 2026-10-08), so a
  planned restart should now happen about **once per token lifetime, near an hour**, which a
  4-minute run cannot show.
  - The marks every ~50 s on the tab's Network timeline are **probably Clerk's own session
    refresh**, not `/api/powersync/credentials` (our connector caches the token until 30 s
    before it expires). Not yet confirmed: the name of one of those requests decides it.
  - Still to observe: one sync-worker socket left open for over an hour, expecting one
    close and reopen near the token's expiry. Also unknown: whether production uses the same
    3600 s (Clerk development and production instances have separate templates).
- **P3 — answered for the local dev server.** The first socket ended at about 22:10:33, at
  the same moment a second `stream` socket opened (22:10:33.784, the same opening exchange)
  and after four quiet minutes, so the cause is the second tab's `connect()`: **opening a
  tab replaces the shared WebSocket for every tab.** Closing the second tab opened no new
  socket. Every tab still receives `statusChanged` (source). The exact gap between the old
  socket closing and the new one opening is not visible in DevTools.
- **P4 — answered from source.** `connect()` resolves when the status stops being `connecting`:
  at the first connection **or** at the first download error. Never time the promise.
- **P5 — answered from source: not detectable.** The sync and database workers are created with
  `new SharedWorker(url, ...)`; the SDK exposes nothing that says a worker already existed.
  D4's `attrs.shared` tag cannot be set from the tab (see decision D4 below).

**Probe run, one tab (2026-10-08, local dev; the `clock` values in the probe are UTC, the
DevTools network times are local, so `19:51` in the probe is `22:51` there):**

- First load: `connect()` called 2 ms after the probe started; status restored at +353 ms
  (`hasSynced: true`); `connecting` at +534 ms; `connected` at +1 302 ms, in the same
  millisecond the `connect()` promise resolved. So `powersync.connect` was about 1.3 s from
  the call, or about 0.95 s from the database being ready.
- Right after `connected`: `downloading` true with `opsTotal: 0`, then `downloading` false
  with a new `lastSyncedAt` within 22 ms. A returning user with nothing new waits about as
  long for `sync.catchup` as for `connect`.
- Two disconnects followed, both with **no error**: at +62.0 s (down 0.72 s, then connected
  again, again a zero-operation checkpoint) and at +123.5 s (down 1.31 s). Both fell within
  0.3 s of this tab being hidden or shown, and no earlier than 58 s after the previous
  connect; the first minute of the page was quiet. The other tab's log was not captured, so
  this run cannot say whether they were the second tab's `connect()` or something else. The
  earlier 4-minute run with one tab (22:06 to 22:10 local) had no disconnect, which points
  at the tab, not at a timer. An idle single-tab run with the probe would settle it.

**Consequence for D1 and for reconnects.** A second tab's `connect()` resets the shared
connection (P3, observed), so a leader tab can see a disconnect and a reconnect that **another tab caused**. That
is a cause the request did not list, and `attrs.planned` (token refresh) does not cover it. How
to record it is a new decision, **D5**, below.

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
- **Vitest, `tabCoordination`:** the tab that gets the lock is `leader` and sets the role;
  a second tab is `follower` and becomes `leader` when the lock is released; without
  `navigator.locks` the role stays `unknown`; a connect note received within a second before a
  disconnect makes the reconnect carry `cause: "tab_connect"`, a note older than that or none
  does not; with no `BroadcastChannel` nothing is tagged and nothing throws.
- **Vitest, `observeSync`:** with a fake `registerListener`, events reach `metrics`;
  unsubscribing stops them.
- **Vitest, `SystemProvider`:** the existing `SystemProvider.test.ts` keeps passing; a new
  case checks the observer is registered before `connect` and unsubscribed on cleanup,
  and that DEBUG is not set in production (D3).
- **Playwright:** none written. The spec's behaviour is read from a real browser by the
  probe (§2). Per the standing rule E2E is not run locally; reported SKIPPED.

## 6. Files

- **Created:** `src/lib/powersync/syncObserver.ts`, `src/lib/perf/tabCoordination.ts`
  (the Web Locks leader lock of D2 and the `BroadcastChannel` connect notes of D5; it calls
  `setTabRole` from spec 1).
- **Edited:** `src/components/providers/SystemProvider.tsx`, `src/lib/perf/telemetryEvent.ts`
  (registry names and `attrs` allow-lists).
- **Tests (not counted):** `syncObserver.test.ts`, `tabCoordination.test.ts`, additions to
  `SystemProvider.test.ts`.
- **Counted: 4.**

## 7. Decisions

- **D1.** _Planned stream restarts_ (only if P2 shows they look like reconnects).
  Options were: mark them, drop them, or record them unmarked. **User's answer:** record
  them with a mark: `attrs.planned: true` when the restart follows a credentials refresh
  within the same second, so queries can include or exclude them. (The one-second window
  and the signal it needs, a timestamp of the last credentials fetch written by spec 3's
  connector code, are mine: **to confirm at review**. Without spec 3, `planned` is never
  set.)
- **D2.** _How `tabRole` is decided._ Options were: Web Locks, `BroadcastChannel`, all
  tabs `first`. **User's answer:** Web Locks as the main mechanism, with `unknown` for
  browsers without `navigator.locks`; roles `leader` / `follower` / `unknown`; only the
  leader records connection-level metrics, tabs record their own; the lock is the
  _current_ leader, not "the first tab for ever". Written as §1a.
- **D3.** _PowerSync log level._ **User's answer:** DEBUG in development, WARN in
  production.
- **D4.** _`sqlite.open` in a tab where another tab already opened the database._ First
  answer: record every open and tag it `shared`. Reopened because P5 showed the tag cannot be
  set. **User's answer (2026-10-08):** no tag. Every open is still recorded.
- **D5.** _A reconnect caused by another tab opening._ Options were: (a) an ordinary
  reconnect; (b) an ordinary reconnect tagged with its cause; (c) change `SystemProvider` so
  that only the leader calls `connect()`. **User's answer:** (b) — count it as a reconnect and
  mark its cause, `attrs.cause: "tab_connect"`. How the cause is known (a `BroadcastChannel`
  note sent by a tab just before it calls `connect()`, and a one-second window) is mine: **to
  confirm at review.** Where the channel is unavailable, no tag is set.

## 8. What differs from the text above

- **The later-of start also applies to `sync.initial` and `sync.catchup`.** The user confirmed
  the rule for `powersync.connect` ("do not record the wait for the database"); the same wait
  would otherwise sit inside both sync metrics, so they start at the same moment. **To
  confirm at review.**
- **`hasSynced` is read when the database becomes ready, not at the `connect()` call.** Until
  it is ready the SDK's status is a default, so a read at the call would always say "never
  synced" for a tab that connects first (the probe: the call came 353 ms before ready).
- **`connectWithObserver` is the one entry point.** `SystemProvider`'s effect now calls it: it
  starts the tab coordination, observes, announces the connect to the other tabs, connects, and
  its cleanup unsubscribes before it disconnects. The effect's behaviour toward the SDK is
  otherwise the same call with the same arguments.
- **`app.start` is recorded when `SystemProvider` is first loaded** (browser only, so for a
  signed-in page load), not "on the first metrics event".
- **`markCredentialsFetched()` exists but nothing calls it yet.** It is spec 3's connector that
  will; until then `attrs.planned` is never set.
- **A follower tab keeps its state machine running** and records nothing; the role is read when
  each event is emitted, so a follower that becomes leader mid-span emits that span.
- **Failed first connection:** one `powersync.connect` with `outcome: "error"` for the first
  failure, and, when a retry succeeds, a second one with `outcome: "ok"` measured from the same
  start. Queries that want "how long the user waited" take the `ok` rows.
- **Files counted: 4** as planned (`syncObserver.ts`, `tabCoordination.ts`,
  `SystemProvider.tsx`, `telemetryEvent.ts`).
- **Verified:** `npm run tc`; the whole Vitest suite. **Not verified:** a browser run with the
  telemetry on; production's token lifetime; an hour-long run for the planned restart.
