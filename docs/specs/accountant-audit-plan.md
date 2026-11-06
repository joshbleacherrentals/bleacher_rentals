# Accountant Audit: plan

Status: **DRAFT 2026-11-06, waiting for "Approved"** (0 open decisions; readings to confirm in
§5). Four specs follow from it; each is its own logic, its own "Approved" and its own commit.
Page: `/accountant`, the new tab "Audit". Design: `docs/design/accountant-audit/`.
Branch: `q4-sprint3-finance`.

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
    start). That fits a single week, not a history; a history needs the group of each
    tracker's date, which is a join by date.
  - `Pagination` and `PageSize` (25 / 50 / 100), and `DataTable` (`src/components/DataTable.tsx`).
- **Read-only.** The tab writes nothing. Marking a week Paid stays on the Work Trackers pages.
- **Checks of the project (CLAUDE.md).** `npm run tc`, `npm run test`, `npm run lint` (format
  only the touched files: `npm run format` rewrites about 120 unrelated files). Playwright
  specs are written and **not run** (the user's rule); mark that step SKIPPED in the report.
  The seeded E2E admin user has no `Users` row locally, so admin specs cannot run there.

## 1. The four specs

- **01, the tab:** [accountant-audit-01-tab.md](accountant-audit-01-tab.md). The tab `audit` on
  `/accountant`, its empty state, hiding the receivables chrome, and the row "Driver Audit" in
  the permissions matrix (same commit, as CLAUDE.md asks).
- **02, the driver select:** [accountant-audit-02-driver-select.md](accountant-audit-02-driver-select.md).
  The search select (every driver, deactivated ones marked, alphabetical), the chosen driver in
  the URL, and the block with the driver's Address, Phone and Email.
- **03, the data:** [accountant-audit-03-tracker-data.md](accountant-audit-03-tracker-data.md).
  The local queries and the hook: one driver's trackers, a page at a time, with Paid / Not paid
  from the week's group. Nothing visible.
- **04, the table:** [accountant-audit-04-table.md](accountant-audit-04-table.md). The nine
  columns, the status icons, the type badge, the payment pill, the pager and the states.

## 2. Build order

01, 02, 03, 04. 01 comes first (the shell). 02 and 03 do not need each other and may be built in
either order. 04 needs all three. The four go out in one release: 01 alone shows "Pick a driver
above" without a select, and the matrix row describes the finished tab.

Every spec repeats the shared context of §0, so it can run in a chat of its own. Each one is
approved with an explicit "Approved" before any code (CLAUDE.md, Spec-Driven Development), then
built test-first, and closed with the final report of CLAUDE.md (`npm run tc`, `npm run test`,
`npm run lint`; Playwright written and reported SKIPPED).

## 3. Decisions taken (all by the user, 2026-11-06)

Settled by the request, so not asked: who the tab is for; its name and place; the nine columns;
that Paid / Not paid comes from the week's group found through the tracker's date; that the
Status column uses the icons of /work-trackers; that the code of /work-trackers is reused where
it can be.

**D1: which statuses are listed.**

- **Options:** every status; every status except Draft; only Completed.
- **User's answer:** every status. A cancelled or declined tracker is listed and gets a payment
  cell like any other.

**D2: the payment cell when no group is found** (a tracker with no date, or no group for its
week).

- **Options:** "Not paid"; a dash.
- **User's answer:** a dash. Paid, Not paid and "–" are the three looks.

**D3: which bleacher number.**

- **Options:** the assigned one (as /work-trackers); the actual one when the driver swapped; both.
- **User's answer:** the assigned one.

**D4: which drivers the select lists.** (Told to the user as fact: the accountant and the admin
see the drivers of all zones.)

- **Options:** active drivers only (as /work-trackers); every driver, deactivated ones too.
- **User's answer:** every driver, deactivated ones too. A deactivated driver's history can be
  opened. `useDrivers` gets an option for it; other callers are unchanged.

**D5: the order of rows.**

- **Options:** newest first; oldest first.
- **User's answer:** newest first. Trackers of one day by pickup time, Any Time last in the day.

**D6: how many rows at once.**

- **Options:** all rows in one table; pages of 25 / 50 / 100 with the existing `Pagination`.
- **User's answer:** pages of 25 / 50 / 100. The page and the size are kept in the URL.

**D7: the driver's details block** (in the design, not in the task text).

- **Options:** add it; leave it out.
- **User's answer:** add it: Address, Phone, Email under the select.

**D8: the chosen driver in the URL.**

- **Options:** yes; no.
- **User's answer:** yes. After F5, Back or a copied link the same driver opens.

**D9: a click on a row** (not drawn in the design).

- **Options:** nothing; open the driver's week on /work-trackers.
- **User's answer:** nothing.

**D10: the Type column.**

- **Options:** a coloured badge with an icon; plain text.
- **User's answer:** a coloured badge with an icon.

**D11: how to cut the work.**

- **Options:** four specs; three; two. A plan file in each case.
- **User's answer:** four specs.

**D12: marking a deactivated driver in the select.**

- **Options:** an "Inactive" label; no marker.
- **User's answer:** an "Inactive" label in the open list.

**D13: the order of drivers in the open select.**

- **Options:** the order of the existing query (by user id, not alphabetical); alphabetical.
- **User's answer:** alphabetical (first name, then last name), in Audit only.

## 4. The design

`docs/design/accountant-audit/README.md` describes three artboards: no driver chosen, the select
open with a search typed, and the table. It departs from the author's sketch in four ways, all
kept: the active tab uses the app's own tab style; the select is the app's existing select (up
and down chevron, search inside the list, a clear button); dates are `YYYY-MM-DD`; and an empty
state exists for "no driver chosen".

The design left two things undecided: which drivers can be chosen and which statuses are listed.
The user decided them (D4, D1). The design does not draw these, and the specs add them: the
"Inactive" label (D12), the dash in the payment cell (D2), the empty message of a driver without
trackers, and the loading and error states. The driver names in the Search artboard are sample
names, not an order (D13 is alphabetical).

## 5. Readings to confirm

Each spec lists its own readings in its §1. These touch more than one spec:

- **R-A:** the names of the URL parameters: `tab=audit` (the page's own), `driver` (the user's
  example), and `apage` and `apagesize` (my names, after Collections' `csort`, `cdir`,
  `cnotdue`).
- **R-B:** the new code lives in a new feature folder `src/features/accountantAudit/` with
  `components/`, `hooks/`, `db/`, `utils/` and `e2e/`, the layout of `accountantCollections`.
- **R-C:** no migration, no `AppSchema.ts` change and no sync-rule change in any of the four
  specs. Each implementer reads the Accountant and Admin buckets once more before starting.
- **R-D:** the tab writes nothing. It never changes a tracker, a group or a payment.

## 6. Out of scope for the series

- Filters, search, sorting by a column, a date range, totals and export on the table.
- Opening a tracker or a week from a row; the attention mark and Inspections link.
- Marking a week paid from this tab; changing any driver or tracker.
- The accountant's other tabs and `useListPageState`.
