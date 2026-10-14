# Slow local database, step 1: smaller watchers, joined in JS

Status: **IMPLEMENTED 2026-10-14, uncommitted, awaiting review** (approved the same day) —
0 open decisions (D1–D6 answered 2026-10-14). Step 1 of [slow-local-db-plan.md](slow-local-db-plan.md) (approved
2026-10-14); that plan is amended by D3 and D5 below. All three hooks are built; the measurement of section 8 is the user's.
Request (user, 2026-10-14): take the heavy multi-JOIN watched queries, make several small
light queries out of each, and join them in JS; one commit per hook so that review and
rollback stay small. Branch: as in the plan (to confirm at review).

## 0. The request, and what it is not

**In scope:** three hooks, in this order (D1), one commit each:

1. `useUserAlerts` (Header, every page).
2. `useEventChatNotifications` (Header, every page for users with chat).
3. `useEventChatConversations` (the `/messages/internal` sidebar).

**Not in scope:** `useUserAccess` (D3), any other hook, steps 2–4 of the plan, `AppSchema.ts`,
migrations, sync rules. Nothing the user sees changes: same rows, same order, same counts.

## 1. Decisions taken

**D1 — commit order.** Options: heaviest first; chat first; access first.
User's answer: **heaviest first**.

**D2 — how a small query reads the rows of a related table that has no user column**
(`Events`, `EventMessages`, `Alerts`, `BleacherEvents`, `WorkTrackers`). Options: the whole
table with narrow columns; a SQL subquery `where id in (select … where user_uuid = ?)`; a
list of ids taken from the first query.
User's answer: **a SQL subquery.** Consequence: part of the row selection stays in SQL (a
subquery, not a JOIN), the SQL text is stable, and only the user's id is a parameter.

**D3 — `useUserAccess`.** Options: six small queries; two queries (Users plus one `UNION
ALL`); take it out of step 1.
User's answer: **take it out of step 1.** This amends plan D1: step 1 has three hooks, not
four. Its query is one row and the hook has 16 call sites.

**D4 — the two chat hooks, both mounted on `/messages/internal`.** Options: each hook has its
own small queries; one shared set.
User's answer: **each has its own.** Consequence: on that page the small queries exist
twice, the two hooks do not depend on each other, and each commit reverts alone. For the
same reason each hook has its own pure-logic file; the unread and mention rules are
therefore written twice (they are already two copies today, in SQL).

**D5 — acceptance rule of a hook** (replaces plan §6: "M5 and M6 not worse"). The plan rule
cannot hold: splitting one JOIN into several queries raises the count of re-runs by
construction, so M5 always rises. Options: database worker only; database worker and main
thread; no threshold.
User's answer: **database worker and main thread.** A hook's commit stays only if, for the
hook's actions (§8), the median of at least 3 runs is not above the baseline median for all
three of: database-worker busy time, database-worker task count, main-thread busy time. A
median above the baseline counts as "not worse" if it lies inside the baseline's min–max
range. M5 is reported and does not block.

**D6 — tests.** Options: differential test per hook plus unit tests of the pure functions;
unit tests only.
User's answer: **differential test per hook** (§7).

## 2. What the code does today

Counts below are from the **local** database (2026-10-14); prod counts are to be filled by
the user with the read-only query at the end of this section.

- Events 1472, EventMessages 36, EventMessageReadReceipts 58, EventMessageMentions 5,
  EventSubscriptions 1296, Alerts 9519 (9482 `bleacher_event`, 37 `event`), UserAlerts 9315,
  BleacherEvents 3821, WorkTrackers 1596.
- The two largest users hold 4207 and 3691 `UserAlerts` and 350–387 `EventSubscriptions`.

**`useUserAlerts`** — one query, 5 JOINs. `UserAlerts` (filtered by user) joined to `Alerts`
(inner) and left-joined to `Events` (as the alert's event), `BleacherEvents`, `Events` (as
the bleacher event's event) and `WorkTrackers`, sorted by `dismissed_until` ascending then
`created_at` descending. One re-run returns up to thousands of wide rows, and it re-runs on
any commit to those five tables, which includes every quote save and every alert cascade.
Single caller: `AlertsDropDown`, in the Header.

**`useEventChatNotifications`** — two queries. _Unread chats_: `EventSubscriptions`,
`EventMessages`, `Events`, left-joined `EventMessageReadReceipts`, grouped per event with
`max(created_at)`. _Mentions_: `EventMessageMentions`, `EventMessages`, `Events`,
`EventSubscriptions`, left-joined receipts, grouped per event. Single caller:
`EventChatNotificationsDropDown`, in the Header.

**`useEventChatConversations`** — three queries (conversations, unread, mentions) over the
same tables. Single caller: `InternalMessagesSidebar`.

Both chat hooks ran, in a perfLog test on 2026-10-14, on every `Events` rename done in a
second tab and on every chat message; their re-run time has never been measured. On the
local data they touch few rows (36 messages); `useUserAlerts` touches thousands.

**Prod counts (read-only, to run in the Supabase SQL editor):**

```sql
select 'Events', count(*) from "Events"
union all select 'EventMessages', count(*) from "EventMessages"
union all select 'EventMessageReadReceipts', count(*) from "EventMessageReadReceipts"
union all select 'EventMessageMentions', count(*) from "EventMessageMentions"
union all select 'EventSubscriptions', count(*) from "EventSubscriptions"
union all select 'Alerts', count(*) from "Alerts"
union all select 'UserAlerts', count(*) from "UserAlerts"
union all select 'BleacherEvents', count(*) from "BleacherEvents"
union all select 'WorkTrackers', count(*) from "WorkTrackers";

select user_uuid, count(*) from "UserAlerts" group by 1 order by 2 desc limit 5;
```

## 3. The change, per hook

Each hook gets one new module with three exports: the query builders, the types of the
rows they return, and the pure merge function. The builders take the Kysely instance as a
parameter, so the module never imports `SystemProvider` and runs in Node tests. The hook
calls `useTypedQuery` once per small query, passes the results to the merge function in a
`useMemo`, and returns exactly what it returns today.

### 3.1 `useUserAlerts` (commit 1)

Module: `src/features/alerts/util/userAlertsData.ts`. The existing `userQuery` (Users by
Clerk id) stays untouched. `:u` is the user's id; `MINE` stands for the subquery of the
user's own alert ids.

Five small queries replace the JOIN:

```sql
-- MINE
(select ua.alert_uuid from "UserAlerts" ua where ua.user_uuid = :u)

-- userAlerts
select id, alert_uuid, dismissed, dismissed_until, created_at
from "UserAlerts" where user_uuid = :u

-- alerts
select id, entity_uuid, entity_type, entity_description, title, message
from "Alerts" where id in MINE

-- bleacherEvents
select id, event_uuid from "BleacherEvents"
where id in (select a.entity_uuid from "Alerts" a
             where a.entity_type = 'bleacher_event' and a.id in MINE)

-- events (the alert's own event, and the bleacher event's event)
select id, event_start, event_end from "Events"
where id in (select a.entity_uuid from "Alerts" a
             where a.entity_type = 'event' and a.id in MINE)
   or id in (select be.event_uuid from "BleacherEvents" be
             where be.id in (select a.entity_uuid from "Alerts" a
                             where a.entity_type = 'bleacher_event'
                               and a.id in MINE))

-- workTrackers
select id, date from "WorkTrackers"
where id in (select a.entity_uuid from "Alerts" a
             where a.entity_type = 'work_tracker' and a.id in MINE)
```

`mergeUserAlerts(parts)` returns `UserAlertRow[]`, the type the hook already exports. For each
`userAlerts` row it takes the `alerts` row with the same `alert_uuid` (no such row: the
row is dropped, as the inner JOIN did), finds the entity by `entity_type`, and sets
`entityDate` and `entityStartDate` by the coalesce order of today's query. Sorting
follows §5.

### 3.2 `useEventChatNotifications` (commit 2)

Module: `src/features/eventChat/utils/chatNotificationsData.ts`. `:u` is the user's id (the
hook's `safeUuid`). Five small queries serve both of today's queries:

```sql
-- SUBS
(select event_uuid from "EventSubscriptions" where user_uuid = :u)

-- subscriptions
select event_uuid, unread from "EventSubscriptions" where user_uuid = :u

-- events
select id, event_name, deleted from "Events" where id in SUBS

-- messages
select id, event_uuid, user_uuid, created_at from "EventMessages"
where event_uuid in SUBS

-- receipts
select message_id from "EventMessageReadReceipts" where user_uuid = :u

-- mentions
select message_id from "EventMessageMentions" where mentioned_user_uuid = :u
```

Two pure functions: `unreadChats(parts, me)` returns the rows of today's unread query
(`eventUuid`, `eventName`, `latestMessageAt`), and `unreadMentionEventIds(parts, me)` returns
the event ids of today's mentions query. The hook's existing composition (names, mention
first, newest first, the two counts) stays as it is.

### 3.3 `useEventChatConversations` (commit 3)

Module: `src/features/eventChat/utils/chatConversationsData.ts`. The same five small queries
as 3.2, written again in this module (D4). Three pure functions: `conversationRows(parts,
me)` (`eventUuid`, `eventName`, `latestMessageAt`), `unreadEventIds(parts, me)` and
`unreadMentionEventIds(parts, me)`. The hook's existing sort stays.

## 4. Locked contracts

The public surface of the hooks does not change:

- `useUserAlerts()` returns `activeAlerts`, `dismissedAlerts`, `activeCount`, `dismiss`,
  `remindLater` and `undismiss`; `UserAlertRow` keeps its fields.
- `useEventChatNotifications()` returns `notifications`, `unreadChatCount` and
  `unreadMentionCount`; `EventChatNotification` keeps its fields.
- `useEventChatConversations()` returns `{ conversations }`; `EventChatConversation` keeps
  its fields.

New types are the row types of the small queries (the fields listed in §3; their
nullability is taken from `AppSchema.ts`, and `expect<T>()` enforces it) and one `…Parts`
object per module that holds one array per small query. Changing any of these, or the
return types above, needs a new "Approved".

## 5. Behaviour that must not change

These are the rules of today's SQL; each one has a test (§7).

- **NULL comparisons.** `m.user_uuid != me` is false when `user_uuid` is NULL; `e.deleted = 0`
  is false when `deleted` is NULL; `es.unread = 1` is false when `unread` is NULL.
- **Inner joins drop rows.** A subscription whose event is not in the local database is
  dropped. An event with no messages gives no unread row, and none in conversations, even
  when `es.unread = 1`. A mention whose message is missing, or whose event the user is not
  subscribed to, is dropped. A `UserAlert` whose `Alert` is missing is dropped.
- **Unread chat.** A chat is unread when, among the messages of a non-deleted subscribed
  event, one is from someone else without a receipt of the user, or the subscription has
  `unread = 1` (then every message of that event qualifies).
- **`latestMessageAt`.** The text maximum of `created_at` over the qualifying messages,
  ignoring NULL; all NULL gives NULL, and the hook already filters that row out. In
  conversations the maximum is over all messages of the event.
- **Duplicates.** Duplicate subscription rows for one event give one result per event.
- **System messages count.** The SQL does not exclude `is_system`; neither does the merge.
- **Alert dates.** `entityDate` is `coalesce(ev.event_end, bev.event_end, wt.date)` and
  `entityStartDate` is `coalesce(ev.event_start, bev.event_start, wt.date)`; the entity is
  taken by `entity_type` (`event`, `bleacher_event`, `work_tracker`); any other type, or a
  missing entity, gives NULL dates and the alert stays.
- **Alert order.** `dismissed_until` ascending with NULL first, then `created_at` descending
  with NULL last, compared as text, not as locale-aware strings. The order of rows that tie
  on both is not defined, today or after.

## 6. Edge cases and error handling

- **Loading.** If any small query is still loading, the hook returns what it returns today
  while loading: no alerts, no notifications, no conversations. It never merges a partial
  set, so a half-loaded state cannot show past alerts or an empty list as a result.
- **Error.** If any small query fails, the hook returns the empty result, as today when the
  one query fails.
- **No user yet.** The placeholder ids (`__no_user__`, `__none__`) stay; all queries return
  nothing for them.
- **Parameters change.** When the user id changes from the placeholder to the real one, all
  small queries change together. The library has a known report of stale results after a
  parameter change right after mount (powersync-js #1125); not checked for this version. The
  old single query had the same exposure. Manual check in §7.
- **Offline, and not yet synced.** Unchanged: the local database is read as before.
- **Clerk.** Not touched: `useUserAlerts` still reads `useUser` and the chat hooks still read
  the permissions store for the user's id.

## 7. Tests (TDD: written first, red, then code)

**Unit tests of the pure functions** (`*Data.test.ts`, table-driven): one case per rule of
§5, plus empty inputs.

**Differential test per hook** (`*Data.differential.test.ts`, D6). The test opens an
in-memory SQLite with Node 24's built-in `node:sqlite` (version 3.53 here; no new
dependency), creates the tables with the columns the queries read, and fills them from a
seeded random generator: several users, events with `deleted` 0, 1 and NULL, duplicate
subscriptions, `unread` 0, 1 and NULL, messages with NULL authors and NULL `created_at`,
receipts, mentions, alerts of all entity types and a missing alert row. For at least 200
datasets it runs

1. the **old SQL**, kept verbatim as a string in the test, and
2. the **new queries** (compiled from the module's builders with a compile-only Kysely)
   followed by the merge function,

and requires equal results. Row order is compared only where the old query defined it; ties
are excluded by giving the generator unique sort keys. The first red run also confirms that
Vitest can import `node:sqlite`; if it cannot, the import is made through
`createRequire` and this spec is updated.

**Manual checks per hook** (the user; Clerk sign-in is not available to the assistant, and
no local Playwright run, so E2E is SKIPPED):

- _Alerts:_ the bell's number and the first five alerts equal the commit before; dismiss,
  remind-later and undismiss still update both.
- _Notifications:_ the Header list shows the same chats in the same order with the same
  counts; a message from another user adds it; opening the chat clears it.
- _Conversations:_ the sidebar order and the unread and mention markers equal the commit
  before.
- _After a reload,_ the three show their values without a stuck empty state (the parameter
  change of §6).

## 8. Measurement

Plan §3 rules apply (local dev, one tab, extensions off, at least 3 runs, before/after
alternated, baseline taken at step 0 on the commit before commit 1). The measure is **M6s**: a
Performance trace of 8 s from the action's start, Screenshots off, read by the assistant as
the busy time and task count of the database worker (the SharedWorker thread with the most
tasks) and the busy time of the main thread. Actions:

- **A_save:** on a quote's edit page change one field and click Save.
- **A_msg:** on the quote's Messages tab, send one chat message. For commit 3 the same
  message is sent with the chat open on `/messages/internal`.

Which action gates which hook: `useUserAlerts` — A_save; `useEventChatNotifications` —
A_save and A_msg; `useEventChatConversations` — A_msg on `/messages/internal`. The rule is
D5. M5 (`perfLog.clear()` before the action, `perfLog.report()` after) is recorded for the
same actions and does not gate.

## 9. Rollback and commits

Three commits, `perf(local-db) step 1: <hook>`, each holding its hook, its module and its
two test files, and touching nothing the others use. Rolling one back is `git revert` of
that commit. If a hook fails D5, only its commit is reverted and the step goes on with the
others. The plan amendments of §1 are their own docs commit.

## 10. Permissions

Unchanged. The three hooks read the same rows for the same signed-in user: every small query
is filtered by the user's id directly or through the subquery of `UserAlerts` or
`EventSubscriptions`. `permissionPageData.ts` is not touched.

## 11. Files

Counted production files: 6 — the three hooks (modified) and the three `*Data.ts` modules
(new). Tests are not counted: six new test files. The plan file is amended (D3 and D5).

## 12. Definition of done (every commit)

With the real tail of each command shown in the report:

- `npm run tc`: PASSED / FAILED.
- `npx vitest run` on the new tests, then the whole suite: PASSED / FAILED.
- Prettier `--check` on the touched files only (the repo gate is red at baseline).
- `npm run test:e2e`: SKIPPED, the user asked for no local Playwright runs.
- The manual checks of §7 and the M6s runs of §8 are the user's; the commit is kept or
  reverted by D5 after the numbers are read.

## 13. To confirm at review

- That "Approved" on the plan also covered its §12 items: where the commits live, and the
  step-0 baseline retake (D5 replaced the third item, the acceptance rule).
- That the unread rule keeps counting system messages from others, as the SQL does today.
