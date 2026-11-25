# Repairs 06: the expanded row, the service window and the damage report window (view)

Status: **APPROVED and IMPLEMENTED 2026-11-19**, uncommitted (0 open decisions; D80 to D93 were
taken by the user in four question batches; the "Approved" covered the changed rules and props of
specs 04 and 05 listed in §3; the results are in §11; the browser check was not done). Build order:
**06 of 11**.
Needs: [repairs-01-design.md](repairs-01-design.md), [repairs-02-sync-rules.md](repairs-02-sync-rules.md),
[repairs-03-list-query.md](repairs-03-list-query.md), [repairs-04-table.md](repairs-04-table.md) and
[repairs-05-toolbar.md](repairs-05-toolbar.md) (all done and committed: 04 is 5280565b, 05 is
9567144a). Needed by: 07 and the specs after it. Plan: [repairs-plan.md](repairs-plan.md). Branch:
`q4-sprint4-maintenance`.
Scope: **what a repair row does when it is clicked, and what opens from it, read-only: the arrow
and the expanded block with the table of services, the service window, and the window that shows
the damage reports found for a repair or for a service. It changes the props of the table that
specs 04 and 05 locked, and three rules of spec 04 (D40, D43, D45); §3 lists every one, and the
"Approved" of this spec approves them.** No migration, no sync change, no change to the list
query, to `useRepairList`, to the locked types of spec 03 or to the address of the page: the
state of this spec lives in React (D81, D85).

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

**Decisions of spec 05 (done, user, 2026-11-19; six question batches).**

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

**Decisions of this spec (user, 2026-11-19; four question batches).**

- **D80 (opening a repair):** a click anywhere on a row, and the arrow button at the left of its
  first column, open or close the block under the row, as the canvas does. A click on the
  Reported link of the row (D87) and on Restore in the Show Deleted view does not toggle the row.
  For the table this replaces D40 (a click on a row does nothing).
- **D81 (where the open state lives):** only in the memory of the page (React), not in the
  address. `RepairsUrlState` and its functions stay as spec 05 locked them. A reload or a new
  visit closes every row. Several rows can be open at once (D2).
- **D82 (when open rows close):** on any change of the list state in the address: the tab, the
  page, the page size, the search, a filter, the sort or Show Deleted. A change of the data (a
  row arriving from sync) does not close anything.
- **D83 (a repair with no services):** its row has the arrow and opens like any other. The block
  holds the text "No services on this repair." (D30 said "an empty expanded block with Add
  service"; Add service is not drawn, D84.)
- **D84 (buttons not drawn):** the canvas's Add service (under the services), Open repair, Edit
  and Delete (in the service window) are not drawn until their specs: Open repair in spec 07, the
  others in spec 09. The service window has only its close cross and no footer. This is the rule
  of D43.
- **D85 (where the service window lives):** only in the memory of the page (React), not in the
  address. A reload closes it, Back leaves the page, and a service has no link.
- **D86 (the type of a bleacher):** the name of the bleacher type as stored, for example
  "7-Row, 100/150 Seat - Includes Delivery & Setup / Teardown", and not the number of rows. The
  canvas's "4 Row" was a made-up sample.
- **D87 (what opens a damage report):** a new window on the Repairs page, read-only, that lists
  damage reports. The Reported date of a row (when at least one report was found) and the button
  View Damage Report of the service window open it; from the service window it opens over it.
  The Damage Reports page is not changed. For the Reported cell this replaces D45 (plain text,
  no link).
- **D88 (Model number):** shown in the bleacher card, as a dash while it is empty. It is empty on
  all 147 live bleachers of the local data, and nothing in the app fills it yet (the fields of the
  Assets page are outside this series).
- **D89 (a service deleted on its own):** a deleted repair shows all its services in the Show
  Deleted view (D34). A service whose own flag `deleted` is set gets a small grey mark "Deleted",
  in the table of services and in its window. No other service is marked.
- **D90 (the browser check):** skipped, as in specs 04 and 05. The Browser pane cannot run
  PowerSync, and the running local PowerSync still has the old sync rules, so no service reaches
  the device. The report lists what nobody has seen.
- **D91 (what a damage report shows):** besides the day it was created (the Reported day): who
  created it, the damage levels (Seat and Haul) and the note, the photos, and the state (when it
  was resolved, the confirmations of other drivers, the "fixed by driver" mark).
- **D92 (several reports):** one window lists every report found, earliest first, each in its own
  card; the window scrolls. The Reported date of a row opens the reports of the repair; View
  Damage Report in a service window opens the reports of that service. The button reads "View
  Damage Reports (N)" when N is more than one.
- **D93 (e2e):** the full set for the administrator and one scenario each for the account
  manager, the viewer and the maintainer (S21 to S27). Written, not run.

**What follows from the design and from earlier decisions (no new decision).** Each item names its
source, so a reviewer can check it. An item that starts with "Chosen by me" is a detail the
decisions leave open and nobody was asked; it is listed so it can be vetoed.

- **The block** (D3, the canvas): a white card under the row with the table of services: Bleacher,
  Category, Severity, Reported, Description, Labor, Parts, Tax, Freight, Total, and a chevron at
  the end of each row. No total row (the canvas has none). The services come in the order of
  spec 03 §2.2 (`created_at`, then id) and are the services the list query returned (D34).
- **A service's amounts** (spec 03 §2.3, the canvas rule "a zero is $0.00"): the four amounts and
  the total of a service are written with the currency of the repair, with `formatRepairMoney`.
  Chosen by me: the amounts of a service cannot be empty (the columns are `not null default 0`),
  so a dash never appears in the table of services and a zero shows as `$0.00`.
- **A service's Reported** (D38, spec 03 §2.6 "Per service"): the first day and `+N`, plain text,
  as `reportedCell` writes it. The row is already the click target for the service window, so
  there is no link inside it; the window has the button (D87).
- **A service with no category** (spec 03 §4: `damageCategoryUuid` may be null). Chosen by me: the
  Category cell shows a grey dash and the window title leaves the category out.
- **The service window** (D4, the canvas `ServiceModal`, D84, D86, D88): 760 px wide on the app's
  `Dialog`; the header "Service" with the title, the repair strip (vendor, invoice number,
  status, currency), the body with the fields of the service and the amounts at the right, and
  the bleacher card (number, model number, type, zone). It closes with its cross, with Esc and
  with a click on the dimmed page. No footer.
- **The zone in the bleacher card** (D4, the canvas): the current zone of the bleacher
  (`Bleachers.zone_uuid`), since the card is titled "Bleacher"; it can differ from the zone of the
  repair (D33).
- **The asset value is never read** (maintenance-01: `asset_value_cents` is not shown anywhere):
  the card's query lists its columns and never selects it.
- **The damage report window** (D87, D91, D92): it opens over the service window when it comes
  from there, and Esc closes only the window on top. Photos are read the way the Damage Reports
  page reads them: the path in `DamageReportPhotos` and the public URL of the bucket
  `damage-report-photos`; a click on a photo opens the full picture in a new tab.
- **Dates in the report window** (D37): the day of a resolve, of a confirmation and of the "fixed
  by driver" mark is the day in the app time zone, as every other day on the page. Chosen by me:
  this is why the page does not reuse `describeFixedMark` of the Damage Reports page, which
  writes the browser's local date.
- **The "fixed by driver" mark** (the Damage Reports modal): shown only while the report is not
  resolved, since a resolved report no longer waits for anything.
- **A deleted repair** (D34, D89): in the Show Deleted view its rows open, its service windows
  open and its reports open in the same read-only way as for a live repair.
- **Restore** (spec 04 D41, D67): the button stops the click, so Restore does not also open or
  close the row.
- **The window follows the data.** Chosen by me: a window is found again in the list on every
  render, so it shows the newest values, and it is not drawn when its service is no longer in the
  list (the address changed to another view, or the service was deleted elsewhere).
- **Keyboard and screen reader** (the canvas): the arrow is a button with `aria-expanded`,
  `aria-controls` and a label such as "Expand repair JJ-5". Chosen by me: a service row is a row
  with `tabIndex` 0 that opens on a click, Enter or Space and carries the canvas label "Open
  service: bleacher 26, Welding"; the block is a table named "Services of repair JJ-5".
- **Text selection.** Chosen by me: a drag that selects text in a row still ends in a click and
  toggles the row; no guard is added.
- **A repair of the junction without a number**: its chip is `#?`, as in spec 04.
- **Loading** (spec 04 D51): the table is not drawn while the list loads, so no row and no window
  can be open then. The bleacher card shows dashes until its query answers, and the report window
  says "Loading..." until its queries answer.
- **The permissions matrix** (CLAUDE.md, §5): no role gains any data; one sentence is added to the
  row "Repair Costs & Vendors".

## 1. What the code has today (researched 2026-11-19)

- **The table (specs 04 and 05).** `RepairsTable` draws a header row and one `role="row"` div per
  repair with `data-testid="repair-row"`, a CSS grid of 17 columns (the first sticky), inside a
  box that scrolls sideways and is a container (`[container-type:inline-size]`, so `100cqw` is the
  box's width; the empty and loading blocks use it). A row has no click, no arrow and no button
  except Restore in the Show Deleted view (D40, D43). The Reported cell is `reportedCell` as plain
  text (D45). The props are `rows`, `isLoading`, `showRestore`, `onRestore`, `sort`, `onSort`.
- **The page.** `RepairsPage` reads its whole state from the address (`readRepairsUrlState`),
  takes the full list from `useRepairList({ showDeleted, timezone })`, builds the view with
  `buildRepairsView` and gives `RepairsTable` the rows of one page. It owns no React state.
- **What a row carries (spec 03).** `RepairListRow.services` are `RepairService` rows with
  `bleacherUuid`, `bleacherNumber`, `categoryName`, `severity`, `description`, the four amounts,
  `totalCents`, `deleted`, `createdAt` and `reported` (a `ReportedReport` is an id, a day and the
  stored timestamp). `RepairListRow.reported` holds every report found for the repair.
- **The pieces to reuse.** `BleacherChip`, `CategoryChip`, `SeverityPill` and `StatusPill`
  (`RepairChips.tsx`); `formatRepairMoney`, `formatRepairDay` and `reportedCell`
  (`repairFormat.ts`); `dayInZone` (`dayInZone.ts`); the typed query helpers `useTypedQuery` and
  `expect`; `Dialog`, `DialogContent`, `DialogHeader`, `DialogTitle` and `DialogDescription`
  (`src/components/ui/dialog.tsx`, Radix; `DialogContent` draws its own close cross and a 512 px
  wide box that a class can widen).
- **The Damage Reports page.** `src/app/damage-reports/page.tsx` lists reports as cards; a click
  on a card opens `DamageReportModal` in its edit form (Save, resolve and photo upload; the
  database is the gate for who may write, and the form is shown to every role that opens the
  page). It has no way to open one report from a link. A card shows the bleacher, the state
  (Open, Resolved, Confirmed by N, Fixed by driver), the creation day and the creator, the Seat
  and Haul levels in green, yellow and red, the note and up to three photos. Photos are public
  URLs of the bucket `damage-report-photos` made with
  `supabase.storage.from(bucket).getPublicUrl(path)` (`useClerkSupabaseClient`). The helper
  `useAcknowledgements(ids)` (`_lib/acknowledgements.ts`) returns the confirmations grouped by
  report with the name of each driver; `effectiveColumnDamage` (`src/lib/damageReportSeverity.ts`)
  turns the stored levels and the old safe flags into none, minor or major.
- **Features import from `src/app`** in this project (`WorkTrackerModal`, `BillOfLadingDocument`,
  `EventInternalChat` and others), so the hook can import `useAcknowledgements` from the Damage
  Reports `_lib`.
- **What every role already receives on the web** (`../br_powersync/config/sync_rules.yaml`, the
  web queries, checked 2026-11-19): `Bleachers`, `BleacherTypes`, `Zones`, `Users`,
  `DamageReports`, `DamageReportPhotos`, `DamageReportAcknowledgements`, `DamageReportCategories`,
  `DamageCategories` and `MaintenanceLineItems` for admin, account manager, viewer and maintainer
  alike. So this spec needs no sync change.
- **The local database (Supabase dev, 2026-11-19, dev data, not production).**
  - Bleachers: 147 live, every one with a type and 145 with a zone; `model_number` is empty on all
    of them and nothing in `src` reads or writes it except `AppSchema.ts`.
  - Bleacher types: 11, named like "4-Row, 20 Seat", "4 Row Trailer" and "7-Row, 100/150 Seat -
    Includes Delivery & Setup / Teardown" (up to 58 characters).
  - Damage reports: 260; every one has a note (up to 491 characters); 75 have no creator; 486
    photos on 254 reports (398 `jpg`, 72 `jpeg`, 16 `heic`); 2 confirmations; none is marked fixed
    by a driver.
  - Reports found by the link of spec 03: 107 live repairs have at least one; 81 have one, 16
    have two, 6 have three and 4 have five or more (up to seven).
  - Services: none, and 151 old repairs without services. The running local PowerSync still has
    the old sync rules, so no service reaches the device whatever the database holds.
- **The matrix.** The row "Repair Costs & Vendors" (read for the four roles) says what the page
  shows and that "The page only reads for now"; the row "Damage Reports" says that all four roles
  can view every report and its details (an account manager and a viewer cannot edit, a
  maintainer and an administrator can).
- **Tests that exist for this page.** `RepairsTable.test.tsx` (two cases of spec 04 are changed
  by this spec: "no row arrow and no clickable row" and "Reported as text, no link"), the three
  `repairsAccess` specs (S10 "a click on a row does nothing" is replaced), the admin specs S1 to
  S19 and the fixture `seedRepairs`. Component tests run in Vitest's node environment with
  `renderToStaticMarkup`: no jsdom, no `renderHook`, and no portal, so a Radix `Dialog` cannot be
  rendered open; the window contents are exported as plain components for that reason.

## 2. The behaviour

### 2.1 The row

- **Structure.** Each repair is a `role="rowgroup"` holding its row and, when it is open, its
  block (§2.2). The border between repairs sits on the group.
- **The first column** (176 px, sticky, as spec 04): 12 px of left padding, the arrow button
  (24 by 24 px, a 16 px chevron that points right and turns down when the row is open, grey
  `#6b7280`), a 6 px gap, then the bleacher chips, which wrap, or a dash. The column keeps its
  width; the chips get 26 px less room than in spec 04.
- **The arrow.** A `button` with `type="button"`, `aria-expanded`, `aria-controls` set to the id of
  the block (`repair-services-` and the repair's id), `data-testid="repair-toggle"` and the label
  "Expand repair JJ-5" or "Collapse repair JJ-5". The name of the repair is `repair` and the
  invoice number when there is one, otherwise `repair of bleacher #52, #53` (the chips of the row,
  `#?` for an unknown number), and just `repair` when there is neither.
- **The click (D80).** The whole row toggles on a click, with `cursor-pointer`. The arrow toggles
  too, and its click does not reach the row, so one click is one toggle. The Reported link and
  Restore stop their clicks.
- **Colours** (the canvas): hover `#f9fafb` as in spec 04; an open row `#f1f6fc`, also on hover.
- **The Reported cell (D87).** With reports: the day is a button drawn as the canvas's link (blue
  `#1d62a3`, underlined, `data-testid="repair-reported-link"`, `title` "Open damage report", or
  "Open damage reports" when N is more than one) and `+N` stays plain grey text next to it; the
  button opens the damage report window with the repair's reports (§2.4). Without reports: a dash,
  as in spec 04. The text of the cell is the same as before, so `${day}+1` still reads as it did.

### 2.2 The block under an open row (D3, D83, D84, D89)

- **The place.** A div under the row, inside the group: `data-testid="repair-services"`, the id
  above, sticky at `left: 0` with the width `100cqw` (so it stays in view while the table scrolls
  sideways, like the empty block), padding 4 px at the top and 16 px at the other three sides.
- **The card.** `role="table"` with the name "Services of repair JJ-5"; a white card with a 1 px
  `#e5e7eb` border, 8 px radius and the canvas's small shadow. It scrolls sideways by itself, since
  its grid needs at least 1,332 px (the fixed columns, the gaps, the padding and 220 px for the
  description) and the box can be narrower.
- **The columns** (the canvas): a grid with 12 px gaps and 16 px of side padding,
  `84px 148px 96px 124px minmax(220px, 1fr) 100px 100px 88px 88px 112px 20px`. The header band is
  `#f9fafb`, 36 px high, with the labels Bleacher, Category, Severity, Reported, Description,
  Labor, Parts, Tax, Freight and Total in the small upper-case style of the table's headers; the
  five money headers are right-aligned and the last cell is empty. No sort and no buttons.
- **A service row.** Minimum 48 px high, a top border, hover `#f9fafb`, `cursor-pointer`. Cells:
  - Bleacher: `BleacherChip` with the service's own bleacher (the junction is not consulted, D29).
  - Category: `CategoryChip`, or a grey dash when the service has no category.
  - Severity: `SeverityPill`.
  - Reported: the first day and `+N` (grey, small) as plain text, or a dash.
  - Description: one line cut with an ellipsis and the full text in `title`; a dash when empty; a
    grey mark "Deleted" (`DeletedBadge`) before the text when `deleted` is set (D89).
  - Labor, Parts, Tax, Freight: `formatRepairMoney` with the repair's currency; Total (the sum of
    the four, `totalCents`) is semibold; all right-aligned with tabular digits.
  - A grey chevron at the end.
- **The service row's behaviour.** `role="row"`, `tabIndex` 0, `data-testid="repair-service-row"`,
  the label "Open service: bleacher 26, Welding" (the category is left out when there is none; the
  bleacher is `?` when the number is unknown). A click, Enter or Space calls
  `onOpenService(repairId, serviceId)`. The click does not reach the repair's row.
- **No services (D83).** The card holds the grey text "No services on this repair."
  (`data-testid="repair-services-empty"`) instead of the table.
- **Not drawn (D84):** Add service, a total row, any edit control.

### 2.3 The service window (D4, D84, D85, D86, D88, D89)

- **The shell.** `Dialog` with `DialogContent` set to `sm:max-w-[760px]`, no padding, no gap,
  `max-h-[90vh] overflow-y-auto`, 12 px radius. The cross in its corner is the one `DialogContent`
  draws. `DialogTitle` is the title; `DialogDescription` is hidden and reads "A service of a
  repair. Read-only."
- **The header.** The small upper-case line "Service" and the title. The title is the category
  name and "Bleacher #26" joined with " · " ("Welding · Bleacher #26"); with no category it is just
  "Bleacher #26"; an unknown number is `#?`. A `DeletedBadge` follows the title when the service is
  deleted (D89).
- **The repair strip** (a `#f9fafb` band between two borders): the small label "Repair", the
  vendor's name (medium weight) or a grey dash, a dot, the invoice number or a grey dash, the
  `StatusPill`, and the currency as a neutral chip ("USD" or "CAD"). No Open repair button (D84).
  `data-testid="service-window-repair"`.
- **The body** (two columns, the second 264 px wide, as the canvas):
  - At the left, a list with a 96 px label column: **Bleacher** (`BleacherChip`), **Category**
    (`CategoryChip` or a dash), **Severity** (`SeverityPill`), **Reported**, **Description** (the
    whole text, line breaks kept; a dash when empty).
  - **Reported:** a dash when the service has no report. Otherwise the first day, `+N` when more
    reports fit, and the button (`data-testid="service-window-reports"`, a red warning-triangle
    icon and the canvas's red-brown text): "View Damage Report", or "View Damage Reports (N)" when
    N is more than one (D92). It calls `onOpenReports`.
  - At the right, a `#f9fafb` box with Labor, Parts, Tax, Freight, a rule, and Total (semibold),
    in the repair's currency.
- **The bleacher card** (`data-testid="service-window-bleacher"`): a bordered box titled
  "Bleacher" with four cells: **Number** (`#26`, from the service), **Model number**, **Type**
  and **Zone**. Model number is `Bleachers.model_number`, Type is `BleacherTypes.name` (D86) and
  Zone is the name of the bleacher's zone; each is a grey dash when empty, and all three are
  dashes while the query is loading or when the bleacher is not on the device. The query never
  selects the asset value.
- **No footer (D84).** The window closes with the cross, with Esc and with a click on the dimmed
  page.
- **The content is a plain component** (`ServiceWindowContent`), so a test can render it; the
  shell wraps it and holds the hook.

### 2.4 The damage report window (D87, D91, D92)

- **The shell.** `Dialog` with `DialogContent` set to `sm:max-w-[640px]`, `max-h-[90vh]` and
  `overflow-y-auto`. The title is "Damage report" for one report and "Damage reports (N)" for
  several; `DialogDescription` is hidden and reads "Damage reports found for this repair or
  service. Read-only." When it opens from the service window it is a second dialog on top of the
  first (the later one is above on the same layer); Esc or its cross close only it and the service
  window stays.
- **What is listed.** The reports it was opened with (`ReportedReport`: id and day, earliest
  first, as spec 03 gives them). A report whose details are not on the device (not synced, or
  deleted since) is left out. When none is left the window says "The damage reports are not on this
  device yet." While the queries load it says "Loading...".
- **A card** (`data-testid="damage-report-card"`; a border, 8 px radius, 16 px padding, 12 px
  between cards). From the top:
  - A line with `BleacherChip` of the report's bleacher, "Reported 2026-09-17" (the report's day,
    the Reported day of the table) and "by Jane Doe" when the creator is known (75 of the 260
    local reports have none, and then nothing is written).
  - The state at the right of that line: a pill "Open" (red) or "Resolved 2026-09-19" (green, the
    resolve day).
  - "Seat: minor" and "Haul: none", each word in the colour the Damage Reports page uses (none
    green, minor yellow, major red).
  - The note, line breaks kept, when there is one.
  - The photos, when there are any: 64 px thumbnails (`object-cover`, rounded, a 1 px border),
    each a link that opens the full picture in a new tab. A path whose extension is not an image
    one (`jpg`, `jpeg`, `png`, `heic`, `heif`, `webp`) shows its file name as a link instead of a
    thumbnail. Until the storage client is ready a grey placeholder stands in for a thumbnail.
  - The confirmations, when there are any: "Confirmed by 2 drivers" and one line per driver with
    the name, the day and " · during an inspection" when it was made in one.
  - The "fixed by driver" line ("Fixed by Sam on 2026-09-17", or "Fixed by a driver"), only while
    the report is not resolved.
- **Read-only.** No edit, resolve, delete or upload control anywhere in the window.
- **The content is a plain component** (`DamageReportsContent`), which takes the report views and
  a function that turns a photo path into its public URL, so a test can render it.

### 2.5 How the page is put together

```
const listKey = repairsListKey(urlState);                       // D82
const [expansion, setExpansion] = useState(NO_EXPANSION);
const expandedIds = openRepairIds(expansion, listKey);          // empty after a change of the key
const toggle = (id) => setExpansion(toggleRepair(expansion, listKey, id));
const [serviceRef, setServiceRef] = useState<ServiceRef | null>(null);
const [reported, setReported] = useState<ReportedReport[] | null>(null);
const target = findService(rows, serviceRef);                   // rows = the whole list of the hook
```

`RepairsTable` gets `expandedIds`, `onToggleRepair`, `onOpenService` and `onOpenReports`. The
page draws `ServiceWindow` when `target` is set, and `DamageReportWindow` when `reported` is set.
Closing a window sets its state to null. A service window whose service is gone from `rows` is
not drawn (and the stored reference is harmless).

## 3. Types and signatures (locked; changing them needs a new "Approved")

The types of spec 03 (`RepairListRow`, `RepairService`, `ReportedReport` and the rest), the
address types of spec 05 (`RepairsUrlState` and its functions), `useRepairList` and the list query
are used as they are. The "Approved" of this spec approves the changes listed here.

**Changed from earlier specs** (each is the old rule and what it becomes):

- **D40 of spec 04** ("a click on a row does nothing") is replaced by D80: a click on a row, and
  the arrow, open and close its block. The row has `cursor-pointer`.
- **D43 of spec 04** ("no expand arrow") loses that clause: the arrow is drawn. Its other clauses
  stay (no button at the end of a row, no New repair, no chevron on the status pill, and the
  last column only for Restore).
- **D45 of spec 04** ("Reported as plain text, no link") is replaced by D87 for the table: the
  day is a link while at least one report was found; `+N` stays text.
- **`RepairsTableProps`** (spec 05) gains `expandedIds`, `onToggleRepair`, `onOpenService` and
  `onOpenReports`.
- **The first cell of a row** (spec 04 §2.2) gains the arrow before the chips, and the row becomes
  a group (a `role="rowgroup"` around the row and its block).
- **The tests that say so:** the `RepairsTable` cases "has no New repair, no row arrow and no
  clickable row" and "writes Reported as the first day as text with +N, and no link" are
  rewritten; S10 of the three `repairsAccess` specs ("a click on a row does nothing") is
  replaced by S27 (§6).

```ts
// src/features/repairs/utils/repairExpand.ts
import type { RepairsUrlState } from "./repairPageState";
export type Expansion = { key: string; ids: readonly string[] };
export const NO_EXPANSION: Expansion; // { key: "", ids: [] }
/** The query string of the owned parameters of the address, `page` included: D82. */
export function repairsListKey(state: RepairsUrlState): string;
/** The open repairs for `key`; empty when the expansion was made under another key. */
export function openRepairIds(expansion: Expansion, key: string): ReadonlySet<string>;
/** Opens a closed repair or closes an open one under `key`; another key starts from empty. */
export function toggleRepair(expansion: Expansion, key: string, repairId: string): Expansion;

// src/features/repairs/utils/repairDetails.ts
import type { AcknowledgementSummary } from "@/app/damage-reports/_lib/acknowledgements";
import type { RepairListRow, RepairService, ReportedReport } from "./repairRows";
export type ServiceRef = { repairId: string; serviceId: string };
export function findService(
  rows: readonly RepairListRow[],
  ref: ServiceRef | null,
): { repair: RepairListRow; service: RepairService } | null;
/** "repair JJ-5", "repair of bleacher #52, #53" or "repair" (aria labels). */
export function repairLabel(row: RepairListRow): string;
/** "Open service: bleacher 26, Welding"; no category: "Open service: bleacher 26". */
export function serviceRowLabel(service: RepairService): string;
/** "Welding · Bleacher #26", "Bleacher #26", "Bleacher #?". */
export function serviceWindowTitle(service: RepairService): string;
/** Null for 0, "View Damage Report" for 1, "View Damage Reports (N)" for N above 1. */
export function reportsButtonLabel(count: number): string | null;
/** "Damage report" for 1 (and 0), "Damage reports (N)" above 1. */
export function reportsWindowTitle(count: number): string;
export type DamageLevel = "none" | "minor" | "major";
export type DamageReportView = {
  id: string;
  bleacherNumber: number | null;
  day: string; // the Reported day of the report
  createdBy: string | null; // "First Last", or null when nobody is known
  seat: DamageLevel;
  haul: DamageLevel;
  note: string | null;
  photos: { id: string; path: string }[];
  resolvedDay: string | null;
  confirmations: { id: string; name: string; day: string | null; duringInspection: boolean }[];
  fixedMark: string | null; // only while not resolved
};
export function buildDamageReportViews(input: {
  reported: readonly ReportedReport[];
  details: readonly RawReportDetailRow[];
  photos: readonly RawReportPhotoRow[];
  acknowledgements: Record<string, AcknowledgementSummary>;
  timezone: string;
}): DamageReportView[]; // in the order of `reported`; a report with no detail row is left out

// src/features/repairs/db/serviceWindowQueries.ts (compiled Kysely queries, no db.fn)
export type RawServiceBleacherRow = {
  id: string;
  bleacherNumber: number | null;
  modelNumber: string | null;
  typeName: string | null;
  zoneName: string | null;
};
export function buildServiceBleacherQuery(
  bleacherUuid: string,
): CompiledQuery<RawServiceBleacherRow>;
export type RawReportDetailRow = {
  id: string;
  bleacherNumber: number | null;
  createdAt: string | null;
  resolvedAt: string | null;
  seatDamage: string | null;
  haulDamage: string | null;
  isSafeToSit: number | null;
  isSafeToHaul: number | null;
  note: string | null;
  creatorFirstName: string | null;
  creatorLastName: string | null;
  fixedByDriver: number | null;
  fixedAt: string | null;
  fixerFirstName: string | null;
  fixerLastName: string | null;
};
export function buildReportDetailsQuery(
  reportIds: readonly string[],
): CompiledQuery<RawReportDetailRow>;
export type RawReportPhotoRow = { id: string; reportId: string | null; path: string | null };
export function buildReportPhotosQuery(
  reportIds: readonly string[],
): CompiledQuery<RawReportPhotoRow>;

// src/features/repairs/hooks/useRepairDetails.ts
export function useServiceBleacher(bleacherUuid: string | null): {
  bleacher: RawServiceBleacherRow | null;
  isLoading: boolean;
};
export function useDamageReportViews(
  reported: readonly ReportedReport[],
  timezone: string,
): { reports: DamageReportView[]; isLoading: boolean };

// src/features/repairs/components/RepairChips.tsx (added)
export function DeletedBadge(): JSX.Element; // the small grey "Deleted" mark (D89)

// src/features/repairs/components/RepairServices.tsx
export type RepairServicesBlockProps = {
  repair: RepairListRow;
  id: string; // the id the arrow points to with aria-controls
  onOpenService: (serviceId: string) => void;
};
export function RepairServicesBlock(props: RepairServicesBlockProps): JSX.Element;

// src/features/repairs/components/ServiceWindow.tsx
export type ServiceWindowContentProps = {
  repair: RepairListRow;
  service: RepairService;
  bleacher: RawServiceBleacherRow | null; // null while loading or when not on the device
  onOpenReports: () => void;
};
export function ServiceWindowContent(props: ServiceWindowContentProps): JSX.Element;
export type ServiceWindowProps = {
  repair: RepairListRow;
  service: RepairService;
  onOpenReports: () => void;
  onClose: () => void;
};
export function ServiceWindow(props: ServiceWindowProps): JSX.Element; // the Dialog and the hook

// src/features/repairs/components/DamageReportWindow.tsx
export type DamageReportsContentProps = {
  reports: DamageReportView[];
  isLoading: boolean;
  photoUrl: (path: string) => string | null; // null until the storage client is ready
};
export function DamageReportsContent(props: DamageReportsContentProps): JSX.Element;
export type DamageReportWindowProps = {
  reported: readonly ReportedReport[];
  onClose: () => void;
};
export function DamageReportWindow(props: DamageReportWindowProps): JSX.Element;

// src/features/repairs/components/RepairsTable.tsx
export type RepairsTableProps = {
  rows: RepairListRow[]; // the rows of the page shown
  isLoading: boolean;
  showRestore: boolean;
  onRestore: (repairId: string) => void;
  sort: RepairSort | null;
  onSort: (key: RepairSortKey) => void;
  expandedIds: ReadonlySet<string>; // new: the repairs whose block is open
  onToggleRepair: (repairId: string) => void; // new
  onOpenService: (repairId: string, serviceId: string) => void; // new
  onOpenReports: (reported: ReportedReport[]) => void; // new: the Reported link of a row
};
```

Test hooks for e2e: `data-testid` `repair-toggle`, `repair-reported-link`, `repair-services`,
`repair-services-empty`, `repair-service-row`, `service-window`, `service-window-repair`,
`service-window-reports`, `service-window-bleacher`, `damage-report-window` and
`damage-report-card`, plus those of specs 04 and 05. A window is also found by role `dialog`.

## 4. Files

- **New** (`src/features/repairs`), seven counted source files:
  - `components/RepairServices.tsx`, `components/ServiceWindow.tsx`,
    `components/DamageReportWindow.tsx`.
  - `db/serviceWindowQueries.ts`, `hooks/useRepairDetails.ts`.
  - `utils/repairExpand.ts`, `utils/repairDetails.ts`.
- **Changed:** `components/RepairsTable.tsx`, `components/RepairsPage.tsx`,
  `components/RepairChips.tsx`; `src/features/userAccess/permissionPageData.ts` (§5, not counted).
- **Not touched:** `useRepairList` and the list query, `repairRows.ts` and the locked types of
  spec 03, `repairPageState.ts` and the address, `repairFormat.ts`, `Pagination`, the Damage
  Reports page and its modal, `MaintenanceEventForm`, the Dashboard, `AppSchema.ts`, the sync
  rules.

That is ten counted files (seven new, three changed); tests, the matrix and the e2e files do not
count. The cap of ten holds, exactly.

## 5. The permissions matrix (`permissionPageData.ts`, same commit)

**Checked, no role gains data.** Every web stream of admin, account manager, viewer and
maintainer already carries what the new views read: `Bleachers` (the number, `model_number`,
`bleacher_type_uuid` and `zone_uuid`), `BleacherTypes`, `Zones`, `Users` (the names),
`DamageReports`, `DamageReportPhotos`, `DamageReportAcknowledgements` and `MaintenanceLineItems`.
The row "Damage Reports" already lets all four roles view every report with its details, and the row "Bleachers"
lets them read every bleacher. The windows are read-only for everyone, so no write changes.
`model_number` has been readable by those roles on the device since maintenance-01, but this
window is the first place that shows it. The asset value is not shown (§2.3).

**One edit** in the row "Repair Costs & Vendors", the description. Its last sentence, "The page
only reads for now.", is preceded by two new sentences:

- "A repair opens in place to show its services, one row for each bleacher and category with its
  amounts."
- "A service opens in a window with the bleacher's number, model number, type and zone, and with
  the damage reports it came from: who reported the damage, the damage levels, the note, the
  photos and whether it was resolved."

The notes of the roles stay as they are: "Every role that opens the Repairs page sees all of it"
already covers the four of them. `permissionPageData.test.ts` gets a case for the two sentences.

## 6. Behaviour scenarios (Playwright, written and not run)

The fixture `seedRepairs` of specs 04 and 05 is used. It gets these additions: bleacher A gets a
`model_number` and the first existing bleacher type (the fixture returns both, the type's name
may be null when the database has no type); the first damage report gets one `DamageReportPhotos`
row whose path is made from the suffix (the picture does not exist in storage; the link is what
is tested); a second deleted repair on bleacher A with its own invoice number and two services,
one live (Tires) and one with `deleted` true (Welding). The fixture returns the new values and its
cleanup removes the new rows. The helpers get `serviceRows`, `toggleOf` and `windowOf`. The
scenarios that need a zone or a type skip that assertion when the fixture has none.

**Changes to the scenarios of earlier specs:** S8 still reads `${day}+1`, and its "no `a` in the
cell" check stays true (the day is a `button`); S10 of the account manager, the viewer and the
maintainer drops "a click on a row does nothing" (replaced by S27) and keeps "there is no
Restore".

Administrator (`repairsServices.admin.spec.ts`):

- **S21:** a click on a repair row opens its block and the arrow shows `aria-expanded="true"`; a
  second click closes it; the arrow button does the same; two rows can be open at once. The
  completed repair's block lists its two services (Tires, Welding) with chips, the Reported day,
  the four amounts and the total of each, in that order; a repair with no services (one of the 26)
  says "No services on this repair."; Add service, Edit and Delete are nowhere on the page.
- **S22:** with two rows open, each change closes them all: the other tab, the page size, a
  search text, a filter, a sort click and Show Deleted; an open row stays open when only the data
  changes (a reload of the same address closes it, since the state is in memory).
- **S23:** a click on a service row opens the service window: the title "Tires · Bleacher #N", the
  repair strip with the vendor, the invoice number, the Completed pill and USD, the fields and
  the amounts of that service, and the bleacher card with the number, the model number, the type
  and the zone (the last two when the fixture has them). The window has no Edit, Delete or Open
  repair button. Esc closes it; so does the cross; so does a click on the dimmed page; the row
  under it is still open.
- **S24:** the Reported day of the completed repair is a button; a click on it opens the damage
  report window with two cards, the earlier day first, each with the note, "Seat: minor", "Haul:
  none" and "Resolved"; the first card has the photo link; the row did not toggle. Esc closes the
  window. The CAD repair's Reported opens one card and the window title reads "Damage report".
- **S25:** in the service window of the completed repair the button reads "View Damage Reports
  (2)"; a click opens the report window over it; Esc closes only the report window and the
  service window stays; in the CAD repair's service window the button reads "View Damage Report".
- **S26:** with `?showDeleted=1` the second deleted repair opens and shows two services, and only
  the removed one carries the "Deleted" mark, in the table and in its window; a click on Restore
  restores the repair and does not open it.

Account manager, viewer and maintainer (a test added to each `repairsAccess.<role>.spec.ts`):

- **S27:** a click on the completed repair's row opens its block, a click on a service row opens
  the service window with the vendor, the invoice number and the bleacher card, and "View Damage
  Report" opens the damage report window with the note; there is no Edit, Delete or Open repair.

## 7. Tests (Vitest, written first)

- **`repairExpand.test.ts`.**
  - `repairsListKey`: the same state gives the same key; a change of the tab, the page, the page
    size, the search, each of the four lists, the sort or Show Deleted changes it; a parameter the
    page does not own cannot (the key is built from the owned state only).
  - `toggleRepair`: opens a closed repair and closes an open one; several repairs stay open
    together; a toggle under another key starts again from empty; the input is not changed.
  - `openRepairIds`: the ids under the same key; empty under another key and for `NO_EXPANSION`.
- **`repairDetails.test.ts`.**
  - `findService`: finds the repair and the service; null for a missing repair, a missing service
    and a null reference.
  - Labels and titles: `repairLabel` (invoice, bleachers with `#?`, neither), `serviceRowLabel` and
    `serviceWindowTitle` with and without a category and with an unknown number,
    `reportsButtonLabel` for 0, 1 and 3, `reportsWindowTitle` for 1 and 3.
  - `buildDamageReportViews`: the order follows `reported`; a report with no detail row is left
    out; levels come from `effectiveColumnDamage` (the old safe flag makes major); the creator's
    name is trimmed and null when empty; the photos of each report; the resolve day and the day of
    each confirmation are in the given time zone; `duringInspection` follows the source; the
    fixed mark is written with a name or as "a driver" and is null for a resolved report.
- **`serviceWindowQueries.test.ts`** (the SQLite harness through the bound proxy of the Audit
  tests). The bleacher query returns the number, model number, type name and zone name, and
  nothing for the asset value (the compiled text does not contain `asset_value`); a bleacher with
  no type or zone comes back with nulls; the details query returns the creator and fixer names and
  leaves a deleted report out; the photos query returns the rows of the given reports only; none
  of them uses `db.fn`; an empty list of ids matches nothing.
- **`RepairServices.test.tsx`.** The ten headers; one row per service in the order given, each
  with the label of `serviceRowLabel`; the chips, the pills, the day with `+N`, the amounts with
  `$` or `C$` and a zero as `$0.00`; a service with no category shows a dash; a deleted service
  shows the "Deleted" mark and the others do not; a long description is cut and carries its
  `title`; no services shows "No services on this repair."; no Add service.
- **`ServiceWindow.test.tsx`** (the content). The title; the strip with the vendor, the invoice
  number, the status pill and the currency, and dashes when they are empty; the fields and the
  amounts with the repair's currency; the Reported line with the button label for 0 (a dash, no
  button), 1 and several; the bleacher card with the number, the model number, the type name and
  the zone, with dashes when the bleacher is null; the "Deleted" mark; no Edit, Delete or Open
  repair button.
- **`DamageReportWindow.test.tsx`** (the content). One card per report with the bleacher, the
  Reported day and the creator (no "by" when null); the state pill; the Seat and Haul words; the
  note; a photo link to the URL the function returns; a placeholder when it returns null; a file
  name instead of a thumbnail for a path that is not an image; the confirmations; the fixed line;
  "Loading..." and the "not on this device yet" message; no button.
- **`RepairsTable.test.tsx`** (changed). Each row has the arrow with `aria-expanded` false or true
  and the right label; the first cell keeps the chips; an open repair has its block after its row
  and a closed one does not; the open row has the tinted background; the Reported cell is a button
  with the title for one and for several reports, `+N` is plain text, and a repair without reports
  has a dash; Restore stops the click (the handler is on the button); the rest of the cases of
  specs 04 and 05.
- **`permissionPageData.test.ts`.** The two new sentences of §5.
- **A mutation check.** Three rules are broken one at a time (a change of the page no longer
  changes the key of `repairsListKey`; `buildDamageReportViews` follows the order of the detail
  rows and not of `reported`; the bleacher query selects `asset_value_cents`) and the tests must
  fail each time.
- **Not unit-tested, by project limits:** the click on a row and on the arrow, the keyboard on a
  service row, the opening and closing of a Radix dialog, the second dialog over the first, the
  loading of a photo and the hooks (an effect or a click: Vitest has no jsdom, no portal and no
  `renderHook`). They are covered by the e2e scenarios, which are written and not run.

## 8. Edge cases and errors

- **Offline (PowerSync).** Every read is local, so rows, blocks, windows and the text of a report
  work offline. A photo is loaded from the storage and needs a network; offline its thumbnail
  stays broken or empty. There is no write.
- **Clerk and auth.** The windows make no call of their own; the photo URL is built by the
  storage client of `useClerkSupabaseClient`, and until it is ready a placeholder is drawn.
- **A service the bleacher card cannot find** (the bleacher is not on the device): dashes, and the
  number from the service stays.
- **A found report that is gone** (deleted since, or not synced): left out of the window; if none
  is left the window says so.
- **A service deleted or the view changed while its window is open:** the window is not drawn when
  the service is no longer in the list; it follows new values while it is.
- **Show Deleted:** the same read-only behaviour for the deleted repairs; a service deleted on its
  own carries the "Deleted" mark; in the normal view such a service is not listed at all (D34).
- **Several zones or no zone on the repair:** the repair's row is as in spec 04; the window shows
  the zone of the bleacher only.
- **Many services:** the block grows with them; the page scrolls.
- **A narrow box:** the card scrolls sideways under 1,332 px; the window is capped at the width
  of the screen by `DialogContent`.
- **Esc:** closes the window on top only; a Radix dialog does this on its own.
- **Several rows open and the list changes underneath** (a sync adds a repair): they stay open
  (D82 reacts to the address only).
- **A drag that selects text** in a row toggles it.
- **Not seen in a browser** (D90): the arrow and the open colour next to the sticky column, the
  card's sideways scroll, the second dialog over the first (the layers), the focus after a window
  closes, the photos and the sticky block under a scrolled table; see §10.
- **E2E needs the sync rules of spec 02** (services, categories and reports reach the test user),
  as in specs 04 and 05.

## 9. Not in this spec

- **Add service, Edit, Delete and Restore of a service (09); the Open repair button and the repair
  window (07); the button at the end of a row (07).**
- **The status menu (08); editing a damage report from this page; a link to one report on the
  Damage Reports page; the expanded state in the address; a link to a service.**
- **A total row in the block; sort or filter of the services; the descriptions of the services in
  the search (spec 05 D57).**
- **Filling `model_number` (the Assets page, outside this series); any change to the list query, to
  `useRepairList`, to the sync rules, to the Damage Reports page, to the Dashboard (11) or to the
  mobile app.**

## 10. Definition of done

- `npm run tc` and `npx vitest run`, each with the real output and the exit code.
- `npx prettier --check` on the files this spec touches only (the repo-wide `npm run lint` is red
  at baseline).
- Playwright E2E: written (§6) and **SKIPPED** (the user's rule is not to run it; the admin
  project cannot run locally).
- **The browser check: SKIPPED (D90).** The Browser pane cannot run PowerSync, the running local
  PowerSync has the old sync rules, and the user chose to skip it. The report lists what nobody has
  seen in a browser: from spec 04 the sticky first column, the hover colour, the centring of the
  empty and loading blocks, the `router.replace` writes and the first run of `useRepairList` on
  real data; from spec 05 the dropdowns, the search box, the sort buttons and the filters; from
  this spec the arrow and the open colour, the sticky block, the sideways scroll of the card, both
  windows (size, scroll, layers, focus), the photos, and the bleacher card on real data.
- A mutation check of three rules (§7), each broken and restored byte for byte.
- No change outside `src/features/repairs`, `permissionPageData.ts` (and its test) and
  `docs/specs`.

## 11. Result (2026-11-19)

- **Implemented:** the ten counted files of §4 (new: `RepairServices`, `ServiceWindow`,
  `DamageReportWindow`, `serviceWindowQueries`, `useRepairDetails`, `repairExpand`,
  `repairDetails`; changed: `RepairsTable`, `RepairsPage`, `RepairChips`) and the matrix edit of §5.
  Tests: new `repairExpand.test.ts` (14), `repairDetails.test.ts` (19),
  `serviceWindowQueries.test.ts` (10), `RepairServices.test.tsx` (20), `ServiceWindow.test.tsx` (19)
  and `DamageReportWindow.test.tsx` (17); changed `RepairsTable.test.tsx` (27 to 42) and
  `permissionPageData.test.ts` (two new cases, one old case split). E2E: the new
  `repairsServices.admin.spec.ts` (S21 to S26), the helper `serviceFlow.ts` (S27) and S27 added to
  the three `repairsAccess` specs, the fixture and the helpers extended.
- **Tests first:** the new and changed tests were written before the code. The first run was red:
  8 of 20 files failed (14 failing tests; six files could not load their module because it did not
  exist yet: `repairExpand`, `repairDetails`, `serviceWindowQueries`, `RepairServices`,
  `ServiceWindow`, `DamageReportWindow`; `RepairsTable` failed 13 tests and the matrix test 1).
- **Checks.**
  - `npm run tc`: exit 0 (the e2e files are type-checked too).
  - `npx vitest run`: exit 0, 561 files and 8231 tests (before: 555 and 8115, so +6 files and +116
    tests).
  - `npx prettier --check` on every file this spec touches: clean.
  - Playwright: SKIPPED. The specs are written and were not run (the user's rule; the admin
    project cannot run locally either).
  - Browser check: SKIPPED (D90).
- **Mutation check.** Three rules were broken one at a time (`repairsListKey` ignored the page; the
  report views followed the order of the detail rows and not of `reported`; the bleacher query also
  selected `asset_value_cents`). The tests failed each time (4, 1 and 3 failing tests) and the three
  files were restored byte for byte (checked with `shasum`).
- **What differs from the text above.**
  - `ServiceWindowContent` takes one more, optional prop, `Title` (the element the title is drawn
    with, `h2` by default). The dialog passes its own `DialogTitle`, which cannot be rendered outside
    a dialog, so the content stays testable.
  - `repairExpand.ts` exports one more function, `reconcileExpansion`. The page calls it while it
    renders and forgets the open repairs as soon as the list key changes, so coming back to the
    first view does not bring them back (D82). §2.5 shows only the derived form, which would have
    brought them back.
  - The test support file `repairRowFixture.ts` gets `repairService`.
  - Attributes that only the tests and e2e use: `data-col` of the service cells (`service-bleacher`,
    `service-labor` and so on), `data-field` on the fields of the service window, `data-amount` on
    its amounts and `data-card` on the cells of the bleacher card.
  - The queries are written like those of spec 04 and 05: they return the compiled query of Kysely,
    and the hooks tie it to its row type with `expect<T>()`, so §3 shows the row types and not a
    `CompiledQuery` signature.
  - `DamageReportWindow` builds the photo URL straight from the storage client of
    `useClerkSupabaseClient`, which always exists, so the placeholder branch ("null until the client
    is ready") is only drawn by the content component when it is given null.
  - A service row and the services block do not stop the click: the repair's row is not their
    parent, so a click in them cannot reach it.
  - The two matrix sentences are not next to the old last sentence in the old test of spec 05: its
    regular expression was cut at the end of the vendor sentence.
  - "Restore stops the click" (§7) is not unit-tested: the handler is not in static markup. Only S26
    covers it, and S26 can only show that the other open block and the page are undisturbed.
- **Not verified.**
  - **The browser check was not done (D90).** The Browser pane cannot run PowerSync, and the running
    local PowerSync still has the old sync rules. So the arrow and the open colour next to the sticky
    first column, the sticky block under a scrolled table, the sideways scroll of the card, both
    windows (size, scroll, layers, focus), the photos and the bleacher card on real data have not
    been seen. From spec 04 the sticky column, the hover colour, the centring of the empty and loading
    blocks and the first run of `useRepairList` on real data are still unseen, and from spec 05 the
    dropdowns, the search box, the sort buttons and the filters.
  - The click on a row and on the arrow, the keys on a service row, the opening and closing of a
    dialog, the second dialog over the first and the loading of a photo are clicks or effects that
    Vitest cannot run (no jsdom, no portal). Only the e2e scenarios cover them, and those were not
    run. The three new queries were run on an in-memory SQLite shaped like the local database, not on
    PowerSync.
  - The e2e fixture's new rows (a model number and a type on bleacher A, a photo row, a deleted
    repair with a service deleted on its own) were checked against the schema, not executed.
- **Not done.** Nothing is committed.
