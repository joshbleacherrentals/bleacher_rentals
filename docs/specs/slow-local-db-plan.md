# Slow local database: four steps, one at a time

Status: **DRAFT 2026-10-14, awaiting the user's review and "Approved" on this plan** — 0 open
decisions (D1–D3 answered 2026-10-14). This is a plan, not the spec of any step. Each step
gets its own spec when it starts (D2); nothing is built without "Approved" on that spec.
Request (user, 2026-10-14): four steps in this order, each one reversible on its own, so
that review stays small. Branch: the commits are separable wherever they live (to confirm
at review; today: `q4-sprint1-finance-role`).

**Amended 2026-10-14 (user):** after a first stopwatch run of the `useUserAlerts` commit
(message sent during the apply: 10.7, 17 and 7 s against 5, 9 and 6 s before; 3 runs each),
the user decided to implement every step first and measure afterwards. The commits stay
separable (section 4), so a step can still be measured and reverted alone afterwards; what
is lost is only the per-commit gate while building. Steps 1 (three hooks), 2 and 4 are
implemented in the working tree and not committed. Step 3 was stopped at its verification
(section 15 of its spec): the mechanism does not shrink the role-add apply.

## 0. The request, and what it is not

The four steps, in the user's order:

1. Replace the heavy multi-JOIN watched queries with several small ones, joined in JS.
2. Step D: fewer local database calls per user action.
3. Step A: a smaller amount of data applied when a role changes.
4. Raise the SQLite page cache to 300 MB.

**Not part of this plan:** anything not listed above. Section 10 lists things seen while
reading; none of them is planned work.

## 1. What is known

Everything below was measured on the user's Mac. The causes of the employee's (Todd's)
slow saves are **not known**.

- A quote save on an idle system takes about 80 ms (3 runs).
- A quote save clicked about 15 s after the user grants themselves admin in the database
  takes 6–10.5 s (4 runs). One chat message in the same window takes 5–9 s (3 runs).
  A message sent right after the grant is instant; the 6th, sent when the apply began,
  waited 11 s. So the wait is one blocker (the apply), not a sum of queued calls.
- After a role is added the new role shows after about 36–43 s, sometimes 90–120 s. The
  database worker spends about 24 s applying a 65k-operation bucket (bucket `204`).
- One chat message produced about 31 watcher re-runs, 10 of them from the two chat JOIN
  queries in the Header (localhost, 2026-10-14; assumes the first report was taken before
  the send). A rename in another tab re-ran the same Header queries and the alerts query.
- The local database is 183 MB (localhost) and 242 MB (prod) against a 50 MB page cache.
- How long any single watcher re-run takes has never been measured.

## 2. Decisions taken

**D1 — scope of step 1.** Options: (a) global frame only; (b) global frame plus the chat
page; (c) every watcher with 4+ JOINs.
User's answer: **(b)** — global frame plus the chat page.
Amended 2026-10-14 by the user's answer in the step 1 spec (D3): `useUserAccess` is out of
step 1, so step 1 has three hooks. The acceptance rule of section 6 is replaced by the rule
of that spec (D5), because splitting a JOIN raises the count of re-runs by construction.

**D2 — when the specs of steps 2–4 are written.** Options: (a) one at a time, when the
step starts; (b) all four now (step 3 would be written before the table breakdown of
bucket `204` exists).
User's answer: **(a)** — one at a time.

**D3 — where each step is measured.** Options: (a) local dev (`localhost`); (b) local
production build; (c) deploy each step to prod or staging.
User's answer: **(a)** — local dev. Consequence: numbers are comparable only with other
local-dev numbers, never with prod or with Todd's PC.

## 3. How each step is measured

Common rules: local dev, one app tab, browser extensions off (Grammarly floods the
console), the same database state before and after, at least 3 runs per measure, median
and range reported, before/after runs alternated. Each step is measured **alone** (against
the previous step) and **cumulatively** (against step 0).

- **M1 — idle save.** Stopwatch from the click on Save to the detail page.
- **M2 — save during the apply.** Grant admin in the database, wait 15 s, click Save on
  the same quote, stopwatch as in M1.
- **M3 — message during the apply.** Same wait, send one chat message, stopwatch to the
  message appearing.
- **M4 — role appears.** From the database edit to the admin items in the sidebar.
- **M5 — re-runs per action.** `perfLog.clear()`, one action (one chat message, or one
  quote save), `perfLog.report()`: total emissions and emissions per query.
- **M6 — database worker work per commit.** A 5 s Performance trace without screenshots
  while one commit on `Events` happens (a rename in a second tab). The assistant reads
  the saved trace: database-worker busy time and task count per commit round.

Which measures apply:

- **Step 1:** M6s as defined in the step 1 spec (it gates), M5 (reported only), and M1 to
  catch a regression.
- **Step 2:** M5, M1, M2, M3, and the read/write counters of `perfLog.report()`.
- **Step 3:** M4, M2, M3, and the operation count.
- **Step 4:** M4, M2, M3, M1, and the memory of the tab's process in Chrome's Task Manager.

## 4. How each step is rolled back

- **Steps 1, 2 and 4:** no database schema, no `AppSchema.ts` and no sync rules change.
  A step is its own commits, prefixed `perf(local-db) step N`; rolling back is `git revert`
  of those commits, newest first. No user's local data is touched.
- **Step 3** changes `sync_rules.yaml`, which lives in another repository
  (`../br_powersync`) and is deployed on its own. Rolling back is deploying the previous
  file, and every client then downloads the changed buckets again. So step 3 is tested on
  a local PowerSync only and is deployed only after review.

## 5. Step 0: baseline (no code)

The numbers in section 1 were not all taken in one environment, so before step 1 the user
takes M1–M6 once more on local dev, on the commit just before step 1. Those numbers are the
baseline every later step is compared with.

## 6. Step 1: smaller watchers, joined in JS

**Goal.** Each heavy JOIN watched query becomes several small queries, each reading one
table or two, and a pure JS function joins them. The hook's return type stays the same, so
callers do not change. Each hook is its own commit.

**Scope (D1, amended).** Three hooks, heaviest first; details in
[slow-local-db-step1-split-watchers.md](slow-local-db-step1-split-watchers.md).

- `useUserAlerts` — 1 query with 5 JOINs: `UserAlerts`, `Alerts`, `Events` (twice),
  `BleacherEvents`, `WorkTrackers`. Mounted in the Header on every page.
- `useEventChatNotifications` — 2 queries. Unread chats: `EventSubscriptions`,
  `EventMessages`, `Events`, `EventMessageReadReceipts`, grouped. Mentions:
  `EventMessageMentions`, `EventMessages`, `Events`, `EventSubscriptions`,
  `EventMessageReadReceipts`, grouped. Mounted in the Header on every page.
- `useEventChatConversations` — 3 queries. Mounted by the `/messages/internal` sidebar.

**Not known.** How long any of these queries takes, and whether many small watchers cost
more or less in total than a few JOINs.

**Expectation (hypothesis).** Less work per commit on the `Events` and chat tables. No
effect is expected on M2 and M3, because the wait there is the apply.

**Risks.**

- Each small query is its own watcher, so the number of re-runs per commit can go up.
- Several narrow result sets cross from the worker to the page instead of one set of
  joined rows (thousands of rows for the alerts of a large user).
- Behaviour drift.

**Acceptance rule.** Set in the step 1 spec (D5): a hook's commit stays only if the
database-worker busy time, its task count and the main-thread busy time are not worse than
before that commit; otherwise only that commit is reverted. M5 is reported and does not
block.

**Edge cases the step 1 spec must cover.**

- Loading: a merged hook reports loading until every part has loaded. An empty list must
  never be read as "no alerts" or "no access".
- No signed-in Clerk user, and a query error: the current blocked and empty results are
  kept.
- PowerSync not yet synced, and offline.

**Tests.** TDD. Each merge is a pure function with Vitest tests written first, covering
the current rules (unread means a message from someone else with no receipt, or a
subscription flagged unread; deleted events excluded; one entry per chat).

**Permissions.** Unchanged. The same user reads the same rows.
`permissionPageData.ts` is not touched.

## 7. Step 2: fewer calls per action (D)

**Goal.** Fewer local database calls and commits per user action.

**Not defined.** Which actions. Fixed in the step 2 spec. Candidates seen in the code,
none chosen:

- `markEventMessagesRead`: 3 + 2N sequential calls for N unread messages.
- Adding or removing a chat member: a read and a write, then a system message write.
- `updateQuoteEvent` with `syncPaymentInstallments`: about 8–10 sequential local calls.
- `setEventTyping`: a read and a write at the start and again at the end of each typing
  burst.
- `createQuoteEvent`.

**Known that bears on it.** A message waits as long as a save during the apply (section 1),
so the wait there does not depend on the number of calls.

**Expectation (hypothesis).** The effect shows in M5 and the call counters, not in M2 or
M3.

**To state in the step 2 spec.** One transaction is all-or-nothing, which is a change in
behaviour from separate calls, and it is one CRUD upload transaction.

**Rollback.** `git revert` of the step's commits.

## 8. Step 3: a smaller amount applied on a role change (A)

**Goal.** Shrink what the client applies when a role changes. Bucket `204` (admin) is
about 65k operations (~55 MB) and bucket `138` (account manager) about 41.5k (~41 MB);
they overlap in data, and a role add downloads a whole bucket.

**Not defined.** Which tables, and whether the approach is removing the overlap or cutting
data a role does not need. The first work of the step is a read-only count of the
operations of bucket `204` per table; the result goes into the step 3 spec.

**Constraints for the step 3 spec.**

- The bucket-count check must pass: compile `sync_rules.yaml` with the PowerSync service's
  own library and count the parameterised web buckets (2 on 2026-10-02). A JOIN to the
  returned row would make one bucket per row.
- No role may lose data a feature of that role reads. Checked table by table against
  `permissionPageData.ts`; the matrix changes only with the user's decision.
- Tested on a local PowerSync only until review (section 4).

**Expectation (hypothesis).** This is the only step aimed at the measured blocker. The
effect is assumed to follow the operation count; that was measured once, for one bucket.

**Rollback.** Section 4.

## 9. Step 4: page cache of 300 MB

**What changes.** One value, `cacheSizeKb`, on the `WASQLiteOpenFactory` in
`SystemProvider.tsx`. It is not set today, so PowerSync's own 50 MB applies.

**Known.**

- It is a per-connection setting, not stored in the database file, and takes effect at the
  next page load.
- The database worker is one shared worker for all tabs, so the cache exists once. It
  fills only as pages are read; its ceiling is about the database size (183–242 MB).
- Memory used by a WebAssembly module does not shrink until the worker closes.
- In Chrome's Task Manager the workers sit inside the tab's process, so the tab's memory
  figure includes the cache.

**Not known.** Whether it shortens anything. The cache starts empty at every load, and the
apply mostly writes pages once.

**Measure.** Section 3, step 4, taken after a warm-up (reload, then about 5 minutes of use).

**Rollback.** Revert the one line.

## 10. Seen while reading, not part of this plan

- `@powersync/react` 1.8.2 with `@powersync/common` 1.54.0 leaves a dead listener behind on
  mounts. After 10–15 page changes a commit installs 285 timers instead of 51 with the same
  37 live hooks. Cost measured as small (about 3 ms per commit); upstream issues #1056 and
  #1119 describe it. Whether the v1 line got the fix is unconfirmed.
- `Users` has no index on `clerk_user_id`, and at least 9 live watchers on
  `/quotes-bookings` filter on it.
- The same query is mounted several times (the access query ×4, a `Users` lookup ×3), and
  each copy re-runs separately.
- Todd's slowness remains unexplained. A short trace with the worker threads, taken on his
  PC during one slow save, would show which thread is busy while he waits.

## 11. Definition of done (every step)

Per `CLAUDE.md`, with the real tail of each command shown in the final report:

- `npm run tc`: PASSED / FAILED.
- `npm run test`: PASSED / FAILED.
- `npm run lint`: the repo gate is red at baseline, so only the touched files are
  formatted and checked.
- `npm run test:e2e`: SKIPPED, the user asked for no local Playwright runs.

## 12. To confirm at review

- Where the commits live (the top of this file).
- That M1–M6 are retaken in step 0 instead of reusing the section 1 numbers.
