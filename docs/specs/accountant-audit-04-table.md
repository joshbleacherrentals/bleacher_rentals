# Accountant Audit 04: the table

Status: **IMPLEMENTED 2026-11-06, uncommitted** (APPROVED 2026-11-06; 0 open decisions; readings
R1-R11 in §1 approved with the spec; e2e written, not run; details in §9). Build order: **04 of 04**. Needs: [01](accountant-audit-01-tab.md) (the tab),
[02](accountant-audit-02-driver-select.md) (the chosen driver and `auditUrlState.ts`),
[03](accountant-audit-03-tracker-data.md) (`useAuditTrackers`). Needed by: nothing.
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
    start). That fits a single week, not a history; a history needs the group of each
    tracker's date, which is a join by date.
  - `Pagination` and `PageSize` (25 / 50 / 100), and `DataTable` (`src/components/DataTable.tsx`).
- **Read-only.** The tab writes nothing. Marking a week Paid stays on the Work Trackers pages.
- **Checks of the project (CLAUDE.md).** `npm run tc`, `npm run test`, `npm run lint` (format
  only the touched files: `npm run format` rewrites about 120 unrelated files). Playwright
  specs are written and **not run** (the user's rule); mark that step SKIPPED in the report.
  The seeded E2E admin user has no `Users` row locally, so admin specs cannot run there.

## 1. What this spec decides

This spec draws what spec 03 reads: the table with its nine columns, the status icons, the Paid /
Not paid pill, the pager, and the loading, empty and error states. It also keeps the page in the
URL.

**Decisions that apply (plan §3), with the user's answers:**

- **D2: no group.** **User's answer:** a dash. So the payment cell has three looks: Paid, Not
  paid, and "–".
- **D6: paging.** **User's answer:** pages of 25 / 50 / 100 with the existing `Pagination`
  component; the page and the size are kept in the URL.
- **D9: a click on a row.** Options were: nothing; open the driver's week on /work-trackers.
  **User's answer:** nothing. The table is for reading; to open a tracker or a week the
  accountant goes to /work-trackers.
- **D10: the Type column.** Options were: a coloured badge with an icon; plain text.
  **User's answer:** a coloured badge with an icon, as in the design.
- **The Status column** uses the icons of /work-trackers (the request): `WorkTrackerStatusBadge`
  without its text.

**Readings to confirm:**

- **R1:** the table is the shared `DataTable` (`src/components/DataTable.tsx`): columns with
  `render`, `emptyMessage`, `isLoading`. No `sort`, no `onRowClick`, no `getRowHref` (D9). Its
  header look (uppercase, `gray-50`) is the design's header. The column widths of the design
  (`64 104 84 120 flex flex 88 108 124`) are not set: `DataTable` has no width option and sizes
  columns by content. The table scrolls sideways when it is narrow, as `DataTable` does.
- **R2:** the page and the page size are the tab's own URL parameters, `apage` and `apagesize`,
  not the page-level `page` and `pageSize`. Reason: the page-level ones are shared with the
  receivables tabs and reset on a tab change, and a driver change must reset the page in the
  same URL write that sets the driver; two writes at once would race with the page hook's
  debounced write. Page 1 and size 25 are left out of the URL.
- **R3:** the status cell is the badge in a `<span title="Completed">` with the same word as
  visually hidden text, so the icon has a name for a mouse and for a screen reader. The words are
  the badge's own: Draft, Released, Accepted, In Progress (the four in-progress statuses),
  Completed, Cancelled, Declined, Abandoned. The attention mark of /work-trackers is not shown.
- **R4:** the Type badge takes its colour and icon from `WORK_TRACKER_TYPE_STYLES[typeCode]`, or
  `WORK_TRACKER_TYPE_STYLE_FALLBACK`, and its words from `WorkTrackerTypes.display_name`, so a
  renamed type shows its new name. No type shows "–".
- **R5:** a location is two lines: the street, and under it (12px, grey) `city, state zip`
  with missing parts left out. No address shows "–".
- **R6:** Drive time is `formatDriveTime`, Distance is `formatMileage` ("100.0 mi (160.9 km)").
  Both show "–" when they return an empty string. The design puts miles and km on two lines;
  the same text wrapped at the space is that picture.
- **R7:** the pill colours are the design's: Paid `#dcede2` background, `#2f6b4c` text, a
  check-circle icon; Not paid `#fbf0da`, `#8a6320`, an empty-circle icon. The word is always
  printed, so colour is not the only signal.
- **R8:** the date is shown as stored (`YYYY-MM-DD`); a missing date or bleacher number shows
  "–".
- **R9:** the pager is shown below the table when the data is not loading and the total is above
  0 (as `NeedAttentionTab`). On a page change the tab scrolls to the top with the layout's
  `scrollRef`, as `goToPage` on the page does.
- **R10:** words: empty driver "This driver has no work trackers", loading "Loading work
  trackers...", error "Error loading work trackers: {message}" (`role="alert"`).
- **R11:** a status value the badge does not know (a new value in the enum) leaves the icon empty
  and the title falls back to the raw value. Nothing crashes.

## 2. Research findings

- `DataTable<T>` renders its header from `columns` (`key`, `header`, `render`, optional `align`),
  shows `loadingMessage` instead of the table while `isLoading`, and one row with `emptyMessage`
  when there is no data. A row is a link or a click target only when `getRowHref` / `onRowClick`
  is given.
- `NeedAttentionTab` is the model of "table, then `Pagination` if there is data".
- `Pagination` takes `{ page, pageSize, totalItems, onPageChange, onPageSizeChange }`, and its
  `PageSize` is 25, 50 or 100. `parsePage` and `parsePageSize` (`quotesAndBookings/utils/
pagination.ts`) read the URL values back, with page 1 and size 25 as the fallback.
- `WorkTrackerStatusBadge` with `showText={false}` is what `TripList` draws in its first column.
  Without `workTrackerId` it draws no Inspections link; for the four in-progress statuses it draws
  a play icon, for completed an award icon (the design's icon).
- `WORK_TRACKER_TYPE_STYLES` has `trip`, `repair_maintenance` and `site_visit_cleaning_other`;
  `WorkTrackerTypeSelect` and the Work Tracker Types page read it with a private one-line lookup.
- `formatDriveTime`, `formatMileage` are in `workTrackers/util.ts`. `formatAddressForCopy`
  (`venues/logic`) is the model of an address line (R5).
- Spec 02 left `auditUrlState.ts` with the `driver` parameter and `withAuditDriver`.
- `useLayoutContext().scrollRef` is the layout's scroll container (the page uses it).

## 3. Design

**`utils/auditUrlState.ts`** (spec 02's file, extended).

```ts
export const AUDIT_PAGE_PARAM = "apage";
export const AUDIT_PAGE_SIZE_PARAM = "apagesize";
export function parseAuditPaging(searchParams): { page: number; pageSize: PageSize };
export function withAuditPaging(
  current: URLSearchParams,
  paging: { page: number; pageSize: PageSize },
): string;
```

`parseAuditPaging` uses `parsePage` and `parsePageSize`. `withAuditPaging` keeps every other
parameter, writes `apage` only when the page is above 1 and `apagesize` only when the size is not 25. `withAuditDriver` (spec 02) now also deletes `apage`: a new driver starts at page 1, in the
same write.

**`utils/auditFormat.ts`** (new, pure).

```ts
export function formatAddressLines(
  a: AuditAddress | null,
): { street: string; place: string } | null;
export function auditStatusLabel(status: string): string; // R3, R11
```

`formatAddressLines` returns null when the address is null or every part is empty; `street` is the
street ("" if none) and `place` is `city, state zip` with the empty parts dropped.

**`components/WorkTrackerTypeBadge.tsx`** (new). Props `{ code: string | null; name: string | null }`.
A `<span>` `inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-[13px]
font-medium` with the style's `bg`, `border` and `text` classes, the style's icon (14px) and the
name. A null name renders "–".

**`components/AuditPaymentPill.tsx`** (new). Props `{ payment: AuditPayment }`. `paid` and
`not_paid` render a rounded-full pill (`gap-1.5 px-2.5 py-0.5 text-[13px] font-medium`) with the
colours of R7, a lucide `CircleCheck` or `Circle` icon (14px) and the word "Paid" / "Not paid".
`none` renders "–". `data-testid="audit-payment"` with `data-payment={payment}`.

**`components/AuditTrackersTable.tsx`** (new). Props
`{ rows: AuditTrackerRow[]; isLoading: boolean; error: Error | undefined }`. When `error` is set
it renders the alert of R10 instead of the table. Otherwise a `DataTable<AuditTrackerRow>` with
`keyExtractor={(r) => r.id}`, `emptyMessage` and `loadingMessage` of R10, and nine columns:

- **Status:** `<span title={label}><WorkTrackerStatusBadge status={row.status} showText={false} />
<span className="sr-only">{label}</span></span>`.
- **Date:** `row.date ?? "–"`, `tabular-nums`.
- **Bleacher:** `row.bleacherNumber ?? "–"`.
- **Type:** `WorkTrackerTypeBadge`.
- **Pickup location**, **Dropoff location:** `formatAddressLines`: street, then place in small grey
  text; "–" when null.
- **Drive time:** `formatDriveTime(row.driveMinutes) || "–"`.
- **Distance:** `formatMileage(row.distanceMeters) || "–"`, in a block that wraps (R6).
- **Payment status:** `AuditPaymentPill`.

`data-testid="audit-table"` is on a wrapper around the table. `DataTable` gives no hook for a
row's attributes, so a row is found by its Status cell, which carries
`data-testid="audit-row-status"`.

**`components/AuditTab.tsx`** (spec 02's file, extended). With a driver chosen it now renders,
under the details block: `AuditTrackersTable` and, per R9, `Pagination`.

- `const { page, pageSize } = parseAuditPaging(searchParams)`.
- `const { rows, total, page: effectivePage, isLoading, error } = useAuditTrackers(driverUuid,
page, pageSize)`.
- `Pagination` gets `page={effectivePage}`, `pageSize`, `totalItems={total}`.
- `onPageChange(next)` and `onPageSizeChange(size)` write the URL with one `router.replace(...,
{ scroll: false })` through `withAuditPaging` (a size change goes to page 1), then scroll the
  layout to the top.
- A driver change uses `withAuditDriver`, which already drops `apage` (spec 02 + this spec).
- With no driver chosen the empty state of spec 01 is shown and the table is not mounted, so no
  tracker query runs (the hook gets null).

No database change, no sync-rule change, no `AppSchema.ts` change. The permissions row was
written by spec 01 and does not change.

**Where it departs from the design.** `DataTable` draws the header and rows in its own spacing,
so row height and column widths are not the design's exact pixels. The status icon button is the
badge's own (padding 6px, bordered, tinted). Everything else follows the design: nine columns in
its order, newest first, the badges, the pill, the dashes.

## 4. Behaviour scenarios (Playwright, written, not run)

All as the accountant unless said; the same set runs for the admin (`auditTable.admin.spec.ts`).

- **S1:** choose a driver who has trackers; the table shows the nine headers: Status, Date,
  Bleacher, Type, Pickup location, Dropoff location, Drive time, Distance, Payment status.
- **S2:** the dates go from newest to oldest; a Trip row has the Trip badge; a Repair row shows
  "–" for drive time and distance.
- **S3:** every row shows an icon in Status with a title; a Cancelled or Declined tracker is in
  the list (every status).
- **S4:** at least one row says Paid and one says Not paid (needs a driver with both in the
  seed); a tracker with no group shows "–" in that cell.
- **S5:** pick a driver with more than 25 trackers; the pager shows a "Next page" button; click it; the URL
  has `apage=2` and the rows change; choose 50 per page; the URL has `apagesize=50` and no
  `apage`.
- **S6:** reload on page 2; the same page and rows show. Choose another driver; the table starts
  on page 1 and `apage` is gone.
- **S7:** click a row; nothing happens and the URL does not change (D9).
- **S8:** the payment of a row equals the week's state on /work-trackers: open that driver's week
  there and compare the Mark Paid / Mark Unpaid button's `data-paid` with the row's
  `data-payment`.
- **S9:** a driver with no trackers (seed needed; `test.skip` with a message otherwise) shows
  "This driver has no work trackers" and no pager.

## 5. Tests (Vitest)

- `auditFormat.test.ts`: `formatAddressLines` (full, no street, no city, only a zip, null, all
  empty strings); `auditStatusLabel` for all eleven statuses, and for an unknown one.
- `WorkTrackerTypeBadge.test.tsx`: the three canonical codes take their icon and colour classes;
  an unknown code and a null code take the fallback; a null name renders "–".
- `AuditPaymentPill.test.tsx`: the three payments render Paid, Not paid and "–", with the icon
  for the first two and `data-payment`.
- `AuditTrackersTable.test.tsx`: the nine headers; a full row renders all nine cells; each
  status renders its title and its hidden label; null date, bleacher, type, addresses, time and
  distance render "–"; no row is a link or has a click handler (D9); loading shows the loading
  message, no rows the empty message, an error the alert and no table.
- `auditUrlState.test.ts` (extended): `parseAuditPaging` (missing, invalid, 0, 3 and 50);
  `withAuditPaging` omits page 1 and size 25, keeps `tab` and `driver`; `withAuditDriver` drops
  `apage`.
- `AuditTab.test.tsx` (extended): no driver: no table, and `useAuditTrackers` gets null; a driver
  with rows: the table and the pager; no pager at a total of 0 or while loading; a click on page 2
  writes `apage=2` and keeps `driver`; a new size writes `apagesize` and drops `apage`; a
  driver change drops `apage`; a page past the end shows the last page.

## 6. Files

Production, 6: `accountantAudit/components/AuditTab.tsx`, `components/AuditTrackersTable.tsx`
(new), `components/WorkTrackerTypeBadge.tsx` (new), `components/AuditPaymentPill.tsx` (new),
`utils/auditFormat.ts` (new), `utils/auditUrlState.ts`.

Tests: the six of §5, and `accountantAudit/e2e/auditTable.accountant.spec.ts`,
`auditTable.admin.spec.ts` (new).

## 7. Edge cases and error handling

- **Loading.** `DataTable` shows "Loading work trackers..." in place of the table; the pager is
  hidden.
- **Error from the local query.** The alert of R10; the pager is hidden.
- **A driver with no trackers.** The empty message inside the table frame; no pager.
- **A page past the end** (a link from before some trackers were removed). The effective page is
  the last one and the pager shows it; the URL is not rewritten until the user pages.
- **An invalid `apage` or `apagesize`.** Page 1 and size 25.
- **A tracker with no date, no group, no type or no addresses.** Listed, with "–" in the cells
  that have nothing.
- **Long street or city.** The location cell wraps; the table scrolls sideways if needed.
- **An unknown status.** R11.
- **Data changes while the tab is open** (a tracker edited, a week marked paid on another
  device). The queries are live; the table updates by itself.
- **Auth error from Clerk, offline.** The data is local; nothing is fetched online.

## 8. Out of scope

- Sorting by a column, filtering, searching, a date range, totals, export: none was asked for.
- A row opening a tracker or a week (D9).
- The attention mark and the Inspections link of /work-trackers.
- Marking a week paid or unpaid, or editing a tracker, from this tab.
- The actual bleacher of a swap (D3).

## 9. Implementation notes (2026-11-06)

No contract of §3 changed: the six production files, the exported names and the signatures are as
written, and `AuditTab` still reads `useAuditTrackers(driverUuid, page, pageSize)` as spec 03
built it. Where the spec left a detail open, this is what was built:

- **Spec 03 was committed during the work** (`fe54216e`), so 01, 02 and 03 are all in the branch.
- **A bug of spec 03 surfaced once the tab mounted the hook** (user's screenshot, 2026-11-06:
  `db.fn.countAll is not a function` in `buildAuditTrackerCountQuery`). The app's `db` is a lazy
  proxy that `bind`s every function it returns, which strips the methods off `db.fn`. Fixed with
  the callback form `.select(({ fn }) => fn.countAll<number>()...)`; the name, the signature and
  the SQL are unchanged. The test of `db/auditTrackers.test.ts` now provides `db` through the same
  bound proxy (it failed before the fix), because its bare Kysely had hidden the error.
- **Type with no name** renders a plain "–" and no badge (R4: "No type shows –"). A name with an
  unknown or null code keeps the badge in the fallback style.
- **The payment pill for `none`** carries `data-testid="audit-payment"` and `data-payment="none"`
  too, so S4 can find the dashes the same way it finds the pills.
- **Own-key lookups.** `WorkTrackerTypeBadge` and `auditStatusLabel` look their key up with
  `Object.hasOwn`, so a code such as `constructor` falls back instead of reading an inherited
  member. `formatAddressLines` trims each part, so a part of only spaces counts as empty.
- **Styling the spec left open (R1 sets no column widths):** the status wrapper is `inline-flex`
  so the badge keeps the size of its icon instead of stretching to the column; a location block is
  `min-w-[180px] max-w-[260px]` and the distance block `max-w-[104px]`, both `whitespace-normal`,
  so that long streets wrap and miles and km fall on two lines (R6) inside the table's nowrap
  cells.
- **The pager is also hidden when the query failed** (§7), not only while loading or at a total of
  0 (R9).
- **Tests of `AuditTab`** replace `Pagination`, `AuditDriverSelect`, `useAuditTrackers` and the
  layout context with probes, to read the props the tab hands them and to call `onPageChange`,
  `onPageSizeChange` and `onChange` directly. The table is the real one.
- **E2E.** The accountant and the admin file hold the same S1 to S9 (§6 names two files, so no
  shared helper file was added). Every scenario that needs seed data (more than 25 trackers, Paid
  and Not paid together, a Cancelled / Declined, a Repair, none at all) looks through the drivers of
  the select and skips with a message when the seed has no fit. S8 opens the driver's week on
  `/work-trackers/<week start>` (the Monday of the row's date), finds the driver's row by name and
  compares `data-paid`; the admin file first presses "See All Drivers" when it is offered.
- **Not done:** no Playwright run (the user's rule), and no look at the finished tab in a browser
  (it needs a Clerk sign-in and synced PowerSync data), so the look of the table (row height,
  badge size, wrapping) is checked by markup tests only.
- **Sync buckets read again** (R-C): the Accountant bucket and the Admin bucket of
  `br_powersync/config/sync_rules.yaml` serve `WorkTrackers`, `WorkTrackerGroups`,
  `WorkTrackerTypes`, `Drivers`, `Users`, `Addresses` and `Bleachers`. No sync-rule change.
- **Permissions matrix:** unchanged, as §3 says (the row "Driver Audit" is from spec 01).
