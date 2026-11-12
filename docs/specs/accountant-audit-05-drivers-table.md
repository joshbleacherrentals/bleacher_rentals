# Accountant Audit 05: drivers table with a date range

Status: **IMPLEMENTED 2026-11-09, uncommitted** (APPROVED 2026-11-09 after round 2; 0 open
decisions; readings R1 and R5-R25 in §1 approved with the spec; e2e written, not run; what
differs from the text below is in §10). One spec, one logic, one commit.
Branch: `q4-sprint3-finance`.
Builds on: [01](accountant-audit-01-tab.md) (the tab), [02](accountant-audit-02-driver-select.md)
(the `driver` parameter and the details block), [03](accountant-audit-03-tracker-data.md) (the
tracker queries), [04](accountant-audit-04-table.md) (the trackers table).
Those four files and the plan are not edited. §0 lists what this spec replaces in them.

**Round 2 (2026-11-09).** The user changed three readings of the first draft: the table shows
distance in kilometres and miles and splits pay by currency (was R2), has no `#` column (was
R3), and has columns that sort both ways, opening on Pay, largest first (was R4). They are
now decisions D16-D22. As a result the table is no longer the scorecard's own component (R2).

## 0. The feature in brief

**The request (user, 2026-11-09, translated).** Change the page `/accountant?tab=audit` so
that it opens as a page designed like `/driver-scorecard?year=2026`.

- **What opens:** a table of drivers, one to one like `/driver-scorecard`, but without the
  figures for all drivers taken together (the five KPI cards).
- **Search:** above the table a search bar. The user types a driver's name and the table shows
  that driver.
- **Difference 1, the data.** `/driver-scorecard` reads everything from the table
  `DriverScorecardStatsPerDriver`, which is split by year. The Audit tab calculates the
  figures by itself. Instead of the year select there is a date picker that takes any custom
  date, and a select of presets (the last week, the last month and so on) that sets the dates
  at once. The "from" and "to" dates are kept in the URL.
- **Difference 2, the click.** On `/driver-scorecard` the table elements lead nowhere. On the
  Audit tab a click on a table element opens a page that already exists, for example
  `/accountant?tab=audit&driver=cc4a22ba-80dc-44c9-bbd8-c40b406c2c0c`. From it the user can
  go back with the browser's Back button, and a Back button is added to the page.
- **The driver select goes away.**
- **How we work:** one English spec in `docs/specs/` and one full Ukrainian copy as an
  artifact (not committed). The user takes every decision; a question is asked, never guessed.

**Decisions taken by the user (2026-11-09).**

- **D1:** every work-tracker status counts in the table's numbers (draft, released, accepted,
  the in-progress ones, completed, cancelled, declined, abandoned). The same as the database
  trigger behind `/driver-scorecard`.
- **D2:** only drivers who have at least one tracker in the range get a row. A driver with
  nothing in the range has no row, so the search cannot find them.
- **D3:** the preset select offers the calendar set: This week (Monday to Sunday), Last week,
  This month, Last month, This quarter, Last quarter, This year, Last year, All time.
- **D4:** a URL with no dates opens on This month, and the dates are written into the URL at
  once (as `/driver-scorecard` writes `?year=`).
- **D5:** the date picker is two native date fields, From and To (the kind the Accountant
  filter panel and the Driver Satisfaction page already use). No new package.
- **D6:** the URL parameters are `from` and `to`, format `YYYY-MM-DD`.
- **D7:** the text in the search bar is kept in the URL, in a parameter of its own.
- **D8:** the chosen range filters the driver page too, and the driver page shows the same
  range controls.
- **D9:** the Back button of the driver page is a link to the table with the same dates and
  the same search (no driver in the URL). The browser's Back button works as well.
- **D10:** the driver page shows the driver's name as a heading next to the Back button.
- **D11:** the driver select, its hook, its helper code and their tests are deleted.
- **D12:** All time (and a range with one end left empty) is written with empty values:
  `?from=&to=`. A parameter that is present but empty means "no limit". Both parameters
  absent means "no dates in the URL", which opens This month (D4).
- **D13:** a driver link with no dates (like the one in the request) opens on This month, the
  same rule as the table. An old driver link therefore shows this month only.
- **D14:** the current-period presets (This week, This month, This quarter, This year) and
  the opening range end on the last day of the period, not on today. Scheduled trackers
  later in the period are counted.
- **D15:** a tracker with no date is never shown on the Audit tab, in the table's numbers
  or on the driver page. The driver page's pager total therefore equals the Trips figure of
  the row that was clicked.

Round 2 (2026-11-09), changes to the table asked for by the user:

- **D16:** distance is shown in kilometres and in miles, in one column: one cell per driver,
  kilometres first, written `27726.0 km/17228.2 mi` (the user's own example; amended
  2026-11-09: the first draft had miles first, in /work-trackers' form `21.4 mi (34.4 km)`).
- **D17:** pay is one column and every amount carries its currency: `$1,234.00 USD` or
  `$567.00 CAD`. The currency is the driver's own (`Drivers.pay_currency`; an empty one counts
  as USD, as on /work-trackers). USD and CAD drivers sit in one list and nothing is converted.
- **D18:** there is no `#` (row number) column. The columns are Driver, Distance, Drive Time,
  Trips, Pay.
- **D19:** every column can be sorted by a click on its header, in both directions. The table
  opens sorted by Pay, largest first. Rows with equal values go by first name, last name,
  then driver id.
- **D20:** the first click on a column sorts Driver from A to Z and the four number columns
  largest first; a second click on the same column flips the direction (the rule Quotes &
  Bookings and Collections already use).
- **D21:** the chosen sort is kept in the URL, in parameters of its own; the opening sort is
  left out of the URL.
- **D22:** sorting by Pay compares the plain numbers and ignores the currency: `$5,000.00 CAD`
  ranks above `$4,000.00 USD`. The two currencies are mixed in the list and nothing is
  converted.

Settled by the request, so not asked: the table takes the scorecard's look (the card, the
header row, the text sizes); there are no KPI cards, so no Maintenance Cost card either; the
figures are calculated by the page from the work trackers; a search bar above the table; a
row opens the existing driver page; Back in the browser and a Back button; the select is
gone; `from` and `to` live in the URL.

**What this spec changes in 01-04.**

- **01:** the empty state "Choose a driver" is gone; the tab always shows the table or the
  driver page.
- **02:** the driver select is gone. The `driver` parameter and the Address / Phone / Email
  block stay.
- **03 and 04:** the driver's trackers are listed only inside the range, and trackers with no
  date are no longer listed (D15). The pager, the nine columns, the status icons, the type
  badge and the payment pill do not change.

**What the code already has (researched 2026-11-09).**

- **The scorecard page.** `src/app/driver-scorecard/page.tsx` renders `DriverScorecardPage`:
  a title "Driver Scorecard" with the line "Mileage by Year", a year dropdown, five `KpiCard`s
  (Total Distance, Total Drive Time, Total Pay, Total Trips, Maintenance Cost: these are the
  "all drivers together" figures), then `DriverMileageTable`.
- **The scorecard table.** `DriverMileageTable` has the columns `#`, Driver, Distance (km, one
  decimal), Drive Time (`2h 5m`, a dash when 0), Trips, Pay (`$`, two decimals). Rows are
  sorted by distance, largest first. `#` is the row's position in the list. The name is
  "First Last" or "Unknown Driver". The empty message is "No driver data for this year." The
  three formatters live inside that file. A row does nothing when clicked.
- **The scorecard data.** `useDriverDistanceForYear(year)` reads `DriverScorecardStatsPerDriver`
  joined to `Drivers` and `Users` (inner joins). A database trigger
  (`supabase/migrations/20260421231714_driver-scorecard.sql`) keeps one row per driver and
  year: the sum of `distance_meters`, `drive_minutes` and `pay_cents` and the count of
  trackers in `WorkTrackers` where `driver_uuid` and `date` are not null. Any status counts. A
  null metric counts as 0. The year is the year of `date`.
- **The Audit tab today.** `AuditTab` shows `AuditDriverSelect`, the details block, the
  trackers table with its pager, and the empty state. Its URL parameters are `tab`, `driver`,
  `apage`, `apagesize` (`utils/auditUrlState.ts`). The queries are in `db/auditTrackers.ts`
  (page and count, by driver only) and `db/auditDriverInfo.ts`.
- **The page's own URL code.** `useListPageState` owns `tab`, `page`, `pageSize`, `sort`, `q`
  and the receivables filters (`createdFrom`, `eventFrom`, ...), and keeps every parameter it
  does not own. `from`, `to` and `asearch` are not owned by it. The Audit tab hides the
  receivables chrome (spec 01).
- **Date code to copy the style of.** `src/features/driverSatisfaction/utils/period.ts` and
  `PeriodControl.tsx` (luxon, Monday week start, a native `<select>` of presets, native date
  fields); `quotesAndBookings/components/filters/DateRangeInput.tsx`. `luxon` is a dependency;
  there is no calendar or date-picker package.
- **Local data.** `WorkTrackers` has `date` (text `YYYY-MM-DD`, nullable), `driver_uuid`,
  `status`, `distance_meters`, `drive_minutes`, `pay_cents`. It has indexes on `driver_uuid`
  and the other foreign keys, none on `date`. The Accountant and Admin sync buckets already
  give the whole `WorkTrackers`, `Drivers` and `Users` tables, so no sync-rule change is
  expected; the implementer reads those buckets again before starting.
- **Currency and distance on /work-trackers.** The currency of a payment belongs to the
  driver: `Drivers.pay_currency` (`CAD` or `USD`, nullable locally).
  `normalizePayCurrency` in `src/features/workTrackers/util/payCurrencyFilter.ts` turns an
  empty value into USD, and the weekly driver list there has an All / CAD / USD filter.
  `formatMileage` in `src/features/workTrackers/util.ts` writes `21.4 mi (34.4 km)`. Nothing
  in the code converts USD to CAD.
- **Sortable tables.** `CollectionsTable.tsx` has `SortHeader` (a `<th aria-sort>` holding a
  button with an up, down or both-ways arrow) and keeps its sort in the URL as `csort` and
  `cdir`, left out when it is the default (`utils/collectionsListState.ts`).
  `quotesAndBookings/utils/sortEvents.ts` gives each column a first direction on its first
  click: text A to Z, numbers and dates largest first.
- **Permissions.** The matrix row "Driver Audit" and the Accountant role blurb in
  `src/features/userAccess/permissionPageData.ts` describe the old tab (§6).

## 1. Readings to confirm

My reading of wording the request left open. They are approved together with the spec, or
changed at review.

- **R1, the layout of the list.** The big "Driver Scorecard / Mileage by Year" heading is not
  copied: the Accountant page already has its title and its tab bar. A controls row takes
  its place: the search bar on the left (it grows), the range controls on the right (preset
  select, From, To). The row wraps on a narrow window. The selects and date fields use the
  style of `PeriodControl` (`border border-gray-300 rounded-lg px-3 py-2 bg-white
text-darkBlue font-semibold`). The table keeps the scorecard's card style.
- **R2, the table component.** The Audit table now differs from the scorecard's in the ways
  of D16-D19 (both units, currency on pay, no `#`, sortable headers), so it is a component of
  its own, `AuditDriversTable`, written in the scorecard's style (the card, the grey header
  row, the text sizes, the hover). The scorecard's `DriverMileageTable` is not touched, and
  `/driver-scorecard` renders exactly as today: kilometres only, `$`, a `#` column, no
  sorting.
- **R3, the `#` column:** decided by the user, see D18. The number is kept here so that the
  numbering of the other readings does not move.
- **R4, the order.** The opening order is Pay, largest first (D19). Ties go by first name,
  last name, then driver id, always from A to Z whatever the direction of the sort, so two
  equal rows never swap places between renders. The Driver column sorts by first name, then
  last name, ignoring case; Distance sorts on the metres, Drive Time on the minutes, Trips on
  the count, Pay on the cents (D22).
- **R5, the row click.** The whole row is clickable (pointer cursor, the existing hover). The
  driver's name is a real link (`<a href>`), so Enter, a middle click and "open in a new tab"
  work. A click on the row calls `router.push`, which adds one history step, so the browser's
  Back button comes back to the table. A click that already hit the name link is not handled
  twice. The target is
  `/accountant?tab=audit&driver=<id>` with every other parameter kept (`from`, `to`,
  `asearch`), and `apage` removed.
- **R6, the search.** It matches the driver's name: a case-insensitive "contains" on
  "first last", on the trimmed text. It filters the rows already loaded, in the browser, and
  the sort of R4 orders what is left. The typed text goes into the URL after a short pause (300 ms), by `router.replace`, in the
  parameter `asearch` (my name, after `apage` and `apagesize`). Empty text removes the
  parameter. No match shows "No driver found."
- **R7, the range.** `from` and `to` are `YYYY-MM-DD`, both ends included, compared with
  `WorkTrackers.date`. "Today" is the browser's local date. The week starts on Monday (the
  same week as on /work-trackers), a quarter is a calendar quarter, and "Last ..." is the
  whole previous period. With today Monday 2026-11-09 the presets are:
  - This week 2026-11-09 to 2026-11-15; Last week 2026-11-02 to 2026-11-08.
  - This month 2026-11-01 to 2026-11-30; Last month 2026-10-01 to 2026-10-31.
  - This quarter 2026-10-01 to 2026-12-31; Last quarter 2026-07-01 to 2026-09-30.
  - This year 2026-01-01 to 2026-12-31; Last year 2025-01-01 to 2025-12-31.
  - All time: no limit at either end.
- **R8, reading the URL.** If neither `from` nor `to` is in the URL, the tab is on its
  opening range (This month) and writes it into the URL once, by `router.replace` (no extra
  history step). If at least one of them is in the URL, an absent or empty one means "no
  limit". A value that is not a real `YYYY-MM-DD` date is read as empty. The URL is not
  rewritten until the user changes something.
- **R9, From after To.** The range is invalid. No query runs and the table area shows "The
  start date is after the end date." The date fields also carry `max` (on From) and `min`
  (on To) so the browser itself prevents it.
- **R10, the preset select** is not in the URL. It shows the preset whose range, computed
  from today, equals the current `from` and `to`; if none does, it shows a disabled "Custom"
  entry. If two presets are equal, the first in the list wins. Choosing a preset writes both
  dates by `router.replace`. Editing a date field writes that end and keeps the other.
  Clearing a field writes that end empty ("no limit").
- **R11, where the range lives.** One hook, `useAuditRange`, reads the range from the URL,
  writes the opening range, and writes changes. Every write by the range controls drops
  `apage` (a new range starts the driver page at page 1). The list and the driver page both
  use it.
- **R12, the Back link** is an ordinary link to `withAuditDriver(params, null)`: the same
  URL without `driver` and `apage`, with `from`, `to` and `asearch` kept. Being a link, it
  adds a history step, as any click does.
- **R13, the driver page.** From the top: the Back link and the heading (the name, and an
  "Inactive" label for a deactivated driver, the rule of spec 02 R3), the Address / Phone /
  Email block, the range controls, the trackers table and the pager. The table rows have no
  Inactive label (as on the scorecard).
- **R14, an unknown driver.** If `driver` is in the URL and the driver query has settled with
  no row, the tab removes `driver` (by `router.replace`) and shows the table. This is spec 02
  R6, now judged by the driver query instead of the select's list. The driver query is the
  one the details block already uses, widened to return the name and the inactive flag.
- **R15, the helper file.** D11 deletes `AuditDriverSelect`, `useAuditDriverOptions`, and
  `toAuditDriverOptions` with the `AuditDriverOption` type. `isDriverInactive` stays in
  `utils/auditDrivers.ts` because the heading's Inactive label uses it.
- **R16, one aggregate query.** The table's figures come from one local query: `WorkTrackers`
  inner-joined to `Drivers` and `Users`, grouped by driver, in a single watcher. The rule
  is the trigger's rule: `driver_uuid` and `date` not null, no status filter, null metrics as
  0, one trip per tracker. No migration, no `AppSchema.ts` change, no new local index, no
  sync-rule change. If All time proves slow, an index on `date` is a later spec.
- **R17, loading and errors.** While the first result is loading, the table area shows
  "Loading drivers..." (not the empty message). A query error shows "Could not load the
  drivers." The driver page keeps the states of spec 04.
- **R18, the empty message of the driver page** becomes "This driver has no work trackers in
  this range", since the page is now filtered (spec 04 had no dates and said "This driver has
  no work trackers").
- **R19, no second search on the page.** The page-level search box stays hidden on Audit
  (spec 01). The page's own `q` is not used by this tab.
- **R20, the opening write and the page's own write.** The page hook (`useListPageState`)
  writes the URL too. The opening range is written by the tab itself, from a `useEffect` on
  mount, by `router.replace`. Scenario S1 and the `AuditTab` test check that the page hook
  does not erase it (Collections' `csort` and `cnotdue`, and today's `driver` and `apage`,
  already live beside the hook's parameters). If it does erase it, the implementer stops and
  tells the user before changing the contract.
- **R21, the sort in the URL.** Two parameters, my names after Collections' `csort` and
  `cdir`: `asort` (`driver`, `distance`, `time`, `trips`, `pay`) and `adir` (`asc`, `desc`).
  Each is left out when it equals the opening value (`pay`, `desc`); an unknown value is read
  as the opening value of that parameter. A click on a header writes them by
  `router.replace`, keeps every other parameter and leaves `apage` alone. The driver page
  keeps `asort` and `adir` in its URL, like `from`, `to` and `asearch`, and does not use them,
  so the Back link and the browser's Back button bring the sort back.
- **R22, the header buttons.** As `SortHeader` of Collections: a button inside the `<th>`,
  `aria-sort` (`ascending`, `descending` or `none`), a both-ways arrow on a column that is not
  sorted and one arrow on the sorted column. A click on the sorted column flips its
  direction; a click on another column selects it with its first direction (D20). There is
  always one sorted column; there is no "unsorted" state.
- **R23, sorting in the browser.** One pure function sorts the loaded rows, after the search
  filter. The query itself does not order the rows.
- **R24, the Pay cell.** The amount keeps the scorecard's format (`$`, two decimals, thousands
  separators), then a space and the code. The code is `Drivers.pay_currency`, made USD or CAD
  by `normalizePayCurrency`; the query returns it with the sums. The currency belongs to the
  driver today, so a driver whose currency was changed shows all of their trackers in the new
  currency (the data holds no currency per tracker).
- **R25, the other cells.** Distance is `formatDriverDistance(metres)`: `27726.0 km/17228.2 mi`,
  and `0.0 km/0.0 mi` for zero (one decimal each, no thousands separator; the miles use the
  conversion of /work-trackers, `METERS_PER_MILE`). The tracker rows of the driver page keep
  /work-trackers' `21.4 mi (34.4 km)` (spec 04). Drive Time keeps the scorecard's format (`2h 5m`, a dash for 0),
  not /work-trackers' `2.4 hrs`. Trips is the plain number. The name is `First Last` or
  `Unknown Driver`.

## 2. Design

### 2.1 Types and contracts (locked)

```ts
// utils/auditRange.ts
export const AUDIT_FROM_PARAM = "from";
export const AUDIT_TO_PARAM = "to";

/** `YYYY-MM-DD`, both ends included; `null` = no limit at that end. */
export type AuditRange = { from: string | null; to: string | null };

export type AuditPresetId =
  | "this_week"
  | "last_week"
  | "this_month"
  | "last_month"
  | "this_quarter"
  | "last_quarter"
  | "this_year"
  | "last_year"
  | "all_time";

export const AUDIT_PRESETS: readonly { id: AuditPresetId; label: string }[];
export function resolvePreset(id: AuditPresetId, today: DateTime): AuditRange;
export function openingRange(today: DateTime): AuditRange; // this_month
export function presetOf(range: AuditRange, today: DateTime): AuditPresetId | null;
export function isRealIsoDate(value: string): boolean;
export function isRangeInverted(range: AuditRange): boolean;
export function parseAuditRange(searchParams: { get(key: string): string | null }): {
  range: AuditRange;
  hasRangeParams: boolean;
};
/** Writes both parameters (an empty string for a null end) and drops `apage`. */
export function withAuditRange(current: URLSearchParams, range: AuditRange): string;
```

```ts
// utils/auditUrlState.ts (added)
export const AUDIT_SEARCH_PARAM = "asearch";
export const AUDIT_SORT_PARAM = "asort";
export const AUDIT_DIR_PARAM = "adir";
export function parseAuditSearch(searchParams: { get(key: string): string | null }): string;
/** Sets or deletes `asearch` (empty text deletes it), keeps every other parameter. */
export function withAuditSearch(current: URLSearchParams, text: string): string;
/** An unknown or missing value reads as the opening value of that parameter (R21). */
export function parseAuditSort(searchParams: { get(key: string): string | null }): AuditSort;
/** Writes `asort` and `adir`, deleting each one that equals the opening value (R21). */
export function withAuditSort(current: URLSearchParams, sort: AuditSort): string;
// withAuditDriver is unchanged: it sets or deletes `driver`, drops `apage`, keeps the rest.
```

```ts
// utils/auditSort.ts
export const AUDIT_SORT_KEYS = ["driver", "distance", "time", "trips", "pay"] as const;
export type AuditSortKey = (typeof AUDIT_SORT_KEYS)[number];
export type AuditSortDirection = "asc" | "desc";
export type AuditSort = { key: AuditSortKey; direction: AuditSortDirection };

export const DEFAULT_AUDIT_SORT: AuditSort = { key: "pay", direction: "desc" }; // D19

/** The direction a column takes on its first click: driver "asc", the rest "desc" (D20). */
export const FIRST_DIRECTION: Record<AuditSortKey, AuditSortDirection>;
/** A click on the sorted column flips it; a click on another column selects it (R22). */
export function nextAuditSort(current: AuditSort, clicked: AuditSortKey): AuditSort;
/** R4, R23: pure; ties by first name, last name, driver id, always A to Z. */
export function sortAuditDriverRows(rows: AuditDriverRow[], sort: AuditSort): AuditDriverRow[];
```

```ts
// db/auditDriverTotals.ts
export function buildAuditDriverTotalsQuery(range: AuditRange); // compiled by the caller
export type AuditDriverTotalsResultRow = {
  driver_uuid: string | null;
  first_name: string | null;
  last_name: string | null;
  pay_currency: string | null;
  distance_meters: number | null;
  drive_minutes: number | null;
  pay_cents: number | null;
  trip_count: number | null;
};

// utils/auditDriverRows.ts
export type AuditDriverRow = {
  driverUuid: string;
  firstName: string | null;
  lastName: string | null;
  distanceMeters: number;
  driveMinutes: number;
  payCents: number;
  payCurrency: PayCurrency; // "USD" | "CAD", from workTrackers/util/payCurrencyFilter
  tripCount: number;
};
/** Drops a null driver, null sums become 0, the currency goes through normalizePayCurrency. */
export function toAuditDriverRows(rows: AuditDriverTotalsResultRow[]): AuditDriverRow[];
export function filterAuditDriverRows(rows: AuditDriverRow[], search: string): AuditDriverRow[];

// hooks/useAuditDriverTotals.ts
export function useAuditDriverTotals(range: AuditRange): {
  rows: AuditDriverRow[]; // all drivers with a tracker in the range, not sorted (R23)
  isLoading: boolean;
  error: Error | undefined;
}; // an inverted range runs no query: rows [], isLoading false

// hooks/useAuditRange.ts
export function useAuditRange(): {
  range: AuditRange;
  setRange: (next: AuditRange) => void; // router.replace, scroll false
  isInverted: boolean;
};
```

Changed signatures (the contract of spec 03 widened by the range):

```ts
buildAuditTrackersQuery(driverUuid: string | null, range: AuditRange, page: number, pageSize: number)
buildAuditTrackerCountQuery(driverUuid: string | null, range: AuditRange)
useAuditTrackers(driverUuid: string | null, range: AuditRange, page: number, pageSize: PageSize)
// both queries add: wt.date is not null, wt.date >= from (if from), wt.date <= to (if to)
```

`AuditDriverInfo` (spec 02) gains `firstName: string`, `lastName: string` and
`isInactive: boolean`; the query adds `u.first_name`, `u.last_name`, `d.is_active`,
`u.status_uuid`. `AuditDriversTable` takes `rows: AuditDriverRow[]`, `sort: AuditSort`,
`onSort(key)`, `getRowHref(row): string` and `emptyMessage: string`.

### 2.2 The query behind the table

One query, in the shape the scorecard's trigger uses:

- from `WorkTrackers` joined (inner) to `Drivers` on `d.id = wt.driver_uuid` and to `Users` on
  `u.id = d.user_uuid`;
- where `wt.driver_uuid` is not null, `wt.date` is not null, `wt.date >= from` when `from` is
  set, `wt.date <= to` when `to` is set (text comparison works because the dates are
  `YYYY-MM-DD`);
- grouped by `wt.driver_uuid`, `u.first_name`, `u.last_name`, `d.pay_currency`; selecting
  those four columns, the sum of `distance_meters`, `drive_minutes`, `pay_cents` and the count
  of rows.

`toAuditDriverRows` drops a null driver, turns null sums into 0 and an empty currency into
USD; it does not order the rows (R23). The query returns no status column and has no status
filter (D1). It uses the callback form
for aggregates (`select(({ fn }) => ...)`), because `db.fn` is stripped by the app's `db`
proxy.

### 2.3 The screens

**List (no `driver` in the URL).**

- A controls row: the search bar (a magnifier icon and a text input, placeholder "Search by
  driver name...", the look of the page's own search box), then `AuditRangeControls`.
- Below it: loading text, an error, "The start date is after the end date.", or the
  `AuditDriversTable`, with `getRowHref` and `emptyMessage` "No driver data for this range."
  (when the range has rows but the search matches none: "No driver found."). Its columns are
  Driver, Distance (`27726.0 km/17228.2 mi`), Drive Time, Trips and Pay (`$1,234.00 USD`); each
  header is a sort button (R22). There is no `#` column.
- No KPI cards. No driver select. No pager (as the scorecard).

**Driver page (`driver` in the URL).**

- The Back link (an arrow icon and the word "Back") and the heading, in one row.
- `AuditDriverInfo` (Address / Phone / Email), unchanged.
- `AuditRangeControls`, then `AuditTrackersTable` and `Pagination` (spec 04) on the range.

**`AuditRangeControls`.** A native `<select>` (aria-label "Period") with the nine presets,
plus a disabled "Custom" entry when no preset matches (R10); two `<input type="date">`
(aria-labels "From" and "To", `max`/`min` of R9). It is controlled by `range` and calls
`onChange(range)`; it takes `today` as an optional prop so tests can fix it.

### 2.4 URL, in one place

- Table: `/accountant?tab=audit&from=2026-11-01&to=2026-11-30&asearch=smith&asort=driver&adir=asc`
  (`asort` and `adir` are absent while the sort is the opening one, Pay, largest first)
- All time: `/accountant?tab=audit&from=&to=`
- Driver page: the table's URL plus `&driver=<driver id>` (and `apage`, `apagesize` of spec
  04 when they differ from page 1 and size 25)
- A bare `/accountant?tab=audit` is replaced by the opening range (D4, R8). A bare driver
  link is replaced the same way (D13).
- Row click: push. Back link: push. Every range, search, sort, page and opening write:
  replace.

## 3. Behaviour scenarios (Playwright, written, not run)

Per the project rule the e2e files are written and not run locally; the final report marks
Playwright SKIPPED. Roles follow the file suffix.

- **S1 (accountant):** `/accountant?tab=audit` opens the table; the URL becomes
  `from=<1st of this month>&to=<last day of this month>`; the headers are Driver, Distance,
  Drive Time, Trips, Pay (no `#`); there are no KPI cards, no "Choose driver" select and no
  "Choose a driver" empty state; the preset select reads "This month"; the receivables
  chrome is hidden; the rows are in Pay order, largest first, and the Pay header is marked
  as sorted descending.
- **S2:** typing part of a name narrows the rows and writes `asearch`; clearing the text
  removes `asearch` and brings every row back; a text that matches nobody shows "No driver
  found."
- **S3:** choosing "Last month" changes the two date fields and the URL; choosing "All time"
  gives `from=&to=`, empty fields, a full table, and a reload does not jump back to This
  month.
- **S4:** clearing only From gives `from=` with `to` kept and the select reads "Custom";
  typing a From and a To by hand gives the same dates in the URL.
- **S5:** `from` after `to` in the URL shows "The start date is after the end date." and no
  rows.
- **S6:** a click on a row opens `driver=<id>` with `from`, `to` and `asearch` kept; the page
  shows Back, the driver's name, the details block, the range controls and no select; the
  trackers listed are all inside the range.
- **S7:** the browser's Back button returns to the table with the same dates and the same
  search text in the box.
- **S8:** the Back button on the page does the same; the URL has no `driver`.
- **S9:** on the driver page, a new range changes the rows and the pager total and sets the
  page back to 1.
- **S10:** a pasted `/accountant?tab=audit&driver=<id>` with no dates is replaced by the same
  link with This month's dates (D13).
- **S11 (parity):** the Trips figure of a table row equals the pager total of that driver's
  page for the same range; for the range of one whole year, a driver's Distance, Drive Time,
  Trips and Pay equal the same driver's row on `/driver-scorecard?year=<year>` (the Audit
  row shows the distance in miles as well, and the currency after the amount).
- **S12:** a `driver` id that does not exist is removed from the URL and the table shows.
- **S13 (admin):** the same as S1, S2 and S6, as admin.
- **S14 (account manager, viewer):** `/accountant?tab=audit` is not reachable (the existing
  access files stay as they are).
- **S15 (sorting):** a click on the Driver header sorts A to Z and writes `asort=driver` and
  `adir=asc`; a second click sorts Z to A (`adir=desc`); a click on Trips sorts largest first
  (`asort=trips`); a click on Pay brings back the opening order and removes both parameters
  from the URL. The sorted header carries `aria-sort`.
- **S16:** after a sort and a click on a row, the browser's Back button and the page's Back
  button both return to the table with the same sort, dates and search.
- **S17 (cells):** a Distance cell reads like `34.4 km/21.4 mi`; a Pay cell ends with `USD`
  or `CAD`; a Drive Time cell is `2h 5m` or a dash.
- **S18 (Pay order):** with a USD and a CAD driver in the range, sorting by Pay puts the
  larger plain number first whatever the currency (D22).

## 4. Tests (Vitest)

Test first (CLAUDE.md TDD): the red tests below, then the code.

- `auditRange.test.ts`: every preset from fixed "today" values, including a Monday, a
  Sunday, 1 January, 31 December, a leap day, Last quarter from the first quarter, Last
  week across a year boundary; `openingRange`; `presetOf` for a match, no match and
  All time; `parseAuditRange` for absent, `from=&to=`, one end only, a bad value;
  `withAuditRange` writes empty strings, drops `apage`, keeps other parameters;
  `isRangeInverted`.
- `auditDriverRows.test.ts`: null driver dropped, null sums as 0, an empty or odd currency
  becomes USD, `CAD` and `USD` kept, the rows come back unsorted; search by first name, last
  name, full name, case, surrounding spaces, no match, empty text.
- `auditSort.test.ts`: every key in both directions; Driver by first name then last name,
  ignoring case; ties by first name, last name, driver id, A to Z in both directions (R4);
  Pay compares plain cents across USD and CAD (D22); `nextAuditSort` (a click on the sorted
  column flips; a click on another column takes its first direction, Driver "asc", the others
  "desc", D20); the opening sort is Pay, "desc".
- `auditDriverTotals.test.ts` (the real SQLite harness of spec 03): every status counted;
  undated and driver-less trackers left out; both ends included; one end open; both open;
  a driver with none in the range not returned; a driver without a `Users` row dropped; null
  metrics as 0. A parity test: from the same fixture, one whole year's range gives, for each
  driver, the sums the trigger's rule gives.
- `auditTrackers.test.ts` (updated): the range bounds the page and the count; undated
  trackers are in neither; the page's rows and the count agree.
- `auditDriverInfo.test.ts` (updated): the name and the inactive flag.
- `auditUrlState.test.ts` (updated): `asearch` parse and write; `parseAuditSort` (missing,
  unknown and valid values) and `withAuditSort` (the opening values are deleted, the rest
  written, other parameters kept); `withAuditDriver` keeps `from`, `to`, `asearch`, `asort`,
  `adir`.
- Hooks: `useAuditDriverTotals` and `useAuditTrackers` pass the range through; an inverted
  range runs no query.
- Components: `AuditRangeControls` (the select shows a preset or "Custom"; choosing a preset
  and editing a field call `onChange` with the right range; `min` and `max`);
  `AuditDriversTable` (the five headers and no `#`; the cell formats of R24 and R25; each
  header is a button with `aria-sort`; a click calls `onSort` with the key; each row is a
  link and the whole row is clickable; the empty message); `AuditDriversList` (rows are
  filtered by the search and then sorted, a header click writes `asort` and `adir`, search
  writes `asearch` after the pause with fake timers, the five messages, no KPI text, no
  select); `AuditDriverPage` (Back link href keeps the sort, heading with the Inactive
  label, the details block, the range controls, the pager); `AuditTab` (no driver shows the
  list; a driver shows the page; an unknown driver is replaced out of the URL; the opening
  range is written once and not written when `from` or `to` is present, even empty).
- `DriverMileageTable` and `/driver-scorecard` are not touched, so they get no new test.
- `permissionPageData` tests stay green (the label of the row is unchanged).
- Deleted with D11: `AuditDriverSelect.test.tsx`, `useAuditDriverOptions.test.tsx`, and the
  `toAuditDriverOptions` cases of `auditDrivers.test.ts`.

## 5. Files

New (11, counted), all under `src/features/accountantAudit/`:

- `utils/auditRange.ts`
- `utils/auditDriverRows.ts`
- `utils/auditSort.ts`
- `db/auditDriverTotals.ts`
- `hooks/useAuditDriverTotals.ts`
- `hooks/useAuditRange.ts`
- `components/AuditRangeControls.tsx`
- `components/AuditSearchBar.tsx`
- `components/AuditDriversTable.tsx`
- `components/AuditDriversList.tsx`
- `components/AuditDriverPage.tsx`

Changed (7, counted):

- `components/AuditTab.tsx` (switches between the list and the driver page)
- `components/AuditTrackersTable.tsx` (the empty message, R18)
- `db/auditTrackers.ts` and `hooks/useAuditTrackers.ts` (the range, D8, D15)
- `db/auditDriverInfo.ts` (the name and the inactive flag)
- `utils/auditUrlState.ts` (`asearch`, `asort`, `adir`)
- `utils/auditDrivers.ts` (trimmed, R15)

The scorecard's `DriverMileageTable.tsx` is not changed (R2).

Deleted (D11, 2 source files): `components/AuditDriverSelect.tsx` and
`hooks/useAuditDriverOptions.ts`.

Not counted: every test file, this spec, and `src/features/userAccess/permissionPageData.ts`.
The e2e files: new `e2e/auditList.accountant.spec.ts` and `e2e/auditList.admin.spec.ts`;
changed `audit.accountant.spec.ts`, `audit.admin.spec.ts`, `auditTable.accountant.spec.ts`
and `auditTable.admin.spec.ts` (their "open a driver" helper stops using the select);
deleted `auditDriver.accountant.spec.ts` and `auditDriver.admin.spec.ts`;
`auditAccess.am.spec.ts` and `auditAccess.viewer.spec.ts` stay as they are.

The counted total is **18 files (11 new, 7 changed), above the project's usual cap of 10.**
It stays one spec because the pieces are one logic: cutting it would leave a tab with a
table and no way into a driver, or a driver page with no way back. Flagged for review.

## 6. Permissions (CLAUDE.md: the matrix is updated in the same commit)

Only the text of the row **"Driver Audit"** and of the Accountant role blurb in
`permissionPageData.ts` changes; who can do what does not.

- **Who:** unchanged. Accountant: read. Admin: read. Account Manager, Developer, Viewer,
  Maintainer, Driver: none. `/accountant` stays in `allowedPaths` of `admin` and
  `accountant` only.
- **New row description:** "The Audit tab of the Accountant page. It lists every driver with
  their distance (in kilometres and miles), drive time, trips and pay (in the driver's own
  currency, USD or CAD) for a date range the user chooses (a preset such as This month, or
  any From and To dates). Any column can be sorted, and a search bar finds a driver by name.
  Clicking a driver opens that driver's work trackers inside the same range: status, date,
  bleacher, type, pickup and dropoff, drive time, distance, and whether the tracker's week
  has been paid. Read-only: nothing on the tab changes a work tracker or a payment."
- **Admin note:** "Can open the Audit tab and read the totals and the work trackers of any
  driver, including drivers who are no longer active."
- **Accountant blurb sentence:** "Also has the Audit tab of the Accountant page, where they
  see each driver's totals for a date range and open a driver to read that driver's work
  trackers with their Paid or Not paid status."

## 7. Edge cases and error handling

- **Offline or still syncing.** The tab reads the local PowerSync database only and makes no
  network call, so it works offline. While the first result loads it shows the loading text
  (R17). On the very first sync of a new device the table can be short until the data
  arrives; it fills in by itself (reactive query).
- **Clerk / access errors.** Unchanged: the route is behind the existing guards; a user
  without access never reaches the tab (S14). The tab adds no request that can fail on
  authentication.
- **No data in the range.** "No driver data for this range." A search with no match: "No
  driver found."
- **From after To** (typed into the URL): R9. **A bad date** in the URL: read as empty (R8).
  **One end empty:** no limit at that end. **Both empty:** All time, every tracker that has a
  date.
- **Midnight rolls over while the page is open.** The URL keeps its dates; the select is
  recomputed on the next render and may read "Custom" instead of a preset. No timer.
- **Names missing.** A driver whose user has no first and last name shows "Unknown Driver".
- **A tracker whose driver has no `Drivers` or `Users` row** is left out by the inner joins,
  as on the scorecard.
- **A driver link with no dates, or a bare tab URL:** the opening range is written (D4, D13).
- **The driver page's page number** goes back to 1 when the range changes (R11), and
  `clampPage` of spec 03 still protects a page number past the end.
- **Two writers to the URL** (the page hook and the tab): S1 and the `AuditTab` test cover the
  opening write (R20).
- **Deactivated drivers** appear in the table when they have trackers in the range, and open
  normally.
- **A driver with no pay currency** (empty in the local `Drivers` row) shows USD, as on
  /work-trackers (R24).
- **A driver whose currency changed** shows all of their trackers in the current currency
  (R24); the data keeps no currency per tracker.
- **Sorting mixed currencies.** Pay compares the plain numbers, so a CAD amount can rank above
  a USD amount that is worth more in practice (D22). Nothing is converted.
- **Equal values and equal names.** Rows that tie go by first name, last name, driver id (R4),
  so the order is the same on every render and after a reload.
- **A bad `asort` or `adir`** in the URL is read as the opening value of that parameter
  (R21) and is not rewritten until the user clicks a header.
- **The sort and the search together.** The search filters first, the sort orders the rest
  (R6, R23); changing either never changes the range or the page of the driver page.

## 8. Out of scope

- A pager on the drivers table (the scorecard has none), export, and a KPI row of totals,
  also totals per currency.
- Converting USD to CAD or the other way, and a currency filter or separate tables.
- Paid / Not paid totals per driver.
- Any change to `/driver-scorecard` or its table (it keeps kilometres, `$`, `#` and no
  sorting), to `DriverScorecardStatsPerDriver` or to its triggers (the scorecard keeps
  reading it).
- A calendar or date-picker package; a local index on `WorkTrackers.date`.
- Opening a tracker or a week from a tracker row (spec 04 D9 stands).
- An "Inactive" label on the table rows.
- Editing specs 01-04 and the plan, or the Ukrainian copies of them.

## 9. Definition of done

Built test-first, then the final report of CLAUDE.md, with the real output tails:

- `npm run tc`: PASSED / FAILED
- `npm run test` (Vitest): PASSED / FAILED
- `npm run lint`: Prettier `--check` on the touched files only (`npm run format` rewrites
  about 120 unrelated files; the repository gate is red at baseline)
- Playwright: written, not run (project rule); reported **SKIPPED**
- No `npm run gtl`: no schema change.

## 10. Implementation notes (2026-11-09)

Built test-first. `npm run tc` passes. The whole Vitest suite passes: 522 files, 7393 tests (the
Audit tests alone: 21 files, 356). Prettier `--check` passes on every touched file. Playwright was
written and not run (project rule). There was no check in a live browser: the page needs a Clerk
login and PowerSync data, so R20 (the page hook not erasing the opening range) is covered by the
`AuditTab` test and by S1, and is not yet seen in a real browser.

What differs from the text above, none of it a change of a decision:

- **R9, an inverted range "runs no query".** A hook cannot be skipped, so `useAuditDriverTotals`
  and `useAuditTrackers` still call `useTypedQuery`. The SQL of an inverted range matches
  nothing, and the hook returns `rows: []`, `isLoading: false`, no error (`useAuditDriverTotals`
  does it by itself; the screens show the message instead of the table).
- **Types.** `AuditDriverTotalsResultRow` lives in `utils/auditDriverRows.ts` and is re-exported
  from `db/auditDriverTotals.ts`. Its `trip_count` is `number`, not `number | null`: the query's
  `countAll` is never null, and `useTypedQuery` requires the exact type.
- **`createDebouncer`** (R6) is exported from `components/AuditSearchBar.tsx`, apart from React,
  so a test can drive the 300 ms pause with fake timers.
- **`getRowHref`** carries the latest typed text, not only the text already in the URL, so a
  click inside the 300 ms pause does not lose the search on the way back.
- **`formatPayAmount`** writes the digits in `en-US` (R24), so they do not depend on the browser's
  locale beside a `$` and a code. `formatDriverDriveTime` and `formatPayAmount` are in
  `utils/auditFormat.ts` (not listed in §5, with their tests).
- **`AuditDriverInfo.tsx`** takes `Pick<AuditDriverInfo, "address" | "phone" | "email">`, so the
  details block does not need the name fields (not listed in §5).
- **Counted files: 20, not 18** (11 new, 9 changed): the two additions above are the extra ones.
- **The permissions matrix test pins exact text.** §4 said the `permissionPageData` tests stay
  green; they pin the row's description, notes and the role blurb word for word, so their pinned
  text was updated to the new text of §6. The Accountant's note of the "Driver Audit" row got the
  same "totals and the work trackers" wording as the Admin's.
- **The opening write and an unknown driver in one URL.** A bare URL with a `driver` that does not
  exist gets both writes in one commit; the second one (removing `driver`) is built from the same
  URL, so the opening range is not in the URL until the user changes something. The tab still
  shows the opening range. It is rare and harmless, and `useAuditRange` does not re-run its effect
  on every URL change, to stay clear of a loop with the page hook.
- **e2e files.** New `auditList.accountant.spec.ts` and `auditList.admin.spec.ts`; changed
  `audit.accountant.spec.ts`, `audit.admin.spec.ts`, `auditTable.accountant.spec.ts` and
  `auditTable.admin.spec.ts` (the "open a driver" helper clicks a row of the drivers table on All
  time; S6 goes back and clicks another row; S9 sets a range from 1999 instead of looking for a
  driver with no trackers); deleted `auditDriver.accountant.spec.ts` and `auditDriver.admin.spec.ts`.

## 11. Fixes after the first use (2026-11-09)

- **A click on a row sent the user straight back to the table.** The tab removes a `driver` that
  has no row (R14). On a click `driver` goes from nothing to an id, and for a moment the details
  query still returned its old result: the empty one of the query for "no driver", with
  `isLoading` false and `isFetching` true. The tab read that as "this driver does not exist" and
  removed `driver` from the URL at once, whatever the dates were. The fix is in
  `useAuditDriverInfo`: the details query now also returns the driver's `id`, and an answer
  counts only when it is a row of the driver in the URL, or the query is neither loading nor
  fetching. A stale row of another driver is never shown for this one. A new test file,
  `hooks/useAuditDriverInfo.test.tsx`, pins it (it failed before the fix). An unknown driver is
  still removed once the query has settled.
- **The distance reads kilometres first.** D16, R25, §2.3 and S17 now say
  `27726.0 km/17228.2 mi`, as in the user's example; `formatDriverDistance` in
  `utils/auditFormat.ts` writes it, and `METERS_PER_MILE` in `workTrackers/util.ts` is now
  exported so there is one conversion. The tracker rows of the driver page keep their
  `21.4 mi (34.4 km)` (spec 04); say so if they should change too. The row of the permissions
  matrix says "kilometres and miles", and its pinned test too.
