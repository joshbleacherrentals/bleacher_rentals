# Performance telemetry — time to first usable data

Status: **IMPLEMENTED 2026-10-09, awaiting review** (approved the same day) — 0 open decisions
(D1, D2 answered by the user). Not run in a real browser by me; covered by unit tests. What
differs from the text below is in §8.
Spec 5 of 5. Builds on [perf-telemetry-pipeline.md](perf-telemetry-pipeline.md).
Request (user, 2026-10-08): `time_to_first_usable_data` and `first_data_available`; a
fast-looking result that is really a fallback must not pass for a local one.
Branch: `q4-sprint1-finance-role`.

## 0. The request, and what it is not

**Measured by this spec:** `ui.first_data`, once per page load: from the start of the page
to the moment the application knows who the user is and what they may see, from local
data. Until then `SignedInComponents` shows a spinner and nothing else.

**What it covers:** page start, Clerk loading, SSR of the shell, the JS bundle, opening
the local database, and the first answer of the `useUserAccess` query. It therefore
_includes_ time that has nothing to do with PowerSync. That is the point of the metric
("what the user waits for"), and the reason the stage metrics of specs 2 and 3 exist next
to it.

**What it does not claim:** that a page's own content has loaded. A dashboard grid or a
list can still be empty after `ui.first_data` (D1).

**Not part of this spec:** per-page readiness, Web Vitals (LCP, INP, CLS), the access
rules themselves.

## 1. Where it starts and ends

**Starts** at `performance.timeOrigin` (the navigation start). The value is
`performance.now()` at the end point, which is the elapsed time since the navigation
began; no `Date.now()` is involved.

**Ends** the first time `useUserAccess()` returns a status other than `loading`, in the
page load. The first instance to reach it records; later renders and other components
that call the hook do not (a module-level flag, reset only by a full page load).

`useUserAccess` returns `loading` while the local query runs, and again while the
Supabase fallback is in flight (the fallback exists for a signed-in user whose own role
rows are not synced to this device). So the end point has two kinds:

- `attrs.source: "local"` — the local database answered `active`, or answered
  `blocked` for a reason that does not trigger the fallback (for example
  `account-deactivated`);
- `attrs.source: "fallback"` — the answer came only after the Supabase request. Such
  events include a network round trip and are kept apart so the local figure is not
  contaminated.

`attrs.status` is the resulting status (`active` or `blocked`), `attrs.roles` is not
duplicated (the event already has `roles`).

## 2. Cold start and warm start (D2)

A device's first-ever load downloads the data before `useUserAccess` can answer, and a
returning user answers from what is already stored. Their times differ by an order of
magnitude and must not share a percentile. The tag is `attrs.cold: true | false`.

**Definition (updated 2026-10-09, user agreed):** `cold` is `true` when the SDK's
`hasSynced` was `false` at the moment the local database became ready, and `false` otherwise,
that is `cold === !hasSynced` read from `powerSyncDb.currentStatus` after `waitForReady()`.
This is the same meaning as the user's first answer (`initial_sync_completed === false`), taken
from the SDK instead of from a `localStorage` flag, because the probe in spec 2 showed that
`hasSynced` survives a reload (it was `true`, with `lastSyncedAt` set, in the first status after
a reload of a device that had synced 17 minutes earlier). No `localStorage` flag is created.

- The state belongs to the browser profile, not to a user: the local database file name is
  fixed, so two people signing in on one profile share one database.
- It is the same value spec 2 splits `sync.initial` from `sync.catchup` on, so the two specs
  never disagree about what a first load is.
- Clearing site data clears the local database and its `hasSynced` together, so a cleared
  profile is correctly cold again.

**`sync_scope` is not `cold`.** A user who gains a role later downloads a large new set of
buckets on a device that has long since completed its initial sync. That is a different
event from a cold start and must not be called one. The user asked for it to be tracked
as a separate `sync_scope`; **how it is defined and measured is not decided and is not in
this spec**, to be agreed in its own spec. Until then such a download is `cold: false`.

## 3. Design

Edit `src/features/userAccess/hooks/useUserAccess.ts`:

- a module-level `let reported = false`;
- an effect that runs when the returned state first leaves `loading`, records the event
  with `metrics.record` using `performance.now()` as the duration, and sets the flag;
- `source` is known inside the hook: it is `fallback` when `needsFallback` was true at the
  moment of the first non-`loading` result.

The event is recorded in the hook rather than in `SignedInComponents` because only the
hook knows `needsFallback`. This replaces the placement listed in spec 1 §9
("`SignedInComponents.tsx`"). `SignedInComponents.tsx` is not edited.

## 4. Edge cases

- **Roles arrive after the event:** the `roles` field of the event is read at record time
  from the permissions store; at the first non-`loading` result it can still be `null`.
  Accepted: the event is the first moment roles are known, and `roles` is filled from
  `access.roles` passed in by the hook when the status is `active`.
- **A user who is `blocked` ("no roles assigned"):** recorded with `status: "blocked"`;
  that is also the moment their wait ended.
- **Sign-out and sign-in without a reload:** one event per page load, so the second
  sign-in is not measured. Accepted, to avoid counting an unrelated later state.
- **Page hidden during load:** `attrs.hidden` is set when the page was hidden at any
  point, as in spec 2; those loads are not discarded, only marked.
- **Reload from the bfcache (`back_forward`):** the module state is restored, so no new
  event; `app.start` (spec 2) still records the navigation type.
- **Slow Clerk:** its time is inside the figure and cannot be isolated by this metric.

## 5. Tests

- **Vitest, hook:** with a fake `useTypedQuery`, the first non-`loading` result records
  one event with `source: "local"`; a fallback result records `source: "fallback"`; a
  second render and a second hook instance record nothing; the duration equals
  `performance.now()` of the fake clock and never `Date.now()`.
- **Vitest, privacy:** no user id, email or Clerk id appears in the event.
- **Playwright:** none written; SKIPPED as the standing rule says.

## 6. Files

- **Edited:** `src/features/userAccess/hooks/useUserAccess.ts`,
  `src/lib/perf/telemetryEvent.ts` (registry name and `attrs` allow-list); the flag write
  is part of spec 2's observer, not this spec.
- **Tests (not counted):** additions to the hook's tests.
- **Counted: 2.**

## 7. Decisions

- **D1.** _What "first usable data" means._ Options were: the access result only; the
  access result plus `ui.page_ready`; the access result plus `ui.dashboard_ready`.
  **User's answer:** the access result plus `ui.page_ready`, with the definition of
  `page_ready` in a separate spec. This spec adds `ui.first_data` only; the name
  `ui.page_ready` is **not** in the registry until that spec exists.
- **D2.** _How the cold flag is obtained._ Options were: `localStorage`; whether a `Users`
  row exists; no flag. **User's answer:** `localStorage`, with `cold` defined as
  `initial_sync_completed === false`, and role-driven data growth kept apart as a separate
  `sync_scope` that is not called a cold start (§2). **Revised 2026-10-09 (user agreed):** the
  answer was given for the case where `hasSynced` does not survive a reload; it does, so `cold`
  is `!hasSynced` at database-ready and no flag is stored.

## 8. What differs from the text above

- **`cold` is captured when the database becomes ready, in `trackSqliteOpen`, not read in the
  hook.** §2 said to read `currentStatus.hasSynced` after `waitForReady()`, which is right, but
  the hook only learns the answer when the first sync has already flipped `hasSynced` to true
  (the local rows arrive with that sync), so reading it there would call every cold start warm.
  `syncObserver.ts` now keeps the value it saw at the moment of readiness (`getColdStart()`, null
  when unknown, in which case `attrs.cold` is left out). A cold start is therefore only visible
  in `ui.first_data` of the load it happened in.
- **`metrics.record` takes an optional `roles`.** The store that normally fills an event's roles
  is set by `SignedInComponents` after this moment, so the hook passes the roles of the access
  result it just resolved; for a blocked user they are null.
- **`attrs.hidden` is tracked from the moment the hook's module loads**, with the tracker spec 2
  uses for its spans. A page hidden before the module loaded is not seen.
- **The hook's return is one value, computed once.** The three early returns became a single
  `result`, so the reporting effect can sit after them without a conditional hook; the values
  returned are the same as before.
- **How it is tested.** The repo has no DOM renderer, so the test replaces React's hooks with
  plain functions that run at once and calls `useUserAccess()` directly: one call is a render
  plus its effects. That exercises the real effect and the real flag, not a copy of them.
- **Files counted: 4** (`useUserAccess.ts`, `telemetryEvent.ts`, `syncObserver.ts`,
  `metrics.ts`); the spec said 2.
- **Verified:** `npm run tc`; the whole Vitest suite. **Not verified:** a browser run; what
  `ui.first_data` shows against a real cold start.
