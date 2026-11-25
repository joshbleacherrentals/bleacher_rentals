# Repairs 04: the table (columns, tabs, totals strip, pager, empty state)

Status: **APPROVED and IMPLEMENTED 2026-11-19**, uncommitted (0 open decisions; the results are
in §11; the browser check was not done). Build order: **04 of 11**.
Needs: [repairs-01-design.md](repairs-01-design.md), [repairs-02-sync-rules.md](repairs-02-sync-rules.md)
and [repairs-03-list-query.md](repairs-03-list-query.md) (all done and committed). Needed by: 05 and
the specs after it. Plan: [repairs-plan.md](repairs-plan.md). Branch: `q4-sprint4-maintenance`.
Scope: **the first visible Repairs page. It replaces the old table with the 17-column table of the
design, with the Open and Completed tabs, the CAD and USD strip, the pager, the empty and the
loading states. Read-only. It adds the first row of the permissions matrix.** The old edit form is
taken off the page. No migration, no sync change, and no change to the list query or to the
locked types of spec 03.

## 0. The feature in brief (the same in the plan and in every spec)

**The request (user, 2026-11-18, translated).** At the 2026-11-13 stand-up Sam's Google
spreadsheet (maintenance log, service vendors, bleacher inventory, dashboard) was to move into
the app. This series builds **only the Repairs page**: it replaces the "Maintenance Log" tab of
the spreadsheet, and the page itself is refactored, not added.

- **Not in this series:** the "Dashboard & Analytics" page (a new item in the Quality Assurance
  dropdown), the "Vendors" page (a new sidebar item between Companies & Contacts and Blocked
  Emails), the extra fields on the Assets page (the "Bleacher Inventory" tab). The Driver Parts
  Tracker and the GPS Trackers tabs are not touched and nothing is added for them.
- **The database is done.** [maintenance-01-database-schema.md](maintenance-01-database-schema.md)
  (committed in 5acc3df2): one row of `MaintenanceEvents` is one repair and one invoice; its
  services are rows of `MaintenanceLineItems`; vendor, invoice number, status, currency, zone and
  `completed_at` are columns of the repair; damage categories are a table.
- **How we work.** Every spec runs in its own chat, so every spec repeats this context. Each
  spec exists twice: English in the repository, and a full Ukrainian copy as an artifact that
  is not committed. The user takes every decision; a question is asked, never guessed. A spec
  has no "readings to confirm". The visual details of the design (colours, widths, icons, copy)
  are drawn on the canvas and corrected there.

**Decisions taken by the user (2026-11-18).** The same list is in the plan.

- **D1:** the design is drawn on the Design canvas (`docs/design/repairs/`) from the user's
  answers. Spec 01 is the design only: no app code, no tests, no permissions row. Code starts
  at spec 02.
- **D2:** one row of the list is one repair (one invoice). A click on a row expands it in place.
  Several rows can be open at once.
- **D3:** the expanded block is the table of services (Bleacher, Category, Severity, Reported,
  Description, Labor, Parts, Tax, Freight, Total) with **Add service** under it.
- **D4:** a click on a service row opens the **service window**: the fields of the service, a
  header with the repair's vendor, invoice number, status and currency, a link to the damage
  report, the bleacher's number, model number, type and zone, a button that opens the repair,
  and Edit and Delete.
- **D5:** a button at the end of a repair row opens the **repair window**: every field of the
  repair, the table of services with Add service, the files, Edit and Delete, and the date the
  repair was created (no name).
- **D6:** Edit and New repair use the same window. Edit turns the fields into inputs in place
  (Save, Cancel). **New repair** in the page header opens the window empty, in edit mode. The
  service window works the same way (Edit; Add service opens it empty).
- **D7:** the list has 17 columns: Bleachers, Reported, Repair from, Repair to, Zone, Severity,
  Categories, Notes, Status, Vendor, Invoice #, Labor, Parts, Tax, Freight, Total, Completed.
  Labor, Parts, Tax and Freight in a row are the sums of its services.
- **D8:** when a repair has several services, Bleachers, Categories and Severity show every
  value as a chip.
- **D9:** **Reported** is the date of the driver's damage report. It is found by comparing the
  categories of the report with the category of the service on the same bleacher, and it links
  to the report. A row shows the earliest date and `+N` for the others, and a dash when there is
  no report (a repair entered by hand). No column stores it.
- **D10:** **Repair from** and **Repair to** are `event_start` and `event_end`: the days the
  bleacher is in repair, chosen by the maintainer and still editable. **Completed** is
  `completed_at`: written when the status is marked completed, read-only, a dash while the
  repair is open. Marking a repair completed changes the status (and `completed_at`) and does not
  touch `event_end`. `completed_at` stays in the schema.
- **D11:** the **Notes** column shows the repair's notes (`MaintenanceEvents.notes`) on one line.
  The repair window shows them in full.
- **D12:** two tabs, **Open** (every status except completed) and **Completed**. No counts.
- **D13:** a strip above the tabs shows two totals, CAD and USD, not converted, over the rows of
  the current tab that match the search and the filters.
- **D14:** the toolbar has Search (invoice number, vendor, notes), Bleacher, Zone, Vendor and
  Category (each takes several values), and Show Deleted (as today, for admin and maintainer).
- **D15:** sort arrows are on every column that has one value per row, and not on Bleachers,
  Severity and Categories. The default order is decided in the list spec.
- **D16:** a pager at the bottom: 25, 50 or 100 rows per page with the existing `Pagination`
  component. The page and the size are kept in the URL.
- **D17:** the status pill in a row is a menu: any of the six statuses to any other.
- **D18:** in Edit and New repair the repair window has a Status select (a new repair starts as
  inbound), a read-only Zone (taken from the bleachers), a Vendor select of existing vendors
  only (a new vendor is added on the Vendors page), a Currency select and a read-only Completed.
  The event name is fixed as "Maintenance / Repair". There is no Address field: the vendor's
  address is shown. The owner (`created_by_user_uuid`) stays in the data and is not shown.
- **D19:** the series is split by layers: sync rules, list query, table, toolbar, expanded row
  and service window, repair window, status, writes, permissions, and the Dashboard last.
- **D20:** the Dashboard's maintenance form is replaced by the New repair window, and the old form
  is deleted. This is the last spec of the series.

**Decisions of spec 02 (done).**

- **D21:** the viewer gets `Vendors` in full on the web. **D22:** the viewer gets
  `DamageReportCategories`. **D23:** the sync change is made on the branch
  `q4-sprint4-maintenance` of `../br_powersync` (committed there, 692b21c, not pushed).
  **D24:** the permissions matrix is not changed by specs 02 and 03; spec 04 adds the first rows.

**Decisions of spec 03 (done, user, 2026-11-18).**

- **D25:** the date of a damage report is `DamageReports.created_at`, as a day in the app time
  zone (the same date the Damage Reports page shows as "Created"). It exists on every report. It
  can be later than the day of the driver's work: in the local data, 64 of the 204 reports that
  have a work tracker, on average by 3 days and at most by 50.
- **D26:** a report is found for a repair by the categories **and** by the link together: a
  report fits if its category matches a service of the repair on the same bleacher, or if it
  carries a link to this repair (`DamageReports.maintenance_event_uuid`) on a bleacher of this
  repair. The app already writes that link when a report is closed by a repair, and
  `DamageReportCategories` is empty today because nothing writes to it (the driver app will),
  so the link is what finds a report for the 143 repairs that exist now.
- **D27:** a report found by categories counts only if it **waited for this repair**: it is not
  closed by another repair, and it is not closed before this repair started.
- **D28:** a report found by categories and carrying no link must have been created **no later
  than `event_start`** of the repair. A report that carries a link to this repair counts always.
- **D29:** the bleachers of a repair (the chips, and the Bleacher filter of spec 05) come from
  the junction `BleacherMaintEvents` only, the same source the Dashboard reads. Spec 09 has to
  keep the junction equal to the bleachers of the services when it saves. A service on a bleacher
  that is not in the junction is not visible in the Bleachers column.
- **D30:** the 151 old repairs have no services and are listed as repairs without services:
  Bleachers from the junction, Total from `cost_cents`, Categories, Severity, Labor, Parts, Tax
  and Freight empty, and an empty expanded block with Add service.
- **D31:** for a completed repair whose `completed_at` is empty (all 151 old ones), the Completed
  column falls back to `event_end`. It is the end of the repair days, not the moment of
  completion, which D10 tells apart, and nothing is written to the database.
- **D32:** the **Total** of a repair is always `MaintenanceEvents.cost_cents`. The server
  recomputes it from the services with a trigger and it comes back to the device after the next
  sync, so for a short time after a service is saved or deleted Total can differ from the sum of
  Labor, Parts, Tax and Freight, and offline it does not follow the services at all.
- **D33:** the **Zone** of a repair is its stored `zone_uuid`. When that is empty, it is the
  current zones of the bleachers of the repair (`Bleachers.zone_uuid`), every different zone
  once. This can differ from the zone on `event_start` that maintenance-01 D7 stores, and the
  Zone filter finds these repairs through it.
- **D34:** deleted rows. Normal view: repairs with `deleted = 0`, and of their services only
  those with `deleted = 0`. Show Deleted: repairs with `deleted = 1`, with **all** their
  services whatever the flags of the services. A service deleted by itself before its repair
  was deleted reappears in the deleted repair.
- **D35:** filters, sorting, the CAD and USD strip and the pager (specs 04 and 05) work in the
  browser over the whole list. The hook returns every repair of the view, with its services.
- **D36:** the starting order, before any sort arrow is used, is the repair's `created_at`,
  newest first, on both tabs.
- **D37:** every day taken from a timestamp (a report, a closed report, `completed_at`) is the
  day in the app time zone (`useTimezoneStore`, Toronto until the user picks another). The hook
  takes the zone as a parameter. Changing the zone can move a report created near midnight to
  another day.
- **D38:** `+N` in Reported is the number of the other reports that fit (reports found minus
  one), not the number of other days. Two reports of one day give `+1`.
- **D39:** the new code lives in `src/features/repairs` (`db/`, `utils/`, `hooks/`). Spec 04
  moves the page there and deletes `RepairsPage` and `useRepairs` from `qualityAssurance`.

**Decisions of this spec (user, 2026-11-19).**

- **D40 (the old edit form):** it is taken off `/repairs`. A click on a row does nothing. An
  administrator or a maintainer cannot edit a repair from this page until specs 07 and 09. The
  form stays on the Dashboard (a click on a repair bar there) and is not touched.
- **D41 (Show Deleted, Restore, Bleacher select):** they stay as they are today, until specs 05
  and 09, over the new table. The Show Deleted button with its two labels (administrator and
  maintainer only), Restore on the deleted rows (the same two roles), and the single Bleacher
  select that reads and writes `?bleacher_uuid=`. Show Deleted stays in React state, not in the
  URL. The subtitle that names the chosen bleacher stays with the select.
- **D42 (the table component):** a new component in `src/features/repairs`, built as the canvas
  draws it: a CSS grid, a sticky first column, its own scroll box. The shared `DataTable` is not
  changed.
- **D43 (only what works):** the table draws no expand arrow (06), no button at the end of the
  row (07), no sort arrows (05), no New repair button (07, 09) and no chevron on the status pill
  (08). Every header is plain text. The last column exists only in the Show Deleted view, for an
  administrator or a maintainer, and holds Restore.
- **D44 (dates):** written `2026-11-17`, as on the canvas, in Reported, Repair from, Repair to
  and Completed.
- **D45 (Reported):** the day as plain text, then `+N` when more reports fit (D38). No link until
  spec 06 builds the damage report view: the Damage Reports page cannot open one report today.
- **D46 (several zones):** each zone on its own line in the Zone cell. The row grows and the
  column stays 84 px wide.
- **D47 (the tab in the URL):** `?tab=completed`. Open is the default and stays out of the URL.
  Switching the tab goes to page 1.
- **D48 (amounts in the strip):** with cents, like the cells: `$12,345.67` and `C$1,234.50`.
- **D49 (order in the strip):** CAD on the left, then USD, as on the canvas.
- **D50 (a page past the end):** the last page is shown and the URL keeps the number until the
  next click (the rule of the Quotes & Bookings list).
- **D51 (loading):** the frame (header, strip, tabs, toolbar, column headers) shows at once. The
  strip shows a dash instead of amounts, the table body shows a grey "Loading..." in the middle,
  and the pager is hidden.
- **D52 (who sees what):** the four roles that open the page (admin, account_manager, viewer,
  maintainer) all see the 17 columns and the strip. Nothing is hidden by role.
- **D53 (the matrix):** one new row in `permissionPageData.ts` for what the page shows (read, for
  the four roles), and one sentence in the old row "Repairs & Maintenance" saying that the Repairs
  page only lists repairs for now. In the same commit.
- **D54 (the browser check):** on the local data as it is, the 151 old repairs. Nothing is added
  to the database and the local PowerSync is not restarted. What the old data cannot show
  (services, vendors, CAD, several zones, Reported by category) is covered by Vitest tests that
  render fixture rows.
- **D55 (Show Deleted and the tabs):** the deleted repairs are split into the same Open and
  Completed tabs, and the strip and the pager work on them as on live ones. All 8 deleted local
  repairs are completed, so they are on Completed and the Open tab is empty in that view.
- **D56 (e2e):** the full set with its own data. A fixture seeds repairs through the service role
  (open and completed, USD and CAD, with services, more than 25 for the pager). One full spec for
  the administrator, and one access spec each for the account manager, the viewer and the
  maintainer. Written, not run.

**What follows from the design and from earlier decisions (no new decision).** Each item names its
source, so a reviewer can check it.

- **Money** (design README, D32, spec 03 §2.3): `$` for USD and `C$` for CAD with the shared
  `formatMoney`, two decimals; no amount is a dash, zero is `$0.00`. Labor, Parts, Tax and
  Freight are the sums of the services and Total is `cost_cents`, so Total can differ from their
  sum (D32).
- **Notes** (D11, canvas): one line, cut with an ellipsis, the full text in the `title` of the
  cell.
- **Chips** (D8, canvas): Bleachers `#52` (and `#?` for a bleacher that has no number yet),
  Categories as outlined pills, Severity and Status as coloured pills with their words, so colour
  is never the only signal. The colours are in §2.5.
- **Empty state** (canvas, Empty board): a wrench and "No repairs found.", the same on both tabs.
- **The strip** (D13, canvas): it adds up the Total of the rows of the current tab that pass the
  Bleacher select, the only filter that exists until spec 05. Its caption is the canvas text.
- **The pager** (D16): the existing `Pagination` component and the helpers of the Quotes list.
  `?page` and `?pageSize`, 25 rows by default, a default value is not written to the URL, and a
  new question (another tab, another bleacher, Show Deleted turned on or off, another page size)
  starts from page 1 (the `pageAfterChange` rule of that list).
- **The order** (D36): the order of the hook. There are no sort arrows before spec 05.
- **The layout** (canvas): header, strip, tabs, toolbar, table, pager. The header has the title
  and the subtitle and no button (D43).
- **An unknown status** (spec 03, D12 reads it as open): a neutral grey pill with the stored
  word, so a value the code does not know is visible and not hidden.

## 1. What the code has today (researched 2026-11-19)

- **The route and the old page.** `src/app/repairs/page.tsx` renders `RepairsPage` from
  `src/features/qualityAssurance/components/RepairsPage.tsx`: a plain six-column table (Event,
  Start, End, Bleachers, Cost, Notes), a Bleacher select kept in `?bleacher_uuid=`, Show Deleted
  with Restore, and (admin and maintainer) a click on a row that loads the event through
  `loadMaintenanceEventById` and opens `MaintenanceEventForm` in a dialog. Its data hook is
  `useRepairs` in the same feature. Nothing else uses `RepairsPage` or `useRepairs`, and no other
  page links to `/repairs`.
- **What spec 03 gives.** `useRepairList({ showDeleted, timezone })` returns every repair of the
  view with its services, bleachers, zones, vendor, Reported and sums, newest created first;
  `splitByTab` and `totalsByCurrency` split and add them. It has never run in a browser.
- **`DataTable`** (`src/components/DataTable.tsx`) is a real `<table>` with an optional sort
  header and a row click or row link. It has no sticky column, no minimum width and no row under
  a row. Seven files use it (Quotes & Bookings, All Work Trackers, Accounts Receivable, Need
  Attention, Audit and the event list cells).
- **`Pagination`** (`src/components/Pagination.tsx`) draws the page-size select, "from–to of N"
  and, when there is more than one page, Prev, numbers and Next. Its helpers are in
  `src/features/quotesAndBookings/utils/pagination.ts`: `parsePage`, `parsePageSize`,
  `clampPage`, `getTotalPages`, `slicePage` and `DEFAULT_PAGE_SIZE` (25).
- **Money.** `formatMoney(cents, currency)` in `src/features/quotesAndBookings/utils/formatMoney.ts`
  writes `$1,234.56` and `C$1,234.56` and `-` before a negative amount.
- **Tabs.** `Tabs`, `TabsList` and `TabsTrigger` in `src/components/ui/tabs.tsx` are the Radix
  tabs in the shadcn style that the canvas copies.
- **Shared with other pages.** `useBleacherOptions` (`qualityAssurance/hooks/useFilterOptions.ts`,
  also used by Damage Reports) and `setMaintenanceEventDeleted`
  (`maintenanceEvents/db/deleteMaintenanceEvent.ts`, a local write that flips `deleted` and
  shows a toast).
- **Who opens the page.** `accessConfig.ts` and the sidebar give `/repairs` to admin,
  account_manager, viewer and maintainer. `canManageDamageAndMaintenance` (admin or maintainer)
  decides who sees Show Deleted and Restore.
- **The edit form on the Dashboard.** The Dashboard mounts `MaintenanceEventPanel`, and a click
  on a repair bar opens `MaintenanceEventForm` through the same loader (no role check was found
  on that click). `CreateEventButton` treats a maintainer like a viewer, so a maintainer has no
  "+ Create" there; `MaintenanceEventForm.canEdit` is true for a maintainer. This spec touches
  none of it.
- **The matrix.** One row, "Repairs & Maintenance" (Day to Day Operations): admin full, account
  manager custom (their own), viewer read, maintainer full, the others none; its description says
  "This applies to the Repairs page and the Dashboard".
- **Tests that exist.** `src/features/manageTeam/e2e/damage-repairs.maintainer.spec.ts` opens
  `/repairs`, looks for the heading "Repairs" and for the button "Show Deleted". Component tests
  in this project run in Vitest's node environment and render with `renderToStaticMarkup` over
  mocked hooks (`NeedAttentionTab.test.tsx`); there is no jsdom.
- **The local database (Supabase dev, 2026-11-19, dev data, not production).** 151 repairs, 143
  live and 8 deleted, **all completed**, all USD, none with a vendor, an invoice number or a
  service. The largest cost is $9,091.47 and none reaches $10,000. 55 notes are longer than 60
  characters and the longest is 484. A repair has up to 4 bleachers; one repair has bleachers in
  two zones and 4 repairs have a bleacher with no zone. 6 zones with names of 6 characters
  (`Zone 1`). 42 vendors exist but none is linked. The running local PowerSync still has the old
  sync rules, so `MaintenanceLineItems` and the category tables are empty on the device.

## 2. The page

### 2.1 Layout, top to bottom

- **Header.** `PageHeader` with the title "Repairs" and a subtitle, and no button (D43). The
  subtitle is the old one: "All maintenance and repair events across the fleet", or "Showing for
  Bleacher #N" when the Bleacher select is set (and "Showing for selected bleacher" when that
  bleacher is not in the list).
- **The strip** (§2.7), then **the tabs** (§2.6), then **the toolbar** (§2.9): the Bleacher select
  on the left and, for an administrator or a maintainer, Show Deleted on the right.
- **The table** (§2.2 to §2.5, §2.10) in a box with a 1 px border `#e5e7eb`, radius 10 px, that
  scrolls sideways inside itself. **The pager** (§2.8) under it.

### 2.2 Columns

A CSS grid with a 12 px gap. Each column is `label (width)`; the money columns are right-aligned.

- **Bleachers** (176 px, sticky on the left), Reported (124), Repair from (124), Repair to (124),
  Zone (84), Severity (100), Categories (190), Notes (220), Status (160), Vendor (200),
  Invoice # (132).
- **Labor** (100), **Parts** (100), **Tax** (92), **Freight** (92), **Total** (112, semibold),
  then **Completed** (116).
- **Restore** (112, sticky on the right): only in the Show Deleted view and only for an
  administrator or a maintainer (D43). Its header is visually hidden and reads "Actions".
- The minimum width of the grid is the sum of the columns, the gaps and 16 px of padding, worked
  out in code from this list (about 2.5 thousand px), so the box scrolls sideways on a normal
  screen. A header cell is plain text: 12 px, upper case, wide letter spacing, `#6b7280`, on a
  `#f9fafb` band 44 px high (D43).

### 2.3 Cells

- **Bleachers:** one chip per bleacher of the repair, in the order of the row (by number), `#52`;
  `#?` when the number is not synced. The chips wrap. An empty list is a dash.
- **Reported:** the day of the first report as plain text (D44, D45), then `+N` in grey 12 px
  when `reported.length > 1` (N = length minus one, D38); a grey dash when there is none.
- **Repair from, Repair to:** the stored day as it is (D44); a dash when empty.
- **Zone:** one line per zone name (D46); a zone with no name is a dash; no zone is a dash.
- **Severity:** one pill per severity of the repair (§2.5); a dash when there is none.
- **Categories:** one outlined pill per category; a dash when there is none.
- **Notes:** one line with an ellipsis, `title` holds the full text; a dash when empty.
- **Status:** the status pill (§2.5), no chevron (D43).
- **Vendor:** the vendor name on one line with an ellipsis and a `title`; a dash when there is
  none. **Invoice #:** the text on one line; a dash when there is none.
- **Labor, Parts, Tax, Freight:** `formatMoney` in the currency of the repair; a dash when the
  repair has no visible service (D30). **Total:** the same, from `cost_cents`; a dash when empty.
- **Completed:** the day (D44); a dash while the repair is open.
- A dash is the character `—` in `#9ca3af`. Numbers use tabular figures.

### 2.4 Rows

- A row is white and turns `#f9fafb` on hover. It has no pointer cursor and no click (D40).
- A row is at least 64 px high and grows with the chips and the zones.
- The sticky cells take the colour of their row, so a hovered row is one colour while the table
  scrolls under the first column.
- A row is `role="row"` in a `role="table"`; cells are `role="cell"` and headers
  `role="columnheader"`, as on the canvas.

### 2.5 Colours and words (from the canvas)

- **Status** (13 px, medium, 28 px high pill, label and colours):
  - Inbound `#dce9f7` on `#1a5892`; Triaged `#ece8fa` on `#563b9c`.
  - Waiting repair `#fbf0da` on `#7d5a1c`; In repair `#fde6d2` on `#93440d`.
  - Confirm repair `#d6eeee` on `#1b6464`; Completed `#dcede2` on `#2f6b4c`.
  - A status the code does not know: the stored word on `#f3f4f6` with `#4b5563`.
- **Severity** (12 px, medium pill): Major `#fbe7e5` on `#a8403a`; Minor `#fbf0da` on `#7d5a1c`;
  Routine `#eef1f6` on `#4f6178`. The order is major, minor, routine (spec 03).
- **Bleacher chip:** `#f3f4f6` on `#10365a`, 12 px, semibold, radius 4 px, padding 2 by 8 px.
- **Category chip:** white with a 1 px border `#d1d5db`, `#374151`, 12 px, a full pill.

### 2.6 The tabs and the URL

- Two tabs, **Open** and **Completed**, no counts (D12), from `splitByTab` over the rows that
  pass the Bleacher select. The tab is read from `?tab` (D47); anything but `completed` is Open.
- The URL parameters of the page: `tab`, `page`, `pageSize` and `bleacher_uuid`. The page reads
  its state from the URL and changes it only when the person acts, with `router.replace` and
  without scrolling. Parameters it does not own are kept.
- Written only when not the default: `tab=completed`; `page` above 1; `pageSize` other than 25;
  `bleacher_uuid` when set.
- Any change except a bare page change starts from page 1 (the tab, the bleacher, the page size,
  Show Deleted on or off).

### 2.7 The strip

- A box with a 1 px border `#e5e7eb` and radius 10 px, two cells and a caption. The cells are
  **Total cost · CAD** on the left and **Total cost · USD** (D49), each a label in the header
  style and an amount at 22 px, semibold, `#10365a`, tabular figures.
- The amounts are `totalsByCurrency` of the rows of the current tab that pass the Bleacher select
  (D13), written with `formatMoney` and so with cents (D48). Both are always there, `$0.00` and
  `C$0.00` included. Nothing is converted.
- The caption on the right is "Open repairs that match the filters" or "Completed repairs that
  match the filters" (canvas), 13 px, `#6b7280`.
- While the list loads each amount is a dash (D51).

### 2.8 The pager

- The existing `Pagination` over the rows of the tab, under the table. `pageSize` is 25, 50 or
  100 and 25 is the default; `page` is 1-based. Spec 04 only wires the component; it is not
  changed.
- The page shown is the one in the URL clamped into the range (D50). The URL is not rewritten, so
  while the list is still loading (no rows yet) the number in the URL is not lost.
- A change of the page size goes to page 1. The pager is hidden while the list loads (D51).
- With no rows the pager reads "0–0 of 0" (the component's own text; the canvas drew "0 of 0").

### 2.9 The toolbar: Bleacher select, Show Deleted, Restore

- **Bleacher select** (D41): the same select as today, "All bleachers" and "Bleacher #N" by
  number, from `useBleacherOptions`, bound to `bleacher_uuid`. It keeps the rows whose
  `bleachers` (the junction, D29) contain the chosen bleacher; those rows still show all their
  bleachers. Spec 05 replaces it with the multi-value Bleacher filter.
- **Show Deleted** (D41, D55): shown only when `canManageDamageAndMaintenance` is true. The same
  button as today with the labels "Show Deleted" and "Showing Deleted" and the same look. It
  switches `useRepairList` to the deleted repairs. It is React state and is not in the URL.
- **Restore** (D41): in the Show Deleted view, in the last column of every row, for the same two
  roles. The button as today (an icon and the word "Restore", green). It calls
  `setMaintenanceEventDeleted(id, false)` and has no confirmation; the row leaves the view by
  itself because the list is reactive. A failure shows that function's own toast. Restore is
  the only write on the page.

### 2.10 Empty and loading

- **Empty** (the view has no row on this page): inside the table, a wrench icon in `#d1d5db`
  over the grey text "No repairs found." Same text on both tabs and in the Show Deleted view.
  The block stays in the middle of the visible part of the box while the box scrolls sideways.
- **Loading** (D51): `isLoading` from the hook. The table body is a grey "Loading..." in the
  middle; column headers, the strip with dashes, the tabs and the toolbar are on the screen.
- The hook cannot tell a failed query from "no repairs" (spec 03 §8), so a failure shows the
  empty state.

### 2.11 How the page is put together

```
const { rows, isLoading } = useRepairList({ showDeleted, timezone });   // timezone: the store
const view = buildRepairsView(rows, urlState);   // bleacher filter, tab split, totals, one page
```

`buildRepairsView` is a pure function (§3). The page passes `view.pageRows` to the table,
`view.totals` (or `null` while loading) to the strip and `view.totalItems` and `view.currentPage`
to the pager. `timezone` is `useTimezoneStore((s) => s.timezone)`. The page is a client component
that reads `useSearchParams`, as the old page did.

## 3. Types and signatures (locked; changing them needs a new "Approved")

The types of spec 03 (`RepairListRow`, `RepairService`, `ReportedReport`, `RepairTab`,
`CurrencyTotals`, `RepairStatus`, `RepairCurrency`, `RepairSeverity`) are used as they are.

```ts
// src/features/repairs/utils/repairFormat.ts
export function formatRepairMoney(cents: number | null, currency: RepairCurrency): string;
// "—" for null; otherwise formatMoney(cents, currency)
export function formatRepairDay(day: string | null): string;
// "—" for empty; the text as stored (it reads YYYY-MM-DD)
export type ReportedCell = { day: string; more: string | null }; // more: "+2", or null
export function reportedCell(reported: readonly ReportedReport[]): ReportedCell | null;
// null = a dash; day of the first report; more = "+N", N = length - 1
export type PillStyle = { label: string; className: string };
export function statusPill(status: string): PillStyle; // unknown status: the stored word, grey
export function severityPill(severity: RepairSeverity): PillStyle;

// src/features/repairs/utils/repairPageState.ts
export type RepairsUrlState = {
  tab: RepairTab;
  page: number; // 1-based
  pageSize: PageSize; // 25 | 50 | 100
  bleacherUuid: string | null;
};
export function readRepairsUrlState(params: { get(key: string): string | null }): RepairsUrlState;
export function writeRepairsUrlState(
  state: RepairsUrlState,
  existing: URLSearchParams,
): URLSearchParams; // defaults are not written, other parameters are kept
export function narrowRepairsUrlState(
  state: RepairsUrlState,
  patch: Partial<Pick<RepairsUrlState, "tab" | "pageSize" | "bleacherUuid">>,
): RepairsUrlState; // applies the patch and goes to page 1; an empty patch = Show Deleted toggled
export function filterByBleacher(
  rows: readonly RepairListRow[],
  bleacherUuid: string | null,
): RepairListRow[]; // null keeps every row
export type RepairsView = {
  tabRows: RepairListRow[]; // rows of the tab that pass the filter, in the hook's order
  pageRows: RepairListRow[]; // the page shown
  totals: CurrencyTotals; // of tabRows
  totalItems: number; // tabRows.length
  currentPage: number; // the page in the URL clamped into 1..pages
};
export function buildRepairsView(
  rows: readonly RepairListRow[],
  state: RepairsUrlState,
): RepairsView;

// src/features/repairs/components/RepairsTable.tsx
export type RepairsTableProps = {
  rows: RepairListRow[]; // the rows of the page shown
  isLoading: boolean;
  showRestore: boolean; // the Show Deleted view and a role that may restore
  onRestore: (repairId: string) => void;
};
// src/features/repairs/components/RepairsTotalsStrip.tsx
export type RepairsTotalsStripProps = { tab: RepairTab; totals: CurrencyTotals | null };
// null while the list loads
// src/features/repairs/components/RepairsPage.tsx: default export, no props
```

`RepairChips.tsx` exports `BleacherChip({ number })`, `CategoryChip({ name })`,
`SeverityPill({ severity })` and `StatusPill({ status })`; they take the colours from
`repairFormat.ts`.

## 4. Files

- **New** (`src/features/repairs`), six source files:
  - `components/RepairsPage.tsx`, `components/RepairsTable.tsx`,
    `components/RepairsTotalsStrip.tsx`, `components/RepairChips.tsx`.
  - `utils/repairFormat.ts`, `utils/repairPageState.ts`.
- **Changed:** `src/app/repairs/page.tsx` (renders the new `RepairsPage`);
  `src/features/userAccess/permissionPageData.ts` (§5, not counted).
- **Deleted:** `src/features/qualityAssurance/components/RepairsPage.tsx` and
  `src/features/qualityAssurance/hooks/useRepairs.ts` (D39). `useFilterOptions.ts` stays, because
  Damage Reports uses it.
- **Not touched:** `DataTable`, `Pagination`, `MaintenanceEventForm`, `MaintenanceEventPanel`,
  the Dashboard, `AppSchema.ts`, the list query and its locked types.

That is nine counted files (six new, one changed, two deleted); tests and the matrix do not
count. The cap of ten holds.

Test hooks for e2e: `data-testid` `repairs-table`, `repair-row`, `repairs-strip-cad`,
`repairs-strip-usd`, `repairs-loading`, `repairs-empty` and `repair-restore`; the tabs are found by
role `tab`.

## 5. The permissions matrix (`permissionPageData.ts`, same commit)

**New row, right after "Repairs & Maintenance"** (category Day to Day Operations):

- **Label:** `Repair Costs & Vendors`.
- **Description:** "What the Repairs page shows about each repair: its bleachers, zone and repair
  days, the status, the vendor and the invoice number, the amounts for Labor, Parts, Tax and
  Freight and the total, and the day the driver reported the damage. A strip above the table adds
  up the total cost of the tab, in Canadian and US dollars, not converted. Every role that opens
  the Repairs page sees all of it. The page only reads for now."
- **Admin:** read, "Sees every column and the total cost strip."
- **Account manager:** read, "Sees every column and the total cost strip, for every repair and
  not only the ones they created."
- **Viewer:** read, "Sees every column and the total cost strip, vendors included."
- **Maintainer:** read, "Sees every column and the total cost strip, vendors included."
- **Developer:** none, the same note as in "Repairs & Maintenance". **Driver:** none, "Drivers
  only have access to the Driver Mobile App." **Accountant:** none, `ACCOUNTANT_NO_ACCESS_NOTE`.

**Old row "Repairs & Maintenance", two edits:**

- The description gets one more sentence at the end: "For now the Repairs page only lists
  repairs and, for an administrator or a maintainer, shows and restores deleted ones; a repair is
  edited from the Dashboard until the repair window arrives."
- The maintainer's note ends "Uses the Repairs page to look repairs up and restore deleted ones,
  and the Dashboard to edit them." (it ended "Uses the Repairs page.").

The database, the sync rules and the Dashboard do not change. What changes for an administrator
and a maintainer is that they no longer open the edit form from the Repairs page (D40); the
sentence above says so. The matrix test gets a case for the new row (read for the four roles,
none for the others) and for the new sentence.

## 6. Behaviour scenarios (Playwright, written and not run)

The fixture `seedRepairs` (service role, as `seedDamageReport`) inserts: a namespaced bleacher, a
vendor, a completed USD repair with an invoice number, a vendor and two services (Tires minor,
Welding major), an in-repair CAD repair with one service and no vendor, a deleted completed
repair, a damage report linked to the first repair, and 26 cheap completed repairs on a second
bleacher for the pager. Every row has a junction row (D29). It removes all of it afterwards.

Admin (`repairsTable.admin.spec.ts`):

- **S1:** the page opens: the heading "Repairs"; the tabs "Open" and "Completed"; the strip labels
  "Total cost · CAD" and "Total cost · USD"; the 17 column headers in order; no "New repair"
  button and no sort button.
- **S2:** Open lists the in-repair repair and not the completed ones; Completed the other way
  round. Clicking Completed writes `?tab=completed`; a reload stays on Completed; clicking Open
  removes the parameter.
- **S3:** the first repair's row shows the vendor, the invoice number, the pill "Completed",
  `$` amounts and its Total; the CAD repair shows `C$` and dashes for vendor and invoice.
- **S4:** with `?bleacher_uuid=` of the first bleacher the strip amounts are the sums of that
  bleacher's repairs of the tab.
- **S5:** with the second bleacher chosen, Completed has 25 rows on page 1 and 1 on page 2
  (`?page=2`); 50 per page shows all and drops `page`; `?page=99` shows page 2.
- **S6:** the Bleacher select narrows the list and writes `?bleacher_uuid=`; a bleacher with no
  repair shows "No repairs found.".
- **S7:** the deleted repair is not in the live view; with Show Deleted it is on Completed;
  Restore puts it back in the live view and it leaves the deleted view.
- **S8:** the first repair shows the day of its linked report as text (no link); with a second
  linked report the cell adds `+1`.
- **S9:** the repair with two services shows both categories and both severities as chips and
  the sums of Labor, Parts, Tax and Freight.

Account manager, viewer and maintainer (`repairsAccess.<role>.spec.ts`):

- **S10:** the page opens and shows the first repair with its vendor, invoice number and amounts
  and the strip (D52); there is no Restore and a click on the row does nothing. The account
  manager and the viewer have no Show Deleted button; the maintainer has it.

`damage-repairs.maintainer.spec.ts` keeps working as it is (the heading, the button).

## 7. Tests (Vitest, written first)

- **`repairFormat.test.ts`.**
  - Money: USD `$1,234.56`, CAD `C$1,234.56`, null is `—`, zero is `$0.00`, a negative amount.
  - Day: a stored day as it is, null and empty are `—`.
  - Reported: none is null; one gives the day and no `more`; three give `more` of `+2`; two on
    one day give `+1` (D38).
  - Pills: the six statuses give their label and colours; an unknown status gives its own word in
    grey; the three severities.
- **`repairPageState.test.ts`.**
  - Reading the URL: defaults; `tab=completed`; a wrong tab is Open; a wrong or negative `page` is
    1; a page size that is not offered is 25; `bleacher_uuid`.
  - Writing: defaults are not written; each value is; parameters it does not own are kept; a
    stale `page` is removed when the state says 1.
  - `narrowRepairsUrlState`: a tab, a bleacher, a page size and an empty patch each go to page 1.
  - `filterByBleacher`: null keeps all; a bleacher keeps the repairs whose junction has it and
    keeps all their chips.
  - `buildRepairsView`: the split by tab after the filter; the totals are of the whole tab and not
    of the page; the page slice; a page past the end gives the last page; an empty list gives
    page 1 and totals of 0; the order of the rows is kept.
- **`RepairsTable.test.tsx`** (`renderToStaticMarkup`, fixture rows).
  - The 17 headers in order; no `button` in a header; no Restore header by default.
  - A full row: bleacher chips, `#?` for a bleacher with no number, Reported with `+1` and as
    text, a dash for none, two zones on two lines, severity and category chips, the status
    pill with no chevron, vendor and invoice, CAD amounts with `C$`, Total, Completed, the notes
    `title`.
  - An old row (no service): dashes in Severity, Categories, Labor, Parts, Tax and Freight, and
    Total from the cost; no vendor and no invoice.
  - An unknown status pill; `showRestore` adds the column and one button per row; loading draws
    "Loading..." and no row; no rows draws "No repairs found.".
- **`RepairsTotalsStrip.test.tsx`.** CAD first and USD second; amounts with cents and `C$`;
  `$0.00` and `C$0.00` for an empty tab; dashes when `totals` is null; the caption of each tab.
- **`permissionPageData.test.ts`** (new cases): the new row and the new sentence (§5).
- **A mutation check.** Three rules are broken one at a time (a past page does not clamp; the
  strip adds the page and not the tab; a wrong tab is read as Completed) and the tests must fail
  each time.

## 8. Edge cases and errors

- **Offline (PowerSync).** Every read is local, so the page works offline. Restore is a local
  write that uploads when the connection is back.
- **Clerk and auth.** The page makes no network call of its own. Who may open it is unchanged
  (`accessConfig.ts`); a user without the right is redirected as before.
- **The old data.** All 151 repairs are completed, so on the local data the Open tab is empty and
  reads "No repairs found.". The tabs have no counts (D12), so nothing hints that Completed is
  full. Services, vendor, invoice, Labor, Parts, Tax, Freight, Severity and Categories are dashes
  (D30).
- **Show Deleted.** On the local data the Open tab is empty in that view too, because the 8
  deleted repairs are completed (D55). The strip then adds up the deleted repairs of the tab and
  its caption does not say so; spec 05 settles the final look.
- **A bad URL.** `?tab=foo` is Open, `?page=abc` or `?page=0` is page 1, `?pageSize=30` is 25. A
  `bleacher_uuid` that matches nothing gives the empty state.
- **A page past the end** shows the last page and the URL keeps the number (D50).
- **Total and the services** can differ for a short time after a save (D32); the table shows
  both as they are.
- **A repair with no junction row** (a partial sync) has no bleacher chip and a dash; the Bleacher
  select cannot find it.
- **Long text.** Notes and vendor are cut to one line with the full text in `title`. The chips
  and the zones make the row taller. An invoice number does not wrap.
- **Sticky columns** need an opaque background in each cell, or the cells under them show through
  while the table scrolls.
- **A query fails.** The hook returns an empty list and the page shows the empty state (spec 03
  §8). Showing an error is not in this spec.
- **Restore fails.** The toast of `setMaintenanceEventDeleted` shows; the row stays.
- **E2E needs the new sync rules.** The fixture writes to `MaintenanceLineItems` and `Vendors`,
  which reach the test user only where the rules of spec 02 are deployed. Until then the S3, S8
  and S9 data does not arrive.

## 9. Not in this spec

- **The expand arrow and the services table (06), the service window (06), the damage report
  view and the link of Reported (06).**
- **The repair window and the button at the end of the row (07).**
- **The status menu on the pill (08).**
- **Writes:** Edit, New repair, services, files, Delete, the new Restore flow (09). The only
  write here is the Restore that already exists.
- **Search, the Zone, Vendor and Category filters, the multi-value Bleacher filter, sort arrows
  and Show Deleted in the URL (05).**
- **Hiding anything by role (D52).** A migration, a sync change, a change to the list query, the
  Dashboard (11) and the mobile app.

## 10. Definition of done

- `npm run tc` and `npx vitest run`, each with the real output and the exit code.
- `npx prettier --check` on the files this spec touches only (the repo-wide `npm run lint` is red
  at baseline).
- Playwright E2E: written (§6) and **SKIPPED** (the user's rule is not to run it; the admin
  project cannot run locally).
- **The browser check (D54), on the dev server `br-next-dev` in the Browser pane.** The user signs
  in through Clerk in the pane; nothing is added to the database and the local PowerSync is not
  restarted. To look at:
  - No console error. The Open tab: "No repairs found." with `$0.00` and `C$0.00` in the strip.
  - Completed: 25 rows, the pager "1–25 of 143", `?tab=completed`; sizes 50 and 100 and
    `?pageSize`; `?page=99` shows the last page; a tab switch goes to page 1.
  - The first column stays in view when the box scrolls sideways (the computed `position` and a
    screenshot while scrolled); a hovered row is one colour; headers have no arrows.
  - One repair is compared with SQL: its Total from `cost_cents`, its Reported by link, its
    Completed day; the repair with two zones shows them on two lines.
  - The Bleacher select narrows the rows and writes `bleacher_uuid`; Show Deleted shows the 8
    deleted repairs on Completed and the Open tab empty; Restore is checked to be present and is
    not clicked, because it writes data.
  - Screenshots are kept as proof. What the old data cannot show is in the Vitest tests.
- No change outside `src/features/repairs`, `src/app/repairs`, the two deleted files of
  `qualityAssurance`, `permissionPageData.ts` (and its test) and `docs/specs`.

## 11. Result (2026-11-19)

- **Implemented:** the six source files of §4 (`RepairsPage`, `RepairsTable`, `RepairsTotalsStrip`,
  `RepairChips`, `repairFormat`, `repairPageState`), the route `src/app/repairs/page.tsx`, the two
  deletions in `qualityAssurance` (`RepairsPage.tsx`, `useRepairs.ts`) and the matrix rows (§5).
  Tests: `repairFormat.test.ts`, `repairPageState.test.ts`, `RepairsTable.test.tsx`,
  `RepairsTotalsStrip.test.tsx` and new cases in `permissionPageData.test.ts`. E2E: the fixture
  `e2e/helpers/repairsFixtures.ts`, the helper `e2e/helpers/repairsPage.ts`,
  `repairsTable.admin.spec.ts` (S1 to S9) and `repairsAccess.{am,viewer,maintainer}.spec.ts` (S10).
- **Tests first:** the new test files were written before the code. The first run was red: the four
  new files could not load their modules, and the four new matrix cases failed.
- **Checks.**
  - `npm run tc`: exit 0 (the e2e files are type-checked too).
  - `npx vitest run`: exit 0, 550 files and 8009 tests (before: 546 and 7944, so +4 files and +65
    tests: 12 in `repairFormat`, 23 in `repairPageState`, 21 in `RepairsTable`, 5 in
    `RepairsTotalsStrip`, 4 in the matrix test).
  - `npx prettier --check` on the files this spec touches: clean.
  - Playwright: SKIPPED. The specs are written and were not run (the user's rule; the admin project
    cannot run locally either).
- **Mutation check.** Three rules of `repairPageState.ts` were broken one at a time (a page past the
  end does not clamp; the strip adds the page and not the tab; a wrong tab is read as Completed).
  The tests failed each time (2, 1 and 2 failing tests) and the file was restored byte for byte.
- **What differs from the text above.**
  - Every cell carries `data-col` (the column key) and starts with that attribute, because the
    component test finds a cell by it; the e2e specs use the same attribute. The tabs are a
    `Tabs` root with only a `TabsList`, as there is no tab content.
  - `utils/repairRowFixture.ts` is new: a row factory shared by the three component and state test
    files. It is test support, not page code, so the count of nine counted files stands.
  - The fixture `seedRepairs` also seeds a third bleacher with no repair (S6) and returns the
    stored `cost_cents`, which the database trigger works out from the services.
  - The page puts `.catch(() => {})` after `setMaintenanceEventDeleted`, whose own toast already
    reports the error, so a failed Restore is not an unhandled rejection.
  - The empty and loading blocks use container-query units (`w-[100cqw]`) on a scroll box with
    `container-type: inline-size`, to stay in the middle of the visible part of the box.
- **Not verified.**
  - **The browser check of §10 was not done.** In the built-in Browser pane the app never leaves its
    spinner: the SharedWorker of PowerSync cannot `importScripts` a script of its own origin (a
    direct test of a SharedWorker confirmed it; a dedicated worker works), so the local database does
    not open. The user chose to skip the check. The dev server on port 3000 was already running
    and was not touched.
  - So the sticky first column, the hover colour, the centring of the empty and loading blocks, the
    page's URL writes with `router.replace` and the first run of `useRepairList` on real data have
    not been seen in a browser. Chips, cells, colours, strip, tab and page logic are covered by the
    Vitest tests over fixture rows.
  - The e2e specs and the fixture were not run. The insert columns of the fixture were checked
    against the local database (required columns, category names, the cost trigger), not executed.
  - The Restore click is checked in the markup only; its write is the old, unchanged function.
- **Not done.** Nothing is committed. The deletions of the two old files are in the working tree,
  not staged.
