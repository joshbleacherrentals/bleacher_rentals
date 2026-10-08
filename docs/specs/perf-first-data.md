# Performance telemetry — time to first usable data

Status: **BLOCKED** — 2 open decisions (D1, D2) and one dependency on spec 2 (P1).
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

## 2. Cold start and warm start

A device's first-ever load downloads the data before `useUserAccess` can answer, and a
returning user answers from what is already stored. Their times differ by an order of
magnitude and must not share a percentile. The tag is `attrs.cold: true | false`, taken
from `hasSynced` at the moment the database is ready.

**Dependency on spec 2 (P1).** `hasSynced` is only a usable cold-start flag if it
survives a reload. If the probe in spec 2 shows it does not, `cold` cannot be computed
this way and D2 decides the alternative.

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
  `src/lib/perf/telemetryEvent.ts` (registry name and `attrs` allow-list).
- **Tests (not counted):** additions to the hook's tests.
- **Counted: 2.**

## 7. Decisions

- **D1.** _What "first usable data" means._ Options: (a) the access result only, as in
  §1: the shell can render; (b) the access result and, in addition, a second metric
  `ui.page_ready` for the first page the user lands on (per-page definitions to be
  agreed, a larger scope that needs its own spec); (c) the access result, with the
  dashboard grid's first non-empty render added as `ui.dashboard_ready` only.
  **User's answer:** _unanswered._
- **D2.** _How the cold flag is obtained if `hasSynced` does not survive a reload._ Only
  needed if the probe in spec 2 says so. Options: (a) record the flag in `localStorage`
  at the end of the first successful sync; (b) infer it from whether `Users` has a row for
  the user when the database becomes ready; (c) drop the flag and let the percentiles mix
  cold and warm loads. **User's answer:** _unanswered — BLOCKED on spec 2 / P1._
