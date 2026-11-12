# Accountant Audit 03: the driver's trackers and their payment status

Status: **IMPLEMENTED 2026-11-06, uncommitted** (APPROVED 2026-11-06; 0 open decisions; amended
the same day by A1, the group is read through `worktracker_group_uuid`; no e2e in this spec).
Build order: **03 of 04**. Needs: nothing in the app (it is a data layer that is given a
driver uuid). Needed by: [04](accountant-audit-04-table.md), which draws what this spec reads.
Plan: [accountant-audit-plan.md](accountant-audit-plan.md). Branch: `q4-sprint3-finance`.

## 0. The feature in brief (the same in the plan and in all four specs)

**The request (user, 2026-11-06, translated).** A new page-tab on `/accountant`, named "Audit".

- **Who it is for:** users with the Accountant role. Admin can open it too. It is not for
  Account Manager, Developer, Viewer, Maintainer or Driver.
- **What it does:** on the tab the user picks a driver in a search select, and a table of all
  of that driver's work trackers appears. Columns: Status, Date, Bleacher number, Type, Pickup
  location, Dropoff location, Drive time, Distance (miles / km), and Paid or Not paid.
- **Where the data comes from:** the `WorkTrackers` table. Paid / Not paid is not stored on a
  tracker. Take the tracker's `date`, find the `WorkTrackerGroups` row (the driver's week) that
  holds that date, and read its `is_paid`.
- **Reuse:** /work-trackers already sorts trackers into weekly groups. Use that code wherever
  possible, do not write new code for it. The Status column uses the same icons as
  /work-trackers.
- **Why:** a history of a driver's trackers, so an accountant can check them quickly, instead of
  opening week after week on /work-trackers and spending time hunting for the right week,
  driver and tracker.
- **How we work:** every spec runs in its own chat, so every spec repeats this context. Each
  spec exists twice: English in the repository, and a full Ukrainian copy as an artifact that
  is not committed. The user takes every decision; a question is asked, never guessed.
- **Design:** `docs/design/accountant-audit/` (`README.md` and three artboards: Main, Search,
  Table). Names, addresses, phone numbers and dates in it are made up.

**Decisions taken by the user (2026-11-06).** The full text, with the options, is in the plan §3.

- **D1:** every status is listed: draft, released, accepted, the in-progress ones, completed,
  cancelled, declined, abandoned.
- **D2:** a tracker whose group cannot be found (no date, or no group for its week) shows "–"
  in the payment column, neither Paid nor Not paid.
- **D3:** the Bleacher column shows the assigned bleacher (`bleacher_uuid`), not the one the
  driver confirmed in the mobile app (`actual_bleacher_uuid`).
- **D4:** the select lists every driver, deactivated ones too. Accountant and Admin both see
  the drivers of all zones.
- **D5:** newest date first. Trackers of one day go by pickup time, Any Time last in the day.
- **D6:** pages of 25 / 50 / 100 with the existing `Pagination` component. The page and the
  size are kept in the URL.
- **D7:** a block with the driver's Address, Phone and Email sits between the select and the
  table (it is in the design, not in the task text).
- **D8:** the chosen driver is kept in the URL.
- **D9:** a row of the table does nothing when clicked.
- **D10:** the Type column is a coloured badge with an icon, as in the design.
- **D11:** four specs and a plan (this split).
- **D12:** a deactivated driver has an "Inactive" label in the open list of the select.
- **D13:** the drivers in the open list are in alphabetical order: first name, then last name.

**What the code already has (researched 2026-11-06).**

- **The page.** `src/app/accountant/page.tsx`. Its tabs are declared in `ACCOUNTANT_TABS`
  (`src/features/quotesAndBookings/utils/listTabs.ts`): Collections (the one a bare
  `/accountant` opens), AR Deposits, Need attention. The page's hook `useListPageState` owns
  `tab`, `page`, `pageSize`, `sort`, `q`, `showDeleted` and the filters in the URL, and keeps
  every parameter it does not own. Collections is the model of a tab with parameters of its own
  (`csort`, `cdir`, `cnotdue`) that hides the receivables chrome: the filter sidebar, the Filter
  button, Show Deleted, the search box and the filter chips.
- **Access.** `/accountant` is in `allowedPaths` of `admin` and of `accountant`
  (`src/features/userAccess/accessConfig.ts`) and of no other role. A tab inside it is out of
  reach of the other five roles with no extra code.
- **Permissions matrix.** `src/features/userAccess/permissionPageData.ts` has seven roles
  (`admin`, `account_manager`, `accountant`, `maintainer`, `driver`, `viewer`, `developer`).
  CLAUDE.md says to update it in the same commit as the change. `permissionPageData.test.ts`
  pins the exact list of rows the accountant is granted, so a new row must be added there too.
- **Tables.**
  - `WorkTrackers`: `date` (text `YYYY-MM-DD`, nullable), `driver_uuid`, `status` (enum),
    `bleacher_uuid` -> `Bleachers.bleacher_number`, `work_tracker_type_uuid` ->
    `WorkTrackerTypes` (`code`, `display_name`), `pickup_address_uuid` and
    `dropoff_address_uuid` -> `Addresses` (`street`, `city`, `state_province`, `zip_postal`),
    `drive_minutes`, `distance_meters`, `pickup_time_start`, `worktracker_group_uuid`.
  - `WorkTrackerGroups`: one row per driver per week (`unique (driver_uuid, week_start)`),
    Monday to Sunday (`week_start`, `week_end`), with `is_paid` (local value 0 / 1 / null).
    A database trigger (`assign_worktracker_to_group`) creates the group with the week's first
    tracker and fills `WorkTrackers.worktracker_group_uuid` whenever a tracker has a date and a
    driver. A tracker with no date has no group.
  - `Drivers` (`user_uuid`, `address_uuid`, `phone_number`, `is_active`), `Users` (`first_name`,
    `last_name`, `email`, `phone`, `status_uuid`; `STATUSES.inactive` is the deactivated one).
- **Local-first reads.** App data is read from the local PowerSync database through `db`
  (Kysely) and `useTypedQuery(compiled, expect<T>())`, never `supabase.from(...)`
  (`docs/POWERSYNC_ARCHITECTURE.md`). The local tables `WorkTrackers` and `WorkTrackerGroups`
  both have an index on `driver_uuid` (`src/lib/powersync/AppSchema.ts`).
- **Sync.** The Accountant and the Admin buckets of `br_powersync/config/sync_rules.yaml` give
  the whole `WorkTrackers`, `WorkTrackerGroups`, `WorkTrackerTypes`, `Drivers`, `Users`,
  `Addresses` and `Bleachers` tables, so no sync-rule change is expected. It stays unchecked
  by a test, so the implementer reads those buckets again before starting.
- **What /work-trackers offers for reuse.**
  - `WorkTrackerStatusBadge` with `showText={false}`: the status icon, as in `TripList`.
  - `WORK_TRACKER_TYPE_STYLES` and `WORK_TRACKER_TYPE_STYLE_FALLBACK`
    (`src/features/workTrackers/constants.ts`): the colour and icon of each type.
  - `formatDriveTime` ("2.4 hrs") and `formatMileage` ("21.4 mi (34.4 km)")
    (`src/features/workTrackers/util.ts`).
  - `useDrivers` and `SelectUserDropDown`, the select behind `SelectDriver`.
  - `workTrackerGroupPaid.ts` and `useWorkTrackerGroupPaid`: read one group by (driver, week
    start). That fits a single week, not a history; a history needs the group of each tracker,
    which the tracker's own `worktracker_group_uuid` gives (A1 of spec 03).
  - `Pagination` and `PageSize` (25 / 50 / 100), and `DataTable` (`src/components/DataTable.tsx`).
- **Read-only.** The tab writes nothing. Marking a week Paid stays on the Work Trackers pages.
- **Checks of the project (CLAUDE.md).** `npm run tc`, `npm run test`, `npm run lint` (format
  only the touched files: `npm run format` rewrites about 120 unrelated files). Playwright
  specs are written and **not run** (the user's rule); mark that step SKIPPED in the report.
  The seeded E2E admin user has no `Users` row locally, so admin specs cannot run there.

## 1. What this spec decides

This spec is the **data layer** and nothing the user sees: the local queries that read one
driver's work trackers, one page at a time, with each tracker's Paid / Not paid, and the hook
that serves them. It changes no screen, so it needs no permissions row and no e2e.

**Decisions that apply (plan §3), with the user's answers:**

- **D1: which statuses are listed.** Options were: every status; every status except Draft; only
  Completed. **User's answer:** every status. Consequence: no `status` condition in the queries;
  a cancelled tracker is read like any other.
- **D2: payment status when no group is found.** Options were: "Not paid"; a dash. **User's
  answer:** a dash. Consequence: the payment has three values, `paid`, `not_paid` and `none`,
  and `none` is drawn as "–".
- **D3: which bleacher number.** Options were: the assigned one; the actual one if the driver
  swapped; both. **User's answer:** the assigned one, as /work-trackers shows it.
  Consequence: `Bleachers` is joined on `WorkTrackers.bleacher_uuid`; `actual_bleacher_uuid` is
  not read.
- **D5: the order.** **User's answer:** newest date first; trackers of one day by pickup time
  with Any Time (no pickup time) last in the day.
- **D6: paging.** **User's answer:** pages of 25 / 50 / 100. This spec supplies the page and the
  total; the pager is spec 04.

**Amendment A1 (2026-11-06, after the first draft): how a tracker finds its group.**

- **Question:** how the Paid / Not paid of a tracker is found. The request said to take the
  tracker's date and look up the week's group. The first draft followed that with a join on the
  driver and a date range (`week_start <= date <= week_end`), and offered the tracker's own
  `worktracker_group_uuid` as a reading (the database fills it from the same date).
- **User's answer:** use `worktracker_group_uuid` instead of the extra calculations.
- **Consequence:** the groups join is a plain join on the group's id. There is no date
  comparison and no week boundary in the query. A tracker with no `worktracker_group_uuid`
  (it has no date), or whose group row is not on the device, has no group and reads `none`
  (D2). The result is the same as the date rule for every tracker that has a date.

**Readings to confirm:**

- **R1:** Paid / Not paid is read through the tracker's own link (A1):
  `WorkTrackerGroups g` joined on `g.id = wt.worktracker_group_uuid`. The database keeps the
  column right: the trigger `assign_worktracker_to_group` sets it whenever a tracker with a date
  and a driver is inserted, or its date or driver is changed; `validate_worktracker_group`
  refuses a group of another driver or another week; and the migration
  `20260316134614_backfill_worktrackergroups.sql` filled it for the trackers that existed.
  So every tracker with a date and a driver has the link. This spec does not repair a tracker
  whose link is missing; it reads `none` for it.
- **R2:** the group is joined in SQL, in the one query for the page, on the group's id, so each
  tracker gets at most one group and cannot be repeated. There are two watchers per driver: the
  page and the total. This is lighter than one watcher per row (the docstring of
  `useWorkTrackerGroupPaid` warns against that).
- **R3:** paging is done in SQL (`LIMIT` / `OFFSET`), with a separate `count(*)` for the total.
  The order has a last tie-break on `WorkTrackers.id` so that a row never moves between pages.
- **R4:** a page number past the last page is clamped to the last page; a page number below 1 is
  page 1. While the total is still loading the page is only raised to 1.
- **R5:** a group with `is_paid` null (a row synced before the column existed) reads as Not paid,
  the way `useWorkTrackerGroupPaid` reads it (`!!row?.is_paid`).
- **R6:** a tracker whose type, bleacher or an address row is missing is still listed, with null
  for that part (left joins).
- **R7:** the hook returns the driver's trackers of every status and every date: no date window.

## 2. Research findings

- `useWorkTrackersForWeek` (`workTrackers/hooks/useWorkTrackersForWeek.ts`) is the model of the
  tracker read: `WorkTrackers wt` left-joined to `Bleachers b` (`bleacher_number`),
  `WorkTrackerTypes t` (`display_name`), and `Addresses` twice (`pickup`, `dropoff`); ordered by
  `wt.date`, then `wt.pickup_time_start is null`, then `wt.pickup_time_start`. It filters one
  week. This spec keeps the joins and the same-day order, drops the week window, flips the date to
  descending and adds `LIMIT` / `OFFSET`.
- `pickup_time_start` is plain text `HH:MM:SS`; a null means Any Time. In SQLite, `order by x
desc` puts nulls last, so undated trackers fall to the end of the list.
- The group of a week on /work-trackers is read by driver and `week_start`
  (`buildWorkTrackerGroupPaidQuery`); `useDriversForWeek` reads all groups of a week. A tracker
  also carries its own link, `WorkTrackers.worktracker_group_uuid` (a foreign key to
  `WorkTrackerGroups.id`). The database sets it from the tracker's driver and date
  (`assign_worktracker_to_group`, before insert or before an update of `date` or `driver_uuid`;
  a tracker with no date or no driver gets none), checks it (`validate_worktracker_group`) and
  backfilled it once (`20260316134614_backfill_worktrackergroups.sql`). A group is one row per
  driver per week, Monday to Sunday (`unique (driver_uuid, week_start)`). The column is in the
  local schema (`AppSchema.ts`, with an index).
- `WorkTrackers` has a local `driver_uuid` index, which the driver filter uses. `Bleachers`,
  `WorkTrackerTypes`, `Addresses` and `WorkTrackerGroups` are joined on their id.
- The tests of local queries run the compiled SQL on `node:sqlite` with a fake Kysely `db`
  (`workTrackerGroupPaid.test.ts`, `useWorkTrackerAccess.test.ts`); this spec uses the same
  harness.
- `docs/specs/slow-local-db-step1-split-watchers.md` is the repo's rule for local watchers:
  small queries, few of them. This spec has two per driver.
- Local booleans are 0 / 1 (`is_paid`).

## 3. Design

**`utils/auditRows.ts`** (new, pure).

```ts
import type { Enums } from "../../../../database.types";

export type AuditPayment = "paid" | "not_paid" | "none";

export type AuditAddress = {
  street: string | null;
  city: string | null;
  stateProvince: string | null;
  zipPostal: string | null;
};

export type AuditTrackerRow = {
  id: string;
  status: Enums<"worktracker_status">;
  date: string | null; // "YYYY-MM-DD"
  bleacherNumber: number | null; // D3: the assigned bleacher
  typeCode: string | null;
  typeName: string | null;
  pickup: AuditAddress | null; // null when the tracker has no pickup address row
  dropoff: AuditAddress | null;
  driveMinutes: number | null;
  distanceMeters: number | null;
  payment: AuditPayment;
};

/** D2 and R5. */
export function resolvePayment(groupId: string | null, isPaid: number | null): AuditPayment;

/** R4. `total` is undefined while it is loading. */
export function clampPage(page: number, total: number | undefined, pageSize: number): number;
```

`resolvePayment` returns `none` when `groupId` is null, otherwise `paid` for a truthy `isPaid`
and `not_paid` for 0 or null. `clampPage` is `max(1, min(page, ceil(total / pageSize)))` once
`total` is known (a total of 0 gives page 1), and `max(1, page)` while it is undefined.

**`db/auditTrackers.ts`** (new). Two builders, both with the `"__none__"` sentinel for a null
driver, so the query is inert until a driver is chosen:

```ts
export function buildAuditTrackersQuery(driverUuid: string | null, page: number, pageSize: number);
export function buildAuditTrackerCountQuery(driverUuid: string | null);
```

`buildAuditTrackersQuery`:

- `db.selectFrom("WorkTrackers as wt")`, left joins: `Bleachers as b` on `b.id = wt.bleacher_uuid`;
  `WorkTrackerTypes as t` on `t.id = wt.work_tracker_type_uuid`; `Addresses as pu` on
  `pu.id = wt.pickup_address_uuid`; `Addresses as dof` on `dof.id = wt.dropoff_address_uuid`;
  `WorkTrackerGroups as g` on `g.id = wt.worktracker_group_uuid` (A1, R1).
- Selects `wt.id`, `wt.status`, `wt.date`, `b.bleacher_number`, `t.code as type_code`,
  `t.display_name as type_name`, the four address fields of each of `pu` and `dof`
  (`pickup_id`, `pickup_street`, ..., `dropoff_id`, `dropoff_street`, ...), `wt.drive_minutes`,
  `wt.distance_meters`, `g.id as group_id`, `g.is_paid as group_is_paid`.
- `where wt.driver_uuid = ?`; no condition on `status` (D1).
- `order by wt.date desc, wt.pickup_time_start is null asc, wt.pickup_time_start asc, wt.id asc`
  (D5, R3).
- `limit pageSize offset (page - 1) * pageSize`.

`buildAuditTrackerCountQuery`: `select count(*) as total from "WorkTrackers" where driver_uuid = ?`.

**`toAuditRow(row)`** (in `auditRows.ts`) maps a result row to `AuditTrackerRow`: the address is
`null` when its `*_id` is null, otherwise the four fields; `payment` is
`resolvePayment(group_id, group_is_paid)`.

**`hooks/useAuditTrackers.ts`** (new).

```ts
export function useAuditTrackers(
  driverUuid: string | null,
  page: number,
  pageSize: PageSize,
): {
  rows: AuditTrackerRow[];
  total: number;
  page: number; // the effective page, after clampPage
  isLoading: boolean;
  error: Error | undefined;
};
```

It runs the count query, computes `effective = clampPage(page, total, pageSize)`, then runs the
page query for `effective`. Both through `useTypedQuery(compiled, expect<Row>())`, the queries
memoised on their inputs. With a null driver both queries are the inert sentinel ones, the hook
returns `rows: []`, `total: 0`, `isLoading: false`. `isLoading` is true while either query is.
`error` is the first error of the two.

No database change, no `AppSchema.ts` change, no sync-rule change, no permissions change.

## 4. Behaviour scenarios (Playwright, written, not run)

None. The spec changes nothing the user sees. Its behaviour is covered by the real-SQLite tests
of §5 and, on screen, by spec 04's scenarios.

## 5. Tests (Vitest)

- `auditTrackers.test.ts` (new, real SQLite, the harness of `workTrackerGroupPaid.test.ts`) with
  `WorkTrackers`, `WorkTrackerGroups`, `Bleachers`, `WorkTrackerTypes` and `Addresses` tables:
  - only the chosen driver's trackers come back, of every status (draft, cancelled, declined,
    abandoned and completed all present);
  - the order: newest date first; on one date earlier pickup time first, a null pickup time last;
    a tracker with no date at the end; equal rows ordered by id;
  - paging: pages of 2 over 5 trackers give 2, 2, 1 rows, no row twice, none missing; the count
    query says 5;
  - payment (A1): a tracker linked to a paid group is `paid`; linked to an unpaid group
    (`is_paid` 0) `not_paid`; linked to a group with `is_paid` null `not_paid`; a tracker with
    a null `worktracker_group_uuid` (no date) is `none`; a tracker whose `worktracker_group_uuid`
    names a group row that is not in the table is `none`; the status follows the linked group
    and nothing else (a paid group of the same driver and week that the tracker is not linked
    to is not used); two trackers linked to one group get the same status;
  - the bleacher is the assigned one: with `actual_bleacher_uuid` set to another bleacher the
    row still carries the assigned bleacher's number;
  - a missing type, bleacher, pickup or dropoff address row leaves the tracker listed with nulls;
  - the sentinel driver returns no rows and a count of 0.
- `auditRows.test.ts`: `resolvePayment` (null group, paid, 0, null); `clampPage` (page 0, 3 of 2
  pages, exactly the last page, total 0, total undefined); `toAuditRow` (a full row, no address
  ids give null addresses).
- `useAuditTrackers.test.tsx`: with `useTypedQuery` mocked: a null driver is inert; a page past
  the end asks for the last page's offset; `isLoading` follows either query; the error of either
  is returned.

## 6. Files

Production, 3: `accountantAudit/utils/auditRows.ts` (new), `accountantAudit/db/auditTrackers.ts`
(new), `accountantAudit/hooks/useAuditTrackers.ts` (new).

Tests: the three of §5.

## 7. Edge cases and error handling

- **No driver chosen.** Inert queries, no rows, no loading flag.
- **A driver with no trackers.** `rows: []`, `total: 0`; spec 04 draws the empty message.
- **A driver with many trackers.** Only one page is read; the total is a separate cheap count.
- **A tracker with no group link, or whose group row is not on the device** (the database makes
  the group and the link when a tracker with a date is saved, so this is rare: a tracker or its
  group not yet synced down). `none`, drawn as "–" (D2). It turns into Paid / Not paid by itself
  when the group arrives.
- **A tracker with no date.** No link and no group, `none`; it is listed after all dated ones
  (D5).
- **A group marked paid or unpaid on /work-trackers while Audit is open.** The page query reads
  `WorkTrackerGroups`, so it re-runs and the status changes by itself.
- **Offline, auth error from Clerk.** The data is local; nothing is fetched online.

## 8. Out of scope

- The table, the status icons, the formatting of time and distance (spec 04).
- Filters, search, sorting by a column, a date window: none was asked for.
- Any write. Marking a week paid stays on /work-trackers.
- Reading `actual_bleacher_uuid` (D3).
- A join on the driver and a date range, and any week arithmetic (A1).
- Repairing a tracker whose `worktracker_group_uuid` is missing (R1).

## 9. Implementation notes (2026-11-06)

No contract of §3 changed: the three files, the exported names and signatures are as written.
Where the spec left a detail open, this is what was built:

- **Builders return compiled queries.** `buildAuditTrackersQuery` and
  `buildAuditTrackerCountQuery` end in `.compile()`, like `buildWorkTrackerGroupPaidQuery`, so the
  tests run them through the harness of `workTrackerGroupPaid.test.ts` and the hook passes them
  straight to `useTypedQuery`.
- **The raw row has a name.** `AuditTrackerResultRow` (exported from `auditRows.ts`) is the row
  `toAuditRow` takes, one field per selected column. Its `status` is `string | null`, as the local
  schema types it; `toAuditRow` casts it to `Enums<"worktracker_status">`.
- **Address column names** (the `...` of §3): `pickup_street`, `pickup_city`,
  `pickup_state_province`, `pickup_zip_postal`, and the same four with `dropoff_`.
- **No driver:** the hook itself returns `rows: []`, `total: 0` and `isLoading: false`, so a stale
  or still-loading result of the inert queries never leaks out. Both queries still run, because
  hooks cannot be skipped.
- **`error`** is the count query's error, else the page query's.
- **The five joins stay (user, 2026-11-06).** The page query has five left joins (`Bleachers`,
  `WorkTrackerTypes`, `Addresses` twice, `WorkTrackerGroups`), while
  [slow-local-db-step1-split-watchers.md](slow-local-db-step1-split-watchers.md) prefers small
  queries joined in JS for heavy watched queries. The user kept the joins as approved in R2 and
  will deal with them only if a slowdown shows on the Audit tab. Nothing was measured.
- **Sync buckets read again** (R-C): the Accountant bucket (`Drivers`, `Addresses`, `Bleachers`,
  `WorkTrackers`, `WorkTrackerGroups`, `WorkTrackerTypes`, `Users`) and the Admin bucket of
  `br_powersync/config/sync_rules.yaml` give all the tables this spec reads. No sync-rule change.
- **Tests:** 49 in three files (`auditRows.test.ts` 15, `auditTrackers.test.ts` 21,
  `useAuditTrackers.test.tsx` 13). The ordering tests were checked by mutation: without the `wt.id`
  tie-break, or with the date ascending, they fail.
