# Repairs 05: the toolbar (search, filters, sorting, Show Deleted)

Status: **APPROVED and IMPLEMENTED 2026-11-19**, uncommitted (0 open decisions; the "Approved"
covered the changed signatures of spec 04 listed in §3; the results are in §11; the browser check
was not done). Build order: **05 of 11**.
Needs: [repairs-01-design.md](repairs-01-design.md), [repairs-02-sync-rules.md](repairs-02-sync-rules.md),
[repairs-03-list-query.md](repairs-03-list-query.md) and [repairs-04-table.md](repairs-04-table.md)
(all done and committed). Needed by: 06 and the specs after it. Plan:
[repairs-plan.md](repairs-plan.md). Branch: `q4-sprint4-maintenance`.
Scope: **the toolbar of the Repairs page and what it does to the list: the search box, the four
filters Bleacher, Zone, Vendor and Category, sorting from the column headers, and Show Deleted in
the URL. It replaces the single Bleacher select of spec 04. Read-only (the one write stays the
Restore of spec 04). It changes some signatures that spec 04 locked; §3 lists every one and the
"Approved" of this spec approves them.** No migration, no sync change, and no change to the list
query or to the locked types of spec 03.

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

**Decisions of spec 04 (done, user, 2026-11-19).**

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

**Decisions of this spec (user, 2026-11-19; six question batches).**

- **D57 (what the search reads):** five things of a repair: the invoice number, the vendor's name,
  the notes, the numbers of its bleachers (written `#52`, so `52` and `#52` both find it) and the
  names of its categories. The descriptions of the services are not searched: the row does not
  show them until spec 06. The hint in the box says "Search invoice #, vendor, notes, bleacher #,
  category".
- **D58 (how the search compares):** the whole text, trimmed at both ends, as one piece. No
  difference of upper and lower case. It may match any part of one field. A text that would need
  two fields (a vendor and an invoice number together) finds nothing. `tire` finds `Caprock Tire`.
- **D59 (when the search reacts):** the box keeps its own text while the person types. The list and
  the address (`?q=`) both change after 300 ms without a new letter, and a changed text starts
  from page 1.
- **D60 (clearing the search):** a ✕ inside the box while it holds text, and Esc in the box. Both
  empty the box, and the change goes through the 300 ms rule of D59.
- **D61 (the lists of the four filters):** everything that exists. Bleacher: the bleachers that are
  not deleted (147 locally; the 55 deleted ones are left out). Zone: every zone (6). Vendor: every
  vendor (42). Category: every category (9). A vendor or a category that is switched off
  (`is_active` false) stays in its list with the mark "inactive". Ticking a value that no repair
  has gives the empty table. Because the lists are complete, the viewer sees the name of every
  vendor and not only of the vendors on repairs (the viewer already receives `Vendors` on the web,
  spec 02 D21, but no list showed them).
- **D62 (repairs without a value):** no extra entry ("No vendor", "No zone", "No category"). A
  repair that has no vendor or no zone is on the table only while that filter has nothing ticked.
- **D63 (the old select):** it is removed and the multi-value Bleacher filter takes its place. A
  saved link with `?bleacher_uuid=X` is still read as one ticked bleacher X; the first change the
  page writes replaces it with the new parameter.
- **D64 (the filters in the address):** the uuids, comma separated: `?bleachers=`, `?zones=`,
  `?vendors=`, `?categories=`.
- **D65 (Show Deleted in the address):** `?showDeleted=1`, for an administrator or a maintainer. The
  other roles ignore the parameter. It replaces the React state of spec 04 (D41).
- **D66 (Show Deleted and the tabs):** the two tabs stay in the Show Deleted view. D55, which was
  temporary, is final.
- **D67 (Restore):** it stays as it is in spec 04, in the last column of the Show Deleted view,
  until spec 09.
- **D68 (a chosen value that the list does not have):** it stays in the list, ticked, with the name
  "Unknown", and it counts in the badge. The person can untick it.
- **D69 (the page subtitle):** always "All maintenance and repair events across the fleet". The line
  "Showing for Bleacher #N" goes.
- **D70 (the strip caption in Show Deleted):** "Deleted open repairs that match the filters" and
  "Deleted completed repairs that match the filters".
- **D71 (nothing found):** the same wrench and "No repairs found." as now. There is no "Clear all"
  button anywhere: each filter has its own Clear, and the search has its ✕.
- **D72 (a click on a header):** two directions, as in the Quotes list. The first click on a text
  column (Zone, Notes, Status, Vendor, Invoice #) is A to Z. The first click on a date column
  (Reported, Repair from, Repair to, Completed) or a money column (Labor, Parts, Tax, Freight,
  Total) is the newest or the biggest first. Every next click on the same column flips the
  direction. No click goes back to the starting order. Texts are compared without difference of
  case, and numbers inside a text as numbers (`JJ-5` before `JJ-12`).
- **D73 (empty values in a sort):** an empty value is the lowest value: ascending puts the rows
  without a value first, descending puts them last. A zero amount is a value. (The Quotes list
  always puts blanks last; this page does not.)
- **D74 (the order of Status):** the course of a repair: Inbound, Triaged, Waiting repair, In
  repair, Confirm repair, Completed.
- **D75 (several values in one cell):** the sort uses the first one in the cell. Reported: the
  earliest day. Zone: the first zone, the zones being ordered by name.
- **D76 (the starting order):** D36 stays for both tabs: created, newest first.
- **D77 (the order of the filter lists):** Bleacher by number, smallest first. Zone, Vendor and
  Category by name, A to Z.
- **D78 (e2e):** the full set for the administrator, and one scenario each for the account manager,
  the viewer and the maintainer. Written, not run.
- **D79 (the browser check):** skipped, as in spec 04: the Browser pane cannot run PowerSync. The
  report says so and lists what nobody has seen.

**What follows from the design and from earlier decisions (no new decision).** Each item names its
source, so a reviewer can check it.

- **The logic of the filters** (D14, the canvas): inside one filter a repair passes when it has
  any of the ticked values; the search and all four filters must pass together. Bleacher: any of
  the repair's bleachers (the junction, D29). Zone: any of its zones (`zones`, D33). Vendor: the
  repair's vendor. Category: any of the repair's categories; an old repair has none, so it never
  passes a Category filter.
- **What the strip and the pager count** (D13, D16): the rows of the tab that pass the search and
  the filters. The strip caption already says "that match the filters".
- **Page 1** (spec 04 §2.6, the `pageAfterChange` rule of the Quotes list): a change of the
  search, of a filter, of the sort, of the tab, of the page size or of Show Deleted starts from
  page 1.
- **The address** (spec 04 §2.6, `filterUrlSync` of the Quotes list): besides `tab`, `page` and
  `pageSize`, the page owns `q`, `bleachers`, `zones`, `vendors`, `categories`, `sort` and
  `showDeleted`. A value is written only when it is not the default; parameters the page does not
  own are kept; the old `bleacher_uuid` is never written again. `sort` is `key:direction`, as in
  the Quotes list (`total:desc`). The names `q`, `zones`, `sort` and `showDeleted` are the Quotes
  names.
- **The tie in a sort** (D36): rows with an equal value keep the starting order, newest created
  first.
- **The headers** (D15, the canvas, `DataTable`): the fourteen sortable columns are buttons with the
  arrow icon of the canvas (a dim two-way arrow while the column is not the sort; a solid up or
  down arrow while it is) and `aria-sort` on the header. Bleachers, Severity, Categories and the
  Restore column stay plain text.
- **The toolbar** (the canvas): from left to right the search box, the buttons Bleacher, Zone,
  Vendor and Category, and Show Deleted at the right end. A filter button shows its label, a
  count badge when something is ticked, and a chevron; it has a blue outline while something is
  ticked. Its dropdown is 272 px wide, with its own search box ("Search"), a list of checkboxes
  that scrolls after about eight rows, and a Clear link that empties that filter only.
- **The size of the search box:** 400 px, and not the 300 px of the canvas, so that the longer hint
  of D57 fits on one line. The canvas is not redrawn.
- **Who sees Show Deleted** (D41): the button, the `?showDeleted=1` parameter and Restore work only
  for `canManageDamageAndMaintenance` (an administrator or a maintainer).
- **A deleted bleacher on a repair** (D61, D57): the repair still shows its chip and cannot be
  found with the Bleacher filter, because that list leaves deleted bleachers out; the search by
  number finds it. No local repair is on a deleted bleacher.
- **The pager text** (spec 04 §2.8): unchanged. With no rows it reads "0–0 of 0".
- **A chosen value while the lists load** (D68): it is called "Unknown" only after the lists have
  loaded. Until then the badge counts it and the list says "Loading...".
- **The old and the new bleacher parameter together:** when `bleachers` has a value it wins and
  `bleacher_uuid` is ignored.
- **A tab switch** keeps the search, the filters and the sort: they live in the address, and
  `narrowRepairsUrlState` changes only what its patch names.
- **The permissions matrix** (CLAUDE.md, §5): the search, the filters, the sorting and the address
  form of Show Deleted change nobody's rights. One consequence of D61 is written into the matrix:
  the viewer sees the name of every vendor.

## 1. What the code has today (researched 2026-11-19)

- **The page (spec 04).** `RepairsPage` reads its state from the address with
  `readRepairsUrlState` (`tab`, `page`, `pageSize`, `bleacher_uuid`) and writes it with
  `router.replace`. It has one Bleacher `<select>` fed by `useBleacherOptions`, a Show Deleted
  button over a React `useState`, the strip, the tabs, `RepairsTable` and `Pagination`. The table
  headers are plain text and there is no sort. `buildRepairsView` filters by one bleacher, splits
  by tab, adds the totals and cuts one page.
- **`useBleacherOptions`** (`qualityAssurance/hooks/useFilterOptions.ts`, also used by Damage
  Reports) lists every bleacher by number, deleted ones included. It is not changed.
- **What the Quotes list does that this page copies.**
  - `searchEvents` lower-cases the text and looks for it inside a field.
  - `filterUrlSync` writes `q`, `zones`, `sort` and `showDeleted` and keeps foreign parameters.
  - `sortEvents` compares with `Intl.Collator` (no case, numbers as numbers) and has a first
    direction per column and a flip on every next click (`nextSort`). It puts blanks last;
    this page does not (D73).
  - `listPageEffects` holds `URL_WRITE_DEBOUNCE_MS` (300) and `pageAfterChange`. `useListPageState`
    keeps the state in React and mirrors it to the address; the Repairs page does the opposite and
    reads the address (spec 04), so only the search box keeps a local copy of its text.
- **Components to use.** `Popover`, `PopoverTrigger` and `PopoverContent` in
  `src/components/ui/popover.tsx`. `MultiSelect` is not used: it draws the ticked values as chips in
  the button, and the canvas draws a count badge. `DataTable` draws the sort header with the lucide
  icons `ArrowUp`, `ArrowDown` and `ArrowUpDown`; the canvas draws the same two-way arrow.
- **The local database (Supabase dev, 2026-11-19, dev data, not production).**
  - Repairs: 151, of which 143 live and 8 deleted; all completed, USD, with no vendor, invoice
    number or service; `cost_cents` is empty in 111 of them; 3 live repairs have no bleacher that
    is in a zone.
  - Bleachers: 202, of which 55 are deleted (none of them has a repair) and 147 are live; 70
    bleachers have repairs; one bleacher is numbered `-1`.
  - Zones: 6, named `Zone 1` and so on. Vendors: 42, all active; two pairs share a name (`CURA`,
    `Dirty Boots`); none is linked to a repair. Categories: 9, all active, all created in the same
    minute, so the database holds no order for them.
  - `Vendors` can be read through the database rules by admin, account manager, accountant and
    maintainer; the viewer receives `Vendors` through the sync rules of spec 02 (D21).
- **The matrix.** Spec 04 added the row "Repair Costs & Vendors" (read for the four roles; the
  viewer's note says "vendors included"). The row "Repairs & Maintenance" says that an
  administrator or a maintainer shows and restores deleted repairs.
- **Tests that exist for this page.** `repairPageState.test.ts`, `RepairsTable.test.tsx` and
  `RepairsTotalsStrip.test.tsx` (spec 04), `permissionPageData.test.ts`, and the e2e files in
  `src/features/repairs/e2e` (S1 to S10 and the fixture `seedRepairs`). Component tests run in
  Vitest's node environment with `renderToStaticMarkup`; there is no jsdom and no `renderHook`, so
  an effect (the pause of the search box, `router.replace`) is not run by Vitest.

## 2. The toolbar and what it does

### 2.1 Layout, top to bottom

- **Header.** The title "Repairs" and the subtitle "All maintenance and repair events across the
  fleet", always (D69).
- **The strip**, **the tabs**, then **the toolbar** in one row that wraps on a narrow screen:
  the search box, the buttons Bleacher, Zone, Vendor and Category, and Show Deleted at the right
  end for an administrator or a maintainer. Then **the table** and **the pager** (spec 04).

### 2.2 The search box

- A `type="search"` input, 400 px wide (at most 100 percent), height 36 px, a magnifier icon at the
  left, `aria-label="Search repairs"`, the hint "Search invoice #, vendor, notes, bleacher #,
  category" (D57). The browser's own clear button is hidden; the page draws its own ✕ (D60).
- **What it reads (D57).** For one repair: `invoiceNumber`, `vendorName`, `notes`, each bleacher
  written `#N` (a bleacher with no number is not searched) and each category name.
- **How it compares (D58).** `needle` is the text trimmed and lower-cased; an empty `needle` keeps
  every row. A repair passes when `needle` is inside one of those values, lower-cased. Values are
  not joined, so a text that spans two fields finds nothing.
- **When it reacts (D59, D60).** The box holds its own text. 300 ms after it stops changing, the
  page calls `onChange({ search: text })`: the list and the address change together, and the page
  is 1. The ✕ shows while the box holds any text; the ✕ and Esc empty the box and go
  through the same 300 ms pause. The timer calls the latest `onChange` (kept in a ref), so a tab or
  filter change made during the pause is not undone.
- **The address.** `?q=` carries the text as typed, but nothing is written for a text that is only
  spaces. The box takes the address's `q` only when the address changed by something other than
  this box (the back button, a link), and not on its own write, so the cursor does not jump.

### 2.3 The four filters

- **The button.** The label ("Bleacher", "Zone", "Vendor", "Category"), a count badge when
  something is ticked (the number of ticked values, "Unknown" ones included), and a chevron. A
  button with ticks has the blue outline of the canvas. It opens a `Popover`.
- **The dropdown.** 272 px wide: a search box ("Search") that filters the labels without
  difference of case (any part of the label), a list that scrolls after about eight rows, and a
  Clear link under it that empties this filter only. A row is a checkbox button
  (`role="menuitemcheckbox"` with `aria-checked`) inside a group named after its filter ("Vendor
  filter", for example). Ticking does not close the dropdown; a click outside or Esc does. When the
  search leaves nothing the list says "No matches". While the lists load it says "Loading...".
- **The lists (D61, D77).**
  - **Bleacher:** the bleachers that are not deleted, labelled `#N`, by number smallest first; a
    bleacher with no number is `#?` and last; ties by id.
  - **Zone:** every zone, labelled by its name ("Unnamed zone" if it has none), A to Z.
  - **Vendor:** every vendor by its name ("Unnamed vendor" if it has none), A to Z, ties by id. A
    vendor with `is_active` false has the grey mark "inactive" after its name. Two vendors with
    the same name are two lines that look alike.
  - **Category:** every category by its name, A to Z, with the same mark for a switched-off one.
  - Names are ordered with `Intl.Collator` (no case, numbers as numbers).
- **A chosen value that is not in the list (D68).** Every ticked value that the list lacks is
  added at the top, ticked, labelled "Unknown", with its id in the `title`. It happens when an
  address names a deleted bleacher or a vendor that is gone. The lists must have loaded first.
- **The address (D64).** Each filter writes its ticked values as uuids, comma separated, in the
  order they were ticked; none ticked writes nothing.

### 2.4 The rule of the filters

One pure function, `filterRepairs(rows, criteria)`, keeps the rows that pass all of these. The
order of the rows is kept.

- **Search:** §2.2. **Bleacher:** none ticked passes everything; otherwise
  `row.bleachers.some(b => ticked.has(b.uuid))`.
- **Zone:** `row.zones.some(z => ticked.has(z.uuid))`.
- **Vendor:** `row.vendorUuid` is not null and is ticked.
- **Category:** `row.categories.some(c => ticked.has(c.uuid))`.

### 2.5 Sorting

- **The sort** is `{ key, direction } | null`. `null` is the starting order of the hook (created,
  newest first, D36), and it is the only state with no key in the address.
- **The keys and what each reads.** A value is empty when it is null or an empty text.
  - `reported`: `reported[0].day`, the earliest day (D75). `from`: `eventStart`. `to`: `eventEnd`.
    `completed`: `completedOn`. These are `YYYY-MM-DD` texts, which order correctly as texts.
  - `zone`: `zones[0].name`, the first zone, the zones being ordered by name (D75); a zone with no
    name is empty. `notes`, `vendor`, `invoice`: `notes`, `vendorName`, `invoiceNumber`, each
    trimmed.
  - `status`: the place in the course (D74): inbound 0, triaged 1, waiting_repair 2, in_repair 3,
    confirm_repair 4, completed 5; a status the code does not know comes after them.
  - `labor`, `parts`, `tax`, `freight`, `total`: the cents of the row (`laborCents` and so on); null
    is empty and 0 is a value.
- **The order.** Empty is the lowest value (D73): the comparison is made as if an empty value were
  smaller than any other, then multiplied by `1` for ascending and by `-1` for descending. Texts
  are compared with `Intl.Collator` (no case, numbers inside a text as numbers, D72) and amounts
  as numbers. Rows that compare equal keep the starting order.
- **The click (D72).** `nextRepairSort(current, key)`: the same key flips the direction; another
  key (or `null`) starts with the first direction of that key: ascending for `zone`, `notes`,
  `status`, `vendor`, `invoice`; descending for `reported`, `from`, `to`, `completed`, `labor`,
  `parts`, `tax`, `freight`, `total`. There is no third click.
- **The address.** `?sort=total:desc`. `null` is not written. A bad key or direction reads as
  `null`.
- **The headers.** For the fourteen keys the header holds a button with the label and the icon
  (the item "The headers" under "What follows from the design"); the header carries
  `aria-sort="ascending"` or `"descending"` while it is the sort and no `aria-sort` otherwise. A
  money column keeps its label at the right. Bleachers, Severity, Categories and the Restore
  column stay plain text (D15).

### 2.6 Show Deleted

- The state is `showDeleted` in the address (D65). The page works with
  `canShowDeleted && urlState.showDeleted`, so a role without the right never sees deleted
  repairs, whatever its address says. The parameter is left in that address as it is.
- The button is the one of spec 04 (the same look and the labels "Show Deleted" and "Showing
  Deleted"), now in the toolbar. A click writes or removes `?showDeleted=1` and goes to page 1.
- The search, the filters and the sort apply to the deleted repairs as to the live ones. The two
  tabs stay (D66).
- The strip caption in that view is "Deleted open repairs that match the filters" or "Deleted
  completed repairs that match the filters" (D70).
- Restore and the last column are as in spec 04 (D67).

### 2.7 The state in the address

- `tab`: `completed` only (spec 04). `page`: above 1. `pageSize`: other than 25.
- `q`: the search text, when it is not only spaces. `bleachers`, `zones`, `vendors`,
  `categories`: ticked uuids, comma separated, when at least one.
- `sort`: `key:direction`, when there is a sort. `showDeleted`: `1`, when on.
- **Reading.** Empty items and repeats in a list are dropped; the order is kept. `bleacher_uuid` is
  read as `bleachers` only when `bleachers` has no value (D63). A bad `sort` is `null`.
- **Writing.** Parameters the page does not own are kept. `bleacher_uuid` is always removed.
- **Narrowing.** `narrowRepairsUrlState(state, patch)` applies the patch and goes to page 1. A bare
  page change does not call it.

### 2.8 Empty and loading

- The empty block is the one of spec 04 whatever the cause (D71). While `useRepairList` loads, the
  frame, the strip with dashes and the "Loading..." body are as in spec 04.
- The filter lists load apart from the list. Until they have, the buttons show their counts and a
  dropdown says "Loading...".

### 2.9 How the page is put together

```
const state = readRepairsUrlState(searchParams);
const showDeleted = canManage && state.showDeleted;
const { rows, isLoading } = useRepairList({ showDeleted, timezone });
const view = buildRepairsView(rows, state); // search and filters, sort, tab, totals, one page
const { options, isLoading: optionsLoading } = useRepairFilterOptions();
```

`buildRepairsView` runs `filterRepairs`, then `sortRepairs`, then `splitByTab`, then the totals
and the page slice. `go(next)` is the `router.replace` of spec 04. A header click calls
`go(narrowRepairsUrlState(state, { sort: nextRepairSort(state.sort, key) }))`.

## 3. Types and signatures (locked; changing them needs a new "Approved")

The types of spec 03 (`RepairListRow` and the rest) and `RepairsView` are used as they are. The
"Approved" of this spec approves the changes to the signatures of spec 04 that are listed here.

**Changed from spec 04** (each is the old text and what it becomes):

- `RepairsUrlState`: loses `bleacherUuid`; gains `search`, `bleacherUuids`, `zoneUuids`,
  `vendorUuids`, `categoryUuids`, `sort` and `showDeleted`.
- `readRepairsUrlState(params)`: reads the new parameters; reads `bleacher_uuid` as one ticked
  bleacher when `bleachers` is empty.
- `writeRepairsUrlState(state, existing)`: writes the new parameters and always removes
  `bleacher_uuid`.
- `narrowRepairsUrlState(state, patch)`: the patch may now name `search`, the four lists, `sort`
  and `showDeleted` besides `tab` and `pageSize`; it still goes to page 1.
- `filterByBleacher(rows, bleacherUuid)`: **removed**, replaced by `filterRepairs` below.
- `buildRepairsView(rows, state)`: also filters by the search and the four lists and sorts; the
  returned `RepairsView` is the same.
- `RepairsTableProps`: gains `sort` and `onSort`.
- `RepairsTotalsStripProps`: gains `deleted`.

```ts
// src/features/repairs/utils/repairPageState.ts
import type { RepairSort } from "./repairSort";
export type RepairsUrlState = {
  tab: RepairTab;
  page: number; // 1-based
  pageSize: PageSize; // 25 | 50 | 100
  search: string; // as typed; "" = none
  bleacherUuids: string[];
  zoneUuids: string[];
  vendorUuids: string[];
  categoryUuids: string[];
  sort: RepairSort | null; // null = the starting order
  showDeleted: boolean; // as in the address; the page honours it only for a role that may
};
export type RepairsUrlPatch = Partial<Omit<RepairsUrlState, "page">>;
export function readRepairsUrlState(params: { get(key: string): string | null }): RepairsUrlState;
export function writeRepairsUrlState(
  state: RepairsUrlState,
  existing: URLSearchParams,
): URLSearchParams; // defaults are not written, other parameters are kept, bleacher_uuid removed
export function narrowRepairsUrlState(
  state: RepairsUrlState,
  patch: RepairsUrlPatch,
): RepairsUrlState; // applies the patch and goes to page 1
export function buildRepairsView(
  rows: readonly RepairListRow[],
  state: RepairsUrlState,
): RepairsView; // RepairsView is unchanged

// src/features/repairs/utils/repairSort.ts
export const REPAIR_SORT_KEYS = [
  "reported",
  "from",
  "to",
  "zone",
  "notes",
  "status",
  "vendor",
  "invoice",
  "labor",
  "parts",
  "tax",
  "freight",
  "total",
  "completed",
] as const;
export type RepairSortKey = (typeof REPAIR_SORT_KEYS)[number];
export type RepairSort = { key: RepairSortKey; direction: "asc" | "desc" };
export function nextRepairSort(current: RepairSort | null, key: RepairSortKey): RepairSort;
export function sortRepairs(
  rows: readonly RepairListRow[],
  sort: RepairSort | null,
): RepairListRow[];
// null returns the rows in the same order
export function serializeRepairSort(sort: RepairSort | null): string | null; // "total:desc"
export function parseRepairSort(raw: string | null): RepairSort | null; // bad input = null

// src/features/repairs/utils/repairFilters.ts
export const SEARCH_PAUSE_MS = 300;
export const SEARCH_HINT = "Search invoice #, vendor, notes, bleacher #, category";
export type RepairFilterCriteria = {
  search: string;
  bleacherUuids: readonly string[];
  zoneUuids: readonly string[];
  vendorUuids: readonly string[];
  categoryUuids: readonly string[];
};
export function repairMatchesSearch(row: RepairListRow, search: string): boolean;
export function filterRepairs(
  rows: readonly RepairListRow[],
  criteria: RepairFilterCriteria,
): RepairListRow[];
export type FilterKey = "bleacher" | "zone" | "vendor" | "category";
export type FilterOption = { value: string; label: string; inactive: boolean };
export type RepairFilterOptions = Record<FilterKey, FilterOption[]>;
export function buildRepairFilterOptions(raw: {
  bleachers: readonly RawBleacherOption[];
  zones: readonly RawZoneOption[];
  vendors: readonly RawVendorOption[];
  categories: readonly RawCategoryOption[];
}): RepairFilterOptions; // §2.3: what is listed and in what order
export function withUnknownSelected(
  options: readonly FilterOption[],
  selected: readonly string[],
): FilterOption[]; // ticked values the list lacks, at the top, labelled "Unknown"
export function searchOptions(options: readonly FilterOption[], text: string): FilterOption[];

// src/features/repairs/db/repairFilterQueries.ts (compiled Kysely queries, no db.fn)
export type RawBleacherOption = {
  id: string;
  bleacherNumber: number | null;
  deleted: number | null;
};
export type RawZoneOption = { id: string; name: string | null };
export type RawVendorOption = { id: string; name: string | null; isActive: number | null };
export type RawCategoryOption = { id: string; name: string | null; isActive: number | null };
export function buildBleacherOptionsQuery(): CompiledQuery<RawBleacherOption>;
export function buildZoneOptionsQuery(): CompiledQuery<RawZoneOption>;
export function buildVendorOptionsQuery(): CompiledQuery<RawVendorOption>;
export function buildCategoryOptionsQuery(): CompiledQuery<RawCategoryOption>;

// src/features/repairs/hooks/useRepairFilterOptions.ts
export function useRepairFilterOptions(): { options: RepairFilterOptions; isLoading: boolean };

// src/features/repairs/components/RepairFilterMenu.tsx
export type RepairFilterMenuProps = {
  label: string; // "Bleacher", "Zone", "Vendor" or "Category"
  filterKey: FilterKey;
  options: FilterOption[]; // with the Unknown ones already added
  selected: readonly string[];
  isLoading: boolean;
  onChange: (values: string[]) => void;
};
export type RepairFilterListProps = {
  label: string;
  options: FilterOption[];
  selected: readonly string[];
  isLoading: boolean;
  query: string; // the text of the search box inside the dropdown
  onQueryChange: (text: string) => void;
  onToggle: (value: string) => void;
  onClear: () => void;
}; // the content of the dropdown, exported so a test can render it open
// src/features/repairs/components/RepairsToolbar.tsx
export type RepairsToolbarProps = {
  search: string;
  bleacherUuids: readonly string[];
  zoneUuids: readonly string[];
  vendorUuids: readonly string[];
  categoryUuids: readonly string[];
  options: RepairFilterOptions;
  optionsLoading: boolean;
  canShowDeleted: boolean; // the role may use Show Deleted
  showDeleted: boolean; // and it is on
  onChange: (patch: RepairsUrlPatch) => void;
};

// src/features/repairs/components/RepairsTable.tsx
export type RepairsTableProps = {
  rows: RepairListRow[]; // the rows of the page shown
  isLoading: boolean;
  showRestore: boolean;
  onRestore: (repairId: string) => void;
  sort: RepairSort | null; // new
  onSort: (key: RepairSortKey) => void; // new
};
// src/features/repairs/components/RepairsTotalsStrip.tsx
export type RepairsTotalsStripProps = {
  tab: RepairTab;
  deleted: boolean; // new: the Show Deleted view, for the caption (D70)
  totals: CurrencyTotals | null;
};
```

Test hooks for e2e: `data-testid` `repairs-search`, `repairs-search-clear`,
`repairs-filter-bleacher`, `repairs-filter-zone`, `repairs-filter-vendor`,
`repairs-filter-category` (the button) and `repairs-filter-list-<key>` (the dropdown), plus those
of spec 04. A sort button is found by role `button` and the column's name.

## 4. Files

- **New** (`src/features/repairs`), six counted source files:
  - `components/RepairsToolbar.tsx`, `components/RepairFilterMenu.tsx`.
  - `hooks/useRepairFilterOptions.ts`, `db/repairFilterQueries.ts`.
  - `utils/repairFilters.ts` (search, the four filters and the option lists, one logic),
    `utils/repairSort.ts`.
- **Changed:** `components/RepairsPage.tsx`, `components/RepairsTable.tsx`,
  `components/RepairsTotalsStrip.tsx`, `utils/repairPageState.ts`;
  `src/features/userAccess/permissionPageData.ts` (§5, not counted).
- **Not touched:** `useRepairList` and the list query, `repairRows.ts` and the locked types of
  spec 03, `Pagination`, `DataTable`, `useBleacherOptions`, `MaintenanceEventForm`, the Dashboard,
  `AppSchema.ts`, the sync rules.

That is ten counted files (six new, four changed); tests, the matrix and the e2e files do not
count. The cap of ten holds, exactly.

## 5. The permissions matrix (`permissionPageData.ts`, same commit)

**Checked, no change of rights:** the search, the four filters and the sort only change what the
reader sees of rows they can already read; no role gains or loses a write. `?showDeleted=1` is
honoured only for an administrator or a maintainer, the same two roles as the button (D41, D65),
and a link cannot give the other roles deleted repairs. The row "Repairs & Maintenance" already
says that an administrator or a maintainer shows and restores deleted repairs, and stays as it is.

**One edit, a consequence of D61.** The Vendor filter lists every vendor. The viewer receives
`Vendors` already (spec 02, D21) but saw only the vendors of repairs, so what the viewer sees grows.
In the row "Repair Costs & Vendors" (right after "Repairs & Maintenance"):

- **Description:** the sentence "Every role that opens the Repairs page sees all of it." gets one
  more sentence after it: "The Vendor filter lists every vendor, not only the ones that have
  repairs."
- **Viewer note:** "Sees every column and the total cost strip, vendors included, and the name of
  every vendor in the Vendor filter." (it was "...vendors included.").
- The other roles' notes stay (an administrator, an account manager and a maintainer read
  `Vendors` anyway).

`permissionPageData.test.ts` gets a case for the new description sentence and for the viewer note.

## 6. Behaviour scenarios (Playwright, written and not run)

The fixture `seedRepairs` of spec 04 is used. It gets one addition: bleacher A is put in an
existing zone and bleacher B in another one (the first two rows of `Zones`; the local database has
six), and the fixture returns their uuids and names. The scenarios that need a zone skip
themselves if the database has fewer than two zones. The helper `bleacherQuery` writes
`?bleachers=`; the old form is tested on its own (S13).

**Changes to the scenarios of spec 04:** S1 no longer says "no sort button": the headers of the
fourteen sortable columns are buttons and Bleachers, Severity and Categories are not; S6 uses the
Bleacher filter instead of the select (the heading "Repairs" and the parameter `bleachers`); S4, S5
and S10 use the changed helper.

Administrator (`repairsToolbar.admin.spec.ts`):

- **S11:** the search finds the completed repair by its invoice number, by the vendor's name, by
  its notes, by `#` plus the number of bleacher A and by the bare number, and by the category
  "Welding" (the CAD repair, which has only Tires, is not found by it). A text in a different
  case finds the same. A text made of the vendor's name and the invoice number together finds
  nothing (D58).
- **S12:** typing writes `?q=` only after a pause and the strip and the pager follow the matches;
  the ✕ empties the box and removes `q`; so does Esc; a reload keeps the text; `page` is dropped
  when the text changes.
- **S13:** the Bleacher filter lists bleachers by number; ticking A keeps A's repairs; ticking A and
  B keeps both (the badge reads 2) and writes `bleachers=` with two uuids; Clear empties it. A link
  with `?bleacher_uuid=` of A shows A ticked, and the first change writes `bleachers` and drops the
  old parameter.
- **S14:** the Zone filter keeps the repairs of the ticked zone. The Vendor filter lists the seeded
  vendor and keeps only its repairs (the CAD repair has no vendor and leaves). Neither has an
  entry for "no vendor" or "no zone".
- **S15:** the Category filter keeps the repairs that have a service of the ticked category;
  Welding and Tires together keep both repairs; Vendor and Category together keep only a repair
  that passes both (D14); the strip amounts and the pager count follow.
- **S16:** `?vendors=<a uuid nobody has>` shows a ticked "Unknown" in the Vendor list, the badge
  reads 1 and the table says "No repairs found."; unticking it restores the list.
- **S17:** clicking the header Total sorts descending and writes `sort=total:desc`; the rows are in
  that order and the header has `aria-sort="descending"`; a second click is ascending; Vendor
  ascending puts the rows without a vendor first and descending puts them last (D73); the sort
  stays when the tab is switched; the page is 1 after a click.
- **S18:** `?showDeleted=1` shows the deleted repair on Completed with "Showing Deleted" on the
  button and the caption "Deleted completed repairs that match the filters"; the button writes and
  removes the parameter; a search or a filter applies to that view.
- **S19:** with a filter that matches nothing the table says "No repairs found." and the pager
  reads "0–0 of 0".

Account manager, viewer and maintainer (a test added to each `repairsAccess.<role>.spec.ts`):

- **S20:** the search by the invoice number and the Vendor filter narrow the list to the first
  repair. For the account manager and the viewer, `?showDeleted=1` shows no deleted repair, no
  Restore and no "Showing Deleted" button. For the maintainer it shows the deleted repair.

## 7. Tests (Vitest, written first)

- **`repairFilters.test.ts`.**
  - Search: each of the five fields finds its repair; `52` and `#52` find bleacher 52; a bleacher
    with no number is not searched; no difference of case; any part of a field; the text is trimmed;
    an empty or only-spaces text keeps every row; a text that spans the vendor and the invoice
    number finds nothing (D58).
  - Filters: a bleacher, a zone, a vendor and a category each keep their rows; several values in one
    filter are "any of"; two filters are "all of"; a repair with no vendor does not pass a Vendor
    filter; an old repair with no category does not pass a Category filter; a repair with several
    zones passes on any; the order of the rows is kept; nothing ticked keeps every row.
  - Options: Bleacher leaves deleted bleachers out, labels `#N`, orders by number and puts a
    bleacher with no number last as `#?`; Zone, Vendor and Category are ordered A to Z with
    numbers as numbers; an unnamed zone and an unnamed vendor get their placeholders; a switched-off
    vendor or category is marked inactive and a null flag is active; two vendors with one name both
    stay; `withUnknownSelected` adds the missing ticked values at the top, in order, and adds
    nothing when all are listed; `searchOptions` matches any part of a label without case.
- **`repairSort.test.ts`.**
  - Each of the fourteen keys sorts by what §2.5 says, ascending and descending.
  - Empty is the lowest: ascending puts it first, descending last; a zero amount is a value; a
    blank text is empty.
  - Status follows the course, and an unknown status comes after Completed.
  - Reported uses the earliest day; Zone uses the first zone and an unnamed zone is empty.
  - Texts ignore case and read numbers as numbers (`JJ-5` before `JJ-12`); equal rows keep the
    starting order (a stable tie); `null` returns the same order and does not change the input.
  - `nextRepairSort`: the first direction of each kind (text ascending, date and money descending),
    a flip on the same key, a new key starts with its own first direction, `null` starts with it.
  - `serializeRepairSort` and `parseRepairSort` round-trip every key and direction; bad keys,
    bad directions and an empty value give `null`.
- **`repairPageState.test.ts` (rewritten for the new state).**
  - Reading: defaults; every new parameter; lists drop empty items and repeats and keep order;
    `bleacher_uuid` becomes one ticked bleacher; `bleachers` wins over it; `showDeleted=1`; a bad
    `sort` is `null`; the parameters of spec 04 as before.
  - Writing: defaults are not written; each value is; lists join with commas; `q` is written as
    typed and not for only spaces; foreign parameters are kept; `bleacher_uuid` is removed; a stale
    `page` is removed.
  - `narrowRepairsUrlState`: a search, each of the four lists, a sort, `showDeleted`, a tab and a page
    size each go to page 1 and keep the rest; an empty patch goes to page 1.
  - `buildRepairsView`: the order is filter, sort, tab split; the totals are of the filtered tab and
    not of the page; a search that matches nothing gives page 1 and totals of 0; a page past the end
    gives the last page.
- **`repairFilterQueries.test.ts`** (the SQLite harness through the bound proxy of the Audit tests).
  The four queries return their columns, bleachers come with their deleted flag, and no query uses
  `db.fn`.
- **`RepairsTable.test.tsx`.** The fourteen sortable headers are buttons and Bleachers, Severity,
  Categories and the Restore header are not; `aria-sort` is set on the sorted header only, with the
  right word; the sorted header draws the up or down arrow and the others the two-way arrow; a money
  header is right-aligned; the rest of the cases of spec 04 (the case "no `button` in a header" is
  replaced).
- **`RepairFilterMenu.test.tsx`.** The button shows its label and no badge with nothing ticked, and the
  count with ticks; `RepairFilterList` draws a row per option with `aria-checked`, the mark
  "inactive", "Unknown" rows, "No matches", "Loading..." and the Clear link.
- **`RepairsToolbar.test.tsx`.** The box has the hint of D57, 400 px and `aria-label`; the ✕ shows
  only when the box has text; the four buttons come in the order Bleacher, Zone, Vendor, Category;
  Show Deleted shows only when `canShowDeleted` and reads "Showing Deleted" when on.
- **`RepairsTotalsStrip.test.tsx`.** Four captions: Open, Completed, and the two with "Deleted".
- **`permissionPageData.test.ts`.** The new description sentence and the viewer note (§5).
- **A mutation check.** Three rules are broken one at a time (a filter's "any of" becomes "all
  of"; an empty value sorts as the highest; a changed search does not go to page 1) and the tests
  must fail each time.
- **Not unit-tested, by project limits:** the 300 ms pause and the ✕ and Esc of the search box,
  the `router.replace` writes and the opening of a dropdown (an effect or a click: Vitest has no
  jsdom). They are covered by the e2e scenarios, which are written and not run.

## 8. Edge cases and errors

- **Offline (PowerSync).** Every read is local, so search, filters and sort work offline. The
  only write is Restore, as in spec 04.
- **Clerk and auth.** The toolbar makes no call of its own; who opens the page is unchanged.
- **A long list.** 147 bleachers scroll inside their dropdown and the dropdown's own search
  narrows them.
- **Two vendors with one name** (`CURA`, `Dirty Boots` locally) are two lines that look alike. The
  address and the filter use the uuid, so they stay two filters; the person cannot tell them apart
  by the list alone.
- **A text of only spaces** is shown in the box, is not written to the address and filters
  nothing.
- **The address.** A bad `sort` is the starting order; repeats and empty items in a list are
  dropped; `?bleachers=` with a deleted or unknown uuid shows "Unknown" ticked and an empty table
  until it is unticked; `?showDeleted=1` for a role without the right is ignored and stays in the
  address.
- **Permissions load a moment after the page.** For an administrator who opens `?showDeleted=1`, the
  first render may show the live repairs and then switch to the deleted ones.
- **A tab switch** keeps the search, the filters and the sort and goes to page 1.
- **A page past the end** after a narrowing cannot happen (the narrowing goes to page 1); a typed
  `?page=99` shows the last page (D50).
- **A repair on a deleted bleacher** is found by the search by number and not by the Bleacher filter.
- **The strip and the pager** follow the search and the filters; with no match the strip reads
  `$0.00` and `C$0.00` and the pager reads "0–0 of 0".
- **A change during the pause of the search** (a tab or a filter) is kept: the timer calls the
  latest `onChange`.
- **The sort** keeps the starting order for equal rows, so an unsorted column's order is stable.
- **Restore in a filtered view:** the row leaves the view by itself (reactive list).
- **Not seen in a browser** (D79): the dropdown's position and focus, the badge and outline look,
  the header buttons next to the sticky column, and the writes to the address; see §10.
- **E2E needs the sync rules of spec 02** (vendors and services reach the test user), as in spec 04.

## 9. Not in this spec

- **The expand arrow and the services table, the service window and the Reported link (06).**
- **The repair window and the button at the end of the row (07).**
- **The status menu on the pill (08).**
- **Writes: Edit, New repair, services, files, Delete, the new Restore flow (09).**
- **Entries for repairs without a vendor, a zone or a category (D62), a "Clear all" button (D71),
  a third click that returns to the starting order (D72), and the descriptions of the services in
  the search (D57).**
- **Filters by status, severity, currency or date; saved views.** A change to the list query, to
  `useRepairList`, to `Pagination`, to the sync rules, to the Dashboard (11) or to the mobile app.

## 10. Definition of done

- `npm run tc` and `npx vitest run`, each with the real output and the exit code.
- `npx prettier --check` on the files this spec touches only (the repo-wide `npm run lint` is red
  at baseline).
- Playwright E2E: written (§6) and **SKIPPED** (the user's rule is not to run it; the admin
  project cannot run locally).
- **The browser check: SKIPPED (D79).** The Browser pane cannot run PowerSync, and the user chose to
  skip it, as for spec 04. The report lists what nobody has seen in a browser: from spec 04 the
  sticky first column, the hover colour, the centring of the empty and loading blocks, the
  `router.replace` writes and the first run of `useRepairList` on real data; from this spec the
  dropdowns (position, focus, scroll, the badge and the outline), the ✕ and the pause of the
  search box, the sort buttons in the headers, and the filters over the 151 old repairs.
- No change outside `src/features/repairs`, `permissionPageData.ts` (and its test) and
  `docs/specs`.

## 11. Result (2026-11-19)

- **Implemented:** the ten counted files of §4 (new: `RepairsToolbar`, `RepairFilterMenu`,
  `useRepairFilterOptions`, `repairFilterQueries`, `repairFilters`, `repairSort`; changed:
  `RepairsPage`, `RepairsTable`, `RepairsTotalsStrip`, `repairPageState`) and the matrix edit of §5.
  Tests: new `repairSort.test.ts` (27), `repairFilters.test.ts` (32), `repairFilterQueries.test.ts`
  (5), `RepairFilterMenu.test.tsx` (12) and `RepairsToolbar.test.tsx` (10); changed
  `repairPageState.test.ts` (23 to 34), `RepairsTable.test.tsx` (21 to 27),
  `RepairsTotalsStrip.test.tsx` (5 to 6) and `permissionPageData.test.ts` (two new cases). E2E: the
  fixture and the helpers of spec 04 extended, S1 and S6 changed, the new
  `repairsToolbar.admin.spec.ts` (S11 to S19) and S20 added to the three `repairsAccess` specs.
- **Tests first:** the new and changed tests were written before the code. The first run was red:
  9 of 14 test files failed (29 failing tests; five files could not load their module because it
  did not exist yet: `repairSort`, `repairFilters`, `repairFilterQueries`, `RepairFilterMenu`,
  `RepairsToolbar`; the others failed on the new state, props, caption and matrix text).
- **Checks.**
  - `npm run tc`: exit 0 (the e2e files are type-checked too).
  - `npx vitest run`: exit 0, 555 files and 8115 tests (before: 550 and 8009, so +5 files and +106
    tests).
  - `npx prettier --check` on every file this spec touches: clean.
  - Playwright: SKIPPED. The specs are written and were not run (the user's rule; the admin
    project cannot run locally either).
  - Browser check: SKIPPED (D79).
- **Mutation check.** Three rules were broken one at a time (the Bleacher filter's "any of" became
  "all of"; an empty value sorted as the highest; a changed search did not go to page 1). The tests
  failed each time (2, 3 and 1 failing tests) and the three files were restored byte for byte (checked
  with `shasum`).
- **What differs from the text above.**
  - `repairFilters.ts` also exports the constant `UNKNOWN_LABEL` ("Unknown"). `RepairFilterList`
    uses it to put the id in the `title` of an Unknown row; the types of §3 are unchanged.
  - `RepairFilterList` says "No matches" whenever the visible list is empty, also when the list
    itself is empty and nothing was typed.
  - The search box compares a text of only spaces as no text when it decides whether the address
    changed from outside, so clearing the address of a spaces-only text does not wipe the box.
  - The strip caption is built from "Deleted" (when on), the tab word and the fixed ending, and its
    first letter is capitalised.
  - The e2e fixture also returns `vendorUuid`, `zones` and the notes of the two repairs; the
    helper `bleacherQuery` takes one uuid or a list; the helpers `legacyBleacherQuery`,
    `filterButton`, `filterList`, `searchBox`, `toggleOption`, `sortButton` and `columnHeader` are new.
- **Not verified.**
  - **The browser check was not done (D79).** The Browser pane cannot run PowerSync. So the dropdowns
    (position, focus, scroll, the badge and the outline), the ✕ and the 300 ms pause of the search
    box, the sort buttons next to the sticky first column, the writes to the address with
    `router.replace`, and the filters over the 151 old repairs have not been seen. From spec 04 the
    sticky column, the hover colour, the centring of the empty and loading blocks and the first run
    of `useRepairList` on real data are also still unseen.
  - The pause, the clearing, the opening of a dropdown and the `router.replace` writes are effects
    or clicks that Vitest cannot run (no jsdom). Only the e2e scenarios cover them, and those were not
    run. The four new queries were run on an in-memory SQLite shaped like the local database, not on
    PowerSync.
  - The e2e fixture's new zone update was checked against the schema, not executed.
- **Not done.** Nothing is committed.
