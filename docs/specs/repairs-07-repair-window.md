# Repairs 07: the repair window (view)

Status: **APPROVED and IMPLEMENTED 2026-11-20**, uncommitted (0 open decisions; D94 to D109 were
taken by the user in four question batches; the results are in §11; the browser check was not
done). Build order: **07 of 11**.
Needs: [repairs-01-design.md](repairs-01-design.md), [repairs-02-sync-rules.md](repairs-02-sync-rules.md),
[repairs-03-list-query.md](repairs-03-list-query.md), [repairs-04-table.md](repairs-04-table.md),
[repairs-05-toolbar.md](repairs-05-toolbar.md) and
[repairs-06-expanded-row.md](repairs-06-expanded-row.md) (all done and committed: 04 is 5280565b,
05 is 9567144a, 06 is 56f00da2; nothing is pushed). Needed by: 08 and the specs after it. Plan:
[repairs-plan.md](repairs-plan.md). Branch: `q4-sprint4-maintenance`.
Scope: **the repair window, read-only: the button at the end of every row, the window it opens
(the fields of the repair, its services with a Total row, its files) and the Open repair button of
the service window. It changes the props of the table and of the service window that specs 05 and
06 locked, the two pieces of window state of spec 06 (they become one stack of windows) and clauses
of D41, D43 and D84; §3 lists every one, and the "Approved" of this spec approves them.** No
migration, no sync change, no change to the list query, to `useRepairList`, to the locked types of
spec 03 or to the address of the page (D95, D99). The status menu is spec 08; Edit, Delete, Add
service and the upload of files are spec 09.

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

**Decisions of spec 06 (done, user, 2026-11-19; four question batches).**

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

**Decisions of this spec (user, 2026-11-20; four question batches).**

- **D94 (the button at the end of a row):** every row has it, in the Show Deleted view too. It is
  the canvas's small icon button (an arrow leaving a box) in a last column that is now always
  there. In the Show Deleted view the same cell holds Restore beside it, and a deleted repair
  opens in the window like a live one, read-only. For the table this replaces two clauses of D43:
  "no button at the end of the row" and "the last column exists only in the Show Deleted view".
- **D95 (where the window lives):** only in the memory of the page (React), not in the address,
  as the service window (D85). A reload closes it, Back leaves the page, and a repair has no link.
- **D96 (how windows stack):** a new window opens over the one that opened it. Esc, the cross and
  a click on the dimmed page close only the top window and leave the ones under it. From the
  table the deepest case is four: a service window, the repair window over it, a service window
  of that repair, and a damage report window.
- **D97 (the title):** the invoice number and the vendor's name joined by " · " ("DTR-2377 ·
  Dallas Trailer Repair"), as the canvas. When only one of them exists, that one alone, without
  the " · ". When neither exists (all 208 repairs of the local data), the numbers of the
  bleachers: "Bleachers #52, #53".
- **D98 (Open repair in the service window):** the button is drawn in the service window (D84
  held it back until this spec), except when the service window was opened from the repair
  window of the same repair: that repair is already under it, so the button is not drawn there.
- **D99 (where the files come from):** the list is read directly from Supabase, from the table
  `MaintenancePhotos`, as the old Files tab does, and not from the local database. No sync
  change and no `AppSchema.ts` change. The list needs a network; offline the section says so.
- **D100 (the address):** only the address of the vendor, in one line under the vendor's name,
  when the vendor has one. The stored address of the repair itself (33 of the 208 local repairs
  have one) is not shown.
- **D101 (the Total row):** the table of services in the window always ends with a Total row.
  Labor, Parts, Tax and Freight are the sums of the services (dashes when there are none) and
  Total is the total of the repair (`cost_cents`), the same figure as the Total column of the
  page. A repair with no services shows only that Total.
- **D102 (who sees Files):** the database lets only an administrator, an account manager and a
  maintainer read the files table, and for a viewer it answers with an empty list and no error.
  The viewer does not see the Files section at all.
- **D103 (how a file is drawn):** a row as the canvas draws it, named by its type and its order
  of adding: "Photo 1", "Photo 2", "PDF 1", "Word 1", "Excel 1" and so on. At the right the day
  it was added and an open button. The size is not shown (the database does not store it).
- **D104 (opening a file):** a click on the name or on the button opens the file in a new
  browser tab, for every type, as the photos of the damage reports.
- **D105 (a deleted repair):** its window carries the small grey "Deleted" mark beside the
  title, like a service deleted on its own (D89).
- **D106 (the Bleachers field):** besides the fields the canvas draws, the window has a Bleachers
  field with the chips of the repair's bleachers (the junction, as the column of the table).
- **D107 (the Reported field):** the window has a Reported field with the first day, `+N`, and
  the button that opens the damage reports of the repair, as the Reported link of the row.
- **D108 (several zones):** each zone on its own line in the Zone field, as in the table (D46).
- **D109 (e2e):** as in spec 06: the full set for the administrator and one scenario each for the
  account manager, the viewer and the maintainer (S28 to S33). Written, not run.

**What follows from the design and from earlier decisions (no new decision).** Each item names its
source, so a reviewer can check it. The last item is wording and sizes only; it is listed so it can
be corrected, and no behaviour hangs on it.

- **The button's click** (D80, D94): it stops the click, so opening the window does not also open
  or close the block under the row, as the arrow, the Reported link and Restore already do.
- **The button's name** (the canvas's `'Open ' + idLabel`, `repairLabel` of spec 06): the label
  is "Open repair JJ-5", "Open repair of bleacher #52, #53" or "Open repair"; its `title` is
  "Open repair".
- **Windows follow the data** (the rule of spec 06 §2.5): every window is found again in the whole
  list of the hook on every render, so it shows the newest values, and it is not drawn when its
  repair or its service is no longer in the list (Show Deleted flipped by Back, a repair
  restored, a service deleted elsewhere). The windows under it stay.
- **Which windows open which** (D96, D4, D87): a service row (in the block of a row and in the
  table of the repair window) opens a service window; the Open repair button opens the repair
  window; the Reported link of a row, the Reported field of the repair window and View Damage
  Report of a service window open the damage report window. Each opens over the others.
- **Open repair and the stack** (D98): the button is not drawn in a service window when a repair
  window of the same repair is already under it in the stack, which is exactly the case "opened
  from the repair window". A service window under a repair window, opened from the table, still
  has it.
- **A second request for the window already on top** changes nothing (a guard for a double click).
- **The status** (D17, spec 04): a plain pill, with no chevron. The menu is spec 08.
- **Days** (D37, D44): "Created 2026-09-17" and the day a file was added are the day in the app
  time zone; Repair from, Repair to and Completed are written as the table writes them.
- **Completed, Zone, Reported, Bleachers** (D9, D31, D33, D38): the same values as the row, from
  `completedOn`, `zones`, `reported` and `bleachers` of the list row.
- **Notes** (D11): the whole text with its line breaks; a dash when empty.
- **The services** (D34, D89, D4): the services of the list row, in its order. In the Show Deleted
  view all of them, and a service deleted on its own carries the grey "Deleted" mark.
- **A deleted repair** (D34, D94, D105): its window opens, shows its fields, services and (for
  the three roles) files exactly as a live one, plus the mark; nothing is editable.
- **The files section** (D99, D102): it is not drawn for a role that may not read the files, and
  then no request is made. For the other three it is drawn for every repair, live or deleted.
- **A title with one bleacher or none** (D97): one bleacher is "Bleacher #52" (the singular, as
  the title of the service window); a bleacher with no number is `#?`; a repair with no invoice,
  no vendor and no bleacher is titled "Repair".
- **No footer** (the rule of D84): no Edit, no Delete, no Add service and no upload; the window
  closes with its cross, with Esc and with a click on the dimmed page.
- **The permissions matrix** (CLAUDE.md, §5): no role gains any data; two sentences and the role
  notes of "Repair Costs & Vendors" and one sentence of "Repairs & Maintenance" change.
- **Wording and sizes chosen by me** (presentation only): the width of the last column (48 px,
  and 160 px with Restore), the error line of the files ("Files could not be loaded. They need a
  connection."), the file type words (§2.5), the layout of the fields in the grid (§2.3) and the
  test ids.

## 1. What the code has today (researched 2026-11-20)

- **The table (specs 04 to 06).** `RepairsTable` draws a header row and one `role="rowgroup"` per
  repair that holds its `role="row"` (`data-testid="repair-row"`) and, when open, its block. The
  17 columns are a CSS grid; the first is sticky and holds the arrow and the chips. A click on a
  row toggles its block; the Reported day is a button that opens the damage reports; the last
  column exists only in the Show Deleted view and holds Restore (112 px, sticky at the right).
  The props are `rows`, `isLoading`, `showRestore`, `onRestore`, `sort`, `onSort`, `expandedIds`,
  `onToggleRepair`, `onOpenService` and `onOpenReports`.
- **The page.** `RepairsPage` reads its list state from the address, takes the whole list from
  `useRepairList`, and keeps in React the open repairs (an `Expansion`), the service window
  (`serviceRef`) and the damage report window (`reported`). `ServiceWindow` and
  `DamageReportWindow` are drawn at the end of the page.
- **The service window.** `ServiceWindowContent` has a repair strip with the vendor, the invoice
  number, the status pill and the currency, and no button (D84). The canvas draws "Open repair"
  at the right of that strip, a small outlined button with an arrow.
- **What the list row already carries** (`RepairListRow`, spec 03): `createdAt`, `status`,
  `currency`, `invoiceNumber`, `vendorUuid`, `vendorName`, `eventStart`, `eventEnd`,
  `completedOn`, `zones`, `bleachers`, `notes`, `services`, the four sums, `totalCents`
  (`cost_cents`), `reported` and `deleted`. What it does not carry: the vendor's address and the
  files.
- **The vendor's address.** `Vendors.address_uuid` points to `Addresses` (`street`, `city`,
  `state_province`, `zip_postal`, `country`; the country is a code such as `US` or `CA`). The web
  sync rules carry `Vendors` and `Addresses` for the administrator, the account manager, the
  viewer and the maintainer alike (checked 2026-11-20). Locally 0 of 44 vendors have an address,
  and 33 of 208 repairs have their own address.
- **The files.**
  - They are rows of `MaintenancePhotos` (`id`, `maintenance_event_uuid`, `photo_path`,
    `created_at`) and objects of the public bucket `maintenance-photos`; the path is the repair's
    id, a slash, a random id and the extension. The table is not in `AppSchema.ts` and not in the
    sync rules.
  - The database rule on that table (migration `20260923140000`) lets the administrator, the
    account manager and the maintainer read, add, change and delete rows. The viewer's read is
    refused by returning no rows. The storage policy lets any signed-in user read the bucket.
  - The old Files tab of `MaintenanceEventForm`
    (`src/features/maintenanceEvents/components/tabs/FilesTab.tsx`) reads the table with
    `useClerkSupabaseClient` and React Query, and builds the link with
    `storage.from(...).getPublicUrl(path)`. It shows photos as pictures and other files by the
    last part of the path. The table holds no name, size or type.
  - Locally: 76 files on 56 repairs; the extensions are `docx`, `jpeg`, `jpg`, `pdf`, `png` and
    `webp`.
- **The roles.** `useTeamPermissions` gives `isAdmin`, `isAccountManager` (false for an
  administrator) and `isMaintainer`; the viewer is none of the three. `canManageDamageAndMaintenance`
  (administrator or maintainer) decides Show Deleted and Restore.
- **The local database (dev data, 2026-11-20).** 208 repairs, 16 of them deleted; none has an
  invoice number or a vendor, all are named "Maintenance / Repair", all have a junction row and a
  `created_at`; 188 have notes (up to 484 characters); no service exists (the running local
  PowerSync still has the old sync rules, so none would reach the device anyway).
- **The matrix.** "Repair Costs & Vendors" ends with "The page only reads for now."; "Repairs &
  Maintenance" says a repair is edited from the Dashboard "until the repair window arrives".
- **Tests that exist for this page.** The `RepairsTable` cases "has no New repair, no button at the
  end of a row and no chevron on the status pill (D43)", "has no Restore column unless the view
  asks for it" and the Restore column case; `ServiceWindow.test.tsx` ("no Open repair button");
  scenario S23 ("no Open repair button") and the helper of S27 (`readServicesAndReport`, which
  expects no "Open repair"). Component tests run in Vitest's node environment with
  `renderToStaticMarkup`: no jsdom, no `renderHook`, no portal, so a Radix `Dialog` cannot be
  rendered open and the window contents are plain components, as in spec 06.

## 2. The behaviour

### 2.1 The button at the end of a row (D94)

- **The last column** is always there now. Its header cell is empty with the hidden text
  "Actions" (it was drawn only with Restore). It is sticky at the right (`right: 0`), keeps the
  row's background and puts its content at the end. It is 48 px wide, and 160 px in the Show
  Deleted view for an administrator or a maintainer, which adds Restore (112 px) after the button.
- **The button.** A `button` with `type="button"`, `data-testid="repair-open"`, the label "Open
  repair JJ-5" (the name of the repair is `repairLabel`, as for the arrow) and the `title` "Open
  repair". 32 by 32 px, a 1 px `#d1d5db` border, a 6 px radius, a white fill, the icon in
  `#374151` (an arrow leaving a box, 16 px), `#f3f4f6` on hover, the same focus ring as the arrow.
  A click calls `onOpenRepair(row.id)` and stops there: it does not toggle the row.
- **The Show Deleted view** (D94): the cell holds the button and then Restore, side by side.
  Restore keeps its test id, its colours and its click rule (it stops the click).
- **Everything else** in a row stays as spec 06 draws it.

### 2.2 The repair window (D95, D96, D97, D105)

- **The shell.** `Dialog` with `DialogContent` set to `sm:max-w-[1080px]`, no padding, no gap,
  `max-h-[90vh] overflow-y-auto`, a 12 px radius, `data-testid="repair-window"`. The cross in its
  corner is the one `DialogContent` draws. `DialogTitle` is the title; `DialogDescription` is
  hidden and reads "A repair with its services and files. Read-only." Esc, the cross and a click
  on the dimmed page close it; over a service window or a damage report window that stays under
  it, only the top window closes (D96).
- **The header** (the canvas): the small upper-case line "Repair" and the title (D97), with the
  grey `DeletedBadge` after it when the repair is deleted (D105), and under them "Created
  2026-09-17" in 13 px grey, the day of `createdAt` in the app time zone (no line when the repair
  has no creation time). `data-testid="repair-window-title"` wraps the title and the mark.
- **The title** (D97): `invoiceNumber` and `vendorName`, each trimmed, joined by " · "; one alone
  when the other is empty; with neither, the bleachers: "Bleacher #52" for one and "Bleachers #52,
  #53" for several (an unknown number is `#?`); with no bleacher either, "Repair".
- **No footer** (D84). No Edit, no Delete.
- **The window follows the data** (§0, "What follows"): it is drawn from the repair found in the
  whole list on every render.

### 2.3 The fields (D17, D31, D33, D100, D106, D107, D108)

A four-column grid with 24 px between columns and 18 px between rows, 14 px text, each field a
small upper-case label over its value (`data-field` names below). An empty value is a grey dash.

- **Row 1:** **Vendor** (two columns): the name in medium weight, or a dash; under it the address
  in 13 px grey when the vendor has one (D100), nothing otherwise. **Invoice #:** the number in
  tabular digits, or a dash. **Status:** the `StatusPill`, plain.
- **Row 2:** **Currency:** `USD` or `CAD`. **Zone:** each zone of the row on its own line (D108),
  or a dash. **Repair from** and **Repair to:** the days as the table writes them.
- **Row 3:** **Completed:** the day of `completedOn` (D31), or a dash. **Reported** (D107): the
  first day and `+N` as the table's cell writes them, and the button "View Damage Report" or
  "View Damage Reports (N)" (`reportsButtonLabel`) drawn as the service window's button (a red
  warning triangle, red-brown text, `data-testid="repair-window-reports"`); a dash when no report
  was found. **Bleachers** (D106, two columns): one `BleacherChip` per bleacher of the row, or a
  dash.
- **Row 4: Notes** (four columns): the whole text with its line breaks kept, or a dash.
- **The address line** is `city`, `state_province` and `country` of the vendor's address, the
  non-empty ones, trimmed and joined by ", " ("Dallas, TX, US"). The street and the postal code
  are not shown. No line when none of the three exists.

### 2.4 The services and the Total row (D4, D84, D89, D101)

- **The place.** Under the title "Services" (16 px, semibold, navy), a card with a 1 px
  `#e5e7eb` border and an 8 px radius, `role="table"` named "Services of repair JJ-5"
  (`repairLabel`), `data-testid="repair-window-services"`. It scrolls sideways by itself when
  narrower than its grid needs (1,056 px).
- **The columns** (the canvas's window grid), with 8 px gaps and 16 px side padding:
  `76px 120px 84px 108px minmax(120px, 1fr) 88px 88px 72px 72px 100px 16px`. The header band is
  `#f9fafb`, 36 px high, with Bleacher, Category, Severity, Reported, Description, Labor, Parts,
  Tax, Freight and Total (the five money headers right-aligned).
- **A service row** is the row of spec 06 (the same cells, the same label, the same test id
  `repair-service-row`, the "Deleted" mark of a service deleted on its own, a click or Enter or
  Space opens the service window) on the grid above. `RepairServices.tsx` exports the row with
  its grid as a parameter; the block under a table row keeps its own grid and looks.
- **The Total row** (D101): a `#f9fafb` band, 44 px high, a top border, semibold, with the word
  "Total" across the first five columns, then the sums of the services in Labor, Parts, Tax and
  Freight (`row.laborCents` and the others of the list row; a dash when the repair has no visible
  service), and the repair's total (`row.totalCents`, a dash when empty) in navy under Total.
  `data-testid="repair-window-total"`. Money is written with the currency of the repair.
- **No services:** the card keeps its header band, then a 48 px body with the grey text "No
  services on this repair." (`data-testid="repair-services-empty"`, as in the block), then the
  Total row (D83, D101).
- **Not drawn** (D84): Add service, any edit control.

### 2.5 The files (D99, D102, D103, D104)

- **Who and when.** The section "Files" (the same 16 px title) is drawn only when
  `canReadRepairFiles` is true: an administrator, an account manager or a maintainer (D102). For
  the viewer neither the title nor the body exists and nothing is requested. For the other three
  it is drawn for every repair, live or deleted.
- **The read.** One request to Supabase for the open window: `MaintenancePhotos` rows with
  `maintenance_event_uuid` equal to the repair's id, `id`, `photo_path` and `created_at`, earliest
  first. It runs through `useClerkSupabaseClient` and React Query, and starts when the window
  opens. This is the exception to the local-first rule that D99 allows: the table is not synced.
- **The states** (`data-testid="repair-files"` on the section): loading, the grey text
  "Loading..."; failed (offline, a lost session, a refused request), the grey text "Files could
  not be loaded. They need a connection."; no rows, the grey text "No files."; otherwise the list.
- **The list** (the canvas): a card with a 1 px border and an 8 px radius, one row of at least
  48 px for each file, a top border between rows, `data-testid="repair-file"`:
  - a document icon, the name (D103) in `#1d62a3` medium weight as a link, the text "Added
    2026-09-18" in 13 px grey (the day of `created_at` in the app time zone; no text when the
    time is not a date), and a 32 px icon button with the label "Open Photo 1".
  - The name and the button are links to the public URL of the object in the bucket
    `maintenance-photos`, with `target="_blank"` and `rel="noopener noreferrer"` (D104).
- **The names** (D103): by the type of the file, then its number among the files of that type,
  earliest first. The type comes from the extension of the path, in lower case:
  - `jpg`, `jpeg`, `png`, `heic`, `heif`, `webp`: Photo.
  - `pdf`: PDF. `doc`, `docx`: Word. `xls`, `xlsx`: Excel. `txt`: Text. `csv`: CSV.
  - anything else, or no extension: File.
- **Not drawn** (spec 09): the delete button of a file, the drop zone, the size.

### 2.6 The Open repair button of the service window (D84, D98)

- **Where.** At the right end of the repair strip (`margin-left: auto`), the canvas's small
  outlined button: "Open repair" and a small arrow, 32 px high, a 1 px `#d1d5db` border, navy
  semibold text, `data-testid="service-window-open-repair"`.
- **When.** `ServiceWindowContent` draws it only when it is given `onOpenRepair`. The page gives it
  unless a repair window of the same repair is already under that service window (D98).
- **What it does.** It opens the repair window over the service window (D96). Closing the repair
  window shows the service window again.

### 2.7 How the page is put together (D95, D96, D98)

```
const [stack, setStack] = useState<WindowEntry[]>([]);
const windows = resolveWindows(rows, stack);            // rows = the whole list of the hook
const open = (entry: WindowEntry) => setStack(openWindow(stack, entry));
const close = (index: number) => setStack(closeFrom(stack, index));
```

The page draws one window for each resolved entry, in order, so a later one is above an earlier
one: a `RepairWindow` for `repair`, a `ServiceWindow` for `service` (with `onOpenRepair` only when
`showOpenRepair`), a `DamageReportWindow` for `reports`. Every window closes with
`close(its index)`, which removes it and anything above it. `RepairsTable` gets
`onOpenRepair={(repairId) => open({ kind: "repair", repairId })}`, and its `onOpenService` and
`onOpenReports` open a `service` and a `reports` entry the same way. Spec 06's `serviceRef`,
`reported` and `findService(rows, serviceRef)` calls of the page are replaced by this stack;
`findService` stays and `resolveWindows` uses it.

## 3. Types and signatures (locked; changing them needs a new "Approved")

The types of spec 03, the address types of spec 05, `useRepairList`, the list query, `Expansion`
and the three damage report types of spec 06 are used as they are. The "Approved" of this spec
approves the changes listed here.

**Changed from earlier specs** (each is the old rule and what it becomes):

- **D43 of spec 04** loses two clauses: "no button at the end of the row" (the button is drawn,
  D94) and "the last column exists only in the Show Deleted view ... and holds Restore" (the last
  column always exists; it holds the open button, and in the Show Deleted view Restore as well).
  Its other clauses stay (no New repair, no chevron on the status pill).
- **D41 and D67** (Restore stays in the last column of the Show Deleted view): unchanged in place
  and behaviour; it now sits beside the open button.
- **D84 of spec 06** loses "Open repair": it is drawn (D98 says when). Add service, Edit and Delete
  stay out until spec 09.
- **The page state of spec 06 §2.5**: `serviceRef` and `reported` become one `stack` of windows.
- **`RepairsTableProps`** (spec 06) gains `onOpenRepair`.
- **`ServiceWindowContentProps` and `ServiceWindowProps`** (spec 06) gain an optional
  `onOpenRepair`.
- **`RepairServices.tsx`** exports its row with the grid as a parameter; the block's behaviour and
  looks do not change.
- **The tests that say so:** the `RepairsTable` cases named in §1 are rewritten (the button is
  drawn; the Actions header is always there; Restore only when asked), the `ServiceWindow` case "no
  Open repair button" becomes "Open repair only when given the handler", scenario S23 and the
  helper of S27 expect an Open repair button (and still no Edit, Delete or Add service).

```ts
// src/features/repairs/utils/repairWindow.ts
import type { RepairListRow } from "./repairRows";
/** "DTR-2377 · Dallas Trailer Repair", one of the two, "Bleachers #52, #53", "Bleacher #52", "Repair". */
export function repairWindowTitle(row: RepairListRow): string;
/** "Created 2026-09-17" (the day in `timezone`), or null when the repair has no creation time. */
export function repairCreatedLine(row: RepairListRow, timezone: string): string | null;
/** The non-empty parts joined by ", " ("Dallas, TX, US"), or null when there are none. */
export function formatVendorAddress(
  address: { city: string | null; stateProvince: string | null; country: string | null } | null,
): string | null;
export type RepairFileKind = "photo" | "pdf" | "word" | "excel" | "text" | "csv" | "file";
export function repairFileKind(path: string): RepairFileKind;
export type RawRepairFileRow = { id: string; photo_path: string; created_at: string };
export type RepairFileRow = {
  id: string;
  name: string; // "Photo 1", "PDF 1": the type and its number, earliest first
  kind: RepairFileKind;
  day: string | null; // the day added, in `timezone`
  path: string;
};
export function buildRepairFileRows(
  raw: readonly RawRepairFileRow[],
  timezone: string,
): RepairFileRow[];
/** An administrator, an account manager or a maintainer (D102). */
export function canReadRepairFiles(roles: {
  isAdmin: boolean;
  isAccountManager: boolean;
  isMaintainer: boolean;
}): boolean;

// src/features/repairs/utils/repairDetails.ts (added)
/** "Open repair JJ-5": the name of the button at the end of a row. */
export function repairOpenLabel(row: RepairListRow): string;
export type WindowEntry =
  | { kind: "repair"; repairId: string }
  | { kind: "service"; repairId: string; serviceId: string }
  | { kind: "reports"; reported: ReportedReport[] };
export type ResolvedWindow =
  | { kind: "repair"; index: number; repair: RepairListRow }
  | {
      kind: "service";
      index: number;
      repair: RepairListRow;
      service: RepairService;
      showOpenRepair: boolean; // false when a repair window of that repair is under it (D98)
    }
  | { kind: "reports"; index: number; reported: ReportedReport[] };
/** Puts a window on top; the same entry as the top one changes nothing. Does not change `stack`. */
export function openWindow(stack: readonly WindowEntry[], entry: WindowEntry): WindowEntry[];
/** Removes the entry at `index` and everything above it. Does not change `stack`. */
export function closeFrom(stack: readonly WindowEntry[], index: number): WindowEntry[];
/** The windows to draw, bottom first; an entry whose repair or service is not in `rows` is left out. */
export function resolveWindows(
  rows: readonly RepairListRow[],
  stack: readonly WindowEntry[],
): ResolvedWindow[];

// src/features/repairs/db/repairWindowQueries.ts (a compiled Kysely query, no db.fn)
export type RawVendorAddressRow = {
  id: string; // the vendor's id
  city: string | null;
  stateProvince: string | null;
  country: string | null;
};
export function buildVendorAddressQuery(vendorUuid: string): CompiledQuery<RawVendorAddressRow>;

// src/features/repairs/hooks/useRepairDetails.ts (added)
export function useVendorAddress(vendorUuid: string | null): {
  address: string | null; // formatVendorAddress of the vendor's address
  isLoading: boolean;
};
/** Reads MaintenancePhotos from Supabase (D99); mounted only for a role that may read (D102). */
export function useRepairFiles(
  repairId: string,
  timezone: string,
): { state: "loading" | "error" | "ready"; files: RepairFileRow[] };

// src/features/repairs/components/RepairWindow.tsx
export type RepairWindowContentProps = {
  repair: RepairListRow;
  timezone: string;
  vendorAddress: string | null; // D100
  onOpenService: (serviceId: string) => void;
  onOpenReports: () => void; // the Reported button of the field
  files: ReactNode; // the Files section, or null for a role that may not read files
  Title?: ElementType; // `h2`, or the dialog's own title
};
export function RepairWindowContent(props: RepairWindowContentProps): JSX.Element;
export type RepairWindowProps = {
  repair: RepairListRow;
  onOpenService: (serviceId: string) => void;
  onOpenReports: () => void;
  onClose: () => void;
};
export function RepairWindow(props: RepairWindowProps): JSX.Element; // the Dialog and the hooks

// src/features/repairs/components/RepairFiles.tsx
export type RepairFilesContentProps = {
  state: "loading" | "error" | "ready";
  files: RepairFileRow[];
  fileUrl: (path: string) => string; // the public URL of the object
};
export function RepairFilesContent(props: RepairFilesContentProps): JSX.Element;
export function RepairFiles(props: { repairId: string }): JSX.Element; // the hook and the client

// src/features/repairs/components/RepairServices.tsx (added)
export type RepairWindowServicesProps = {
  repair: RepairListRow;
  onOpenService: (serviceId: string) => void;
};
export function RepairWindowServices(props: RepairWindowServicesProps): JSX.Element;

// src/features/repairs/components/ServiceWindow.tsx (changed)
// ServiceWindowContentProps and ServiceWindowProps each gain:
//   onOpenRepair?: () => void; // the button is drawn only when it is given (D98)

// src/features/repairs/components/RepairsTable.tsx (changed)
// RepairsTableProps gains:
//   onOpenRepair: (repairId: string) => void; // the button at the end of a row (D94)
```

Test hooks for e2e: `data-testid` `repair-open`, `repair-window`, `repair-window-title`,
`repair-window-reports`, `repair-window-services`, `repair-window-total`, `repair-files`,
`repair-file` and `service-window-open-repair`, `data-field` on the fields of the window (`vendor`,
`address`, `invoice`, `status`, `currency`, `zone`, `from`, `to`, `completed`, `reported`,
`bleachers`, `notes`), plus those of specs 04 to 06. A window is also found by role `dialog`.

## 4. Files

- **New** (`src/features/repairs`), four counted source files:
  - `components/RepairWindow.tsx`, `components/RepairFiles.tsx`.
  - `db/repairWindowQueries.ts`, `utils/repairWindow.ts`.
- **Changed:** `components/RepairsTable.tsx`, `components/RepairsPage.tsx`,
  `components/ServiceWindow.tsx`, `components/RepairServices.tsx`, `hooks/useRepairDetails.ts`,
  `utils/repairDetails.ts`; `src/features/userAccess/permissionPageData.ts` (§5, not counted).
- **Not touched:** `useRepairList` and the list query, `repairRows.ts` and the locked types of
  spec 03, `repairPageState.ts`, `repairExpand.ts` and the address, `repairFormat.ts`,
  `RepairChips.tsx`, `DamageReportWindow.tsx`, the old Files tab and `MaintenanceEventForm`, the
  Dashboard, `AppSchema.ts`, the sync rules, the database.

That is ten counted files (four new, six changed); tests, the matrix and the e2e files do not
count. The cap of ten holds, exactly.

## 5. The permissions matrix (`permissionPageData.ts`, same commit)

**Checked, no role gains data.** The vendor's address comes from `Vendors` and `Addresses`, which
the web streams of all four roles already carry. The files are read from a table whose database
rule already lets the administrator, the account manager and the maintainer read it, and the
viewer does not (D102). No write changes: the window is read-only for everyone.

**Edits in the row "Repair Costs & Vendors":**

- The description: before its last sentence, "The page only reads for now.", one sentence is added:
  "A button at the end of each row opens the repair in a window of its own, with the vendor and
  its address, the invoice number, the status, the repair days, the zone, the bleachers, the
  notes, the day the damage was reported, its services with their totals and, for an
  administrator, an account manager and a maintainer, its files."
- The role notes. The administrator's becomes "Sees every column and the total cost strip, and
  opens the repair window with its files." The account manager's gets ", and opens the repair
  window with its files" at its end. The viewer's gets "Opens the repair window but does not see
  its files." after its last sentence. The maintainer's becomes "Sees every column and the total
  cost strip, vendors included, and opens the repair window with its files."

**One edit in the row "Repairs & Maintenance":** the sentence "a repair is edited from the
Dashboard until the repair window arrives" becomes "the repair window only shows a repair, and a
repair is edited from the Dashboard until that window can edit".

`permissionPageData.test.ts` gets cases for the new sentence, the four role notes and the changed
sentence.

## 6. Behaviour scenarios (Playwright, written and not run)

The fixture `seedRepairs` of specs 04 to 06 is used. It gets these additions: an `Addresses` row
(`city` "E2E City", `state_province` "TX", `country` "US") and the vendor's `address_uuid` pointing
to it; two `MaintenancePhotos` rows on the completed repair, a `.jpg` and a `.pdf` path made from
the suffix, added a minute apart in that order (the objects do not exist in storage; the links are
what is tested). The fixture returns the address text and the two paths, and its cleanup removes
the new rows. The helpers get `openButtonOf`, and `windowOf` learns `repair`. The scenarios that
need a zone skip that assertion when the fixture has none.

**Changes to the scenarios of earlier specs:** S23 expects an Open repair button in a service
window opened from the table, and still no Edit, Delete or Add service; the helper of S27
(`readServicesAndReport`) drops "Open repair" from the buttons that must be absent; S26 stays (the
Restore button is now beside the open button).

Administrator (`repairsWindow.admin.spec.ts`):

- **S28:** every row, on the Open tab, the Completed tab and in the Show Deleted view, has the open
  button named "Open repair ..." with the invoice number; a click opens the repair window and
  does not toggle the row's block; in the Show Deleted view the same cell holds the button and
  Restore, a click on Restore restores the repair and does not open the window, and the button of
  a deleted repair opens its window with the grey "Deleted" mark.
- **S29:** the window of the completed repair: the line "Repair", the title (the seeded invoice
  number and vendor name joined by " · "), a "Created" line with a day; the fields: the vendor
  with the address line "E2E City,
  TX, US", the invoice number, the Completed pill, USD, the zone (when the fixture has one), Repair
  from and Repair to, Completed, Reported "2026-09-17+1" with the button "View Damage Reports
  (2)", the bleacher chip, the notes; no Edit, Delete, Add service or Open repair button. The CAD
  repair's window: the title "Bleacher #N", the vendor and invoice as dashes, no address line, the
  button "View Damage Report".
- **S30:** the services of the completed repair's window: two rows (Tires, Welding) with the ten
  headers; the Total row has the four sums and the repair's total (`usd(totalCents)`); a repair
  with no services (one of the 26) says "No services on this repair." and its Total row shows its
  cost; no Add service anywhere.
- **S31:** the stack: from the repair window, a click on a service row opens the service window
  over it and that window has no Open repair button; Esc closes only the service window; the
  Reported button opens the damage report window over the repair window and Esc closes only it;
  a last Esc closes the repair window. From the table: a service window opened from an open block
  has Open repair; a click opens the repair window over it; Esc closes only the repair window; a
  second Esc closes the service window.
- **S32:** the files of the completed repair's window: "Photo 1" and "PDF 1" in that order, each
  with "Added" and a day, both links with `target="_blank"`, a `href` that holds `maintenance-photos`
  and the path, and the open button labelled "Open Photo 1"; the repair with no files says "No
  files."; the Files section is also there in a deleted repair's window in the Show Deleted view.

Account manager, viewer and maintainer (a test added to each `repairsAccess.<role>.spec.ts`; the
steps are in the helper `repairWindowFlow.ts`):

- **S33:** the open button of the completed repair opens the window with the title, the vendor
  and its address, the services with the Total row, and a service window opened from its table has
  no Open repair button; no Edit, Delete or Add service. The account manager and the maintainer see
  the Files section with "Photo 1" and "PDF 1"; the viewer sees no "Files" heading and no
  `repair-files` section.

## 7. Tests (Vitest, written first)

- **`repairWindow.test.ts`** (new).
  - `repairWindowTitle`: invoice and vendor joined; invoice alone; vendor alone; blanks count as
    empty; one bleacher, several, `#?`; nothing at all gives "Repair".
  - `repairCreatedLine`: the day in the given zone (a time near midnight moves with the zone); null
    without a creation time.
  - `formatVendorAddress`: all three parts; some of them; trimmed; none or null gives null.
  - `repairFileKind`: each extension of §2.5, upper case, a dot inside the path, no extension.
  - `buildRepairFileRows`: earliest first with a tie broken by id; numbers per type ("Photo 1",
    "Photo 2", "PDF 1"); the day in the given zone and null for a time that is not a date; the
    path kept; nothing gives an empty list.
  - `canReadRepairFiles`: true for each of the three roles alone, and false when none is set.
- **`repairDetails.test.ts`** (changed).
  - `repairOpenLabel`: invoice, bleachers with `#?`, neither.
  - `openWindow`: pushes; the same entry as the top one changes nothing; the same entry under
    another one is pushed; the input is not changed.
  - `closeFrom`: removes the entry and everything above it; index 0 empties the stack; an index
    past the end changes nothing; the input is not changed.
  - `resolveWindows`: a repair, a service and a reports entry resolve in order with their index;
    an entry whose repair or service is not in the rows is left out and the others stay;
    `showOpenRepair` is false when a repair window of the same repair is below the service
    window, true when it is the only entry, true when the repair window below is another repair,
    and true for a service window that is below the repair window.
- **`repairWindowQueries.test.ts`** (new; the SQLite harness through the bound proxy of the
  earlier query tests). The query returns the city, state and country of the vendor's address; a
  vendor with no address comes back with nulls; an unknown vendor returns nothing; the compiled
  text does not contain `street` or `zip_postal` and does not use `db.fn`.
- **`RepairWindow.test.tsx`** (new; the content). The line "Repair", the title in each of its
  forms, the "Created" line and its absence, the "Deleted" mark for a deleted repair and not for
  a live one; every field with its value and with a dash when empty; the address line present
  and absent; each zone on its own line; the Bleachers chips and the dash; the Reported field
  with the day, `+N` and the button for one report and for several, and a dash for none; the
  notes with their line breaks; the services table and the Total row inside it; the `files` slot
  drawn when given and the "Files" heading absent when it is null; no Edit, Delete or Add service.
- **`RepairFiles.test.tsx`** (new; the content). The texts for loading, for failed and for no
  files; one row per file in order, with its name, "Added" and day, and the link of `fileUrl` on
  both the name and the button with `target="_blank"` and `rel`; the button label "Open Photo 1";
  no delete or upload control.
- **`RepairServices.test.tsx`** (changed). The window's table: the ten headers; a row for each
  service with the labels of spec 06 and the "Deleted" mark; the Total row with the four sums, the
  repair's total and the dashes when there is no service; the repair's total taken from
  `totalCents` and not from the services; the empty text with its Total row; the block of spec 06
  unchanged.
- **`ServiceWindow.test.tsx`** (changed). Open repair is drawn at the right of the strip when
  `onOpenRepair` is given and not drawn otherwise; still no Edit or Delete.
- **`RepairsTable.test.tsx`** (changed). Every row has the open button with its label and
  `title`; the Actions header is always there and plain; the Show Deleted view puts the button and
  Restore in one cell; no Restore without the view; the last cell is sticky; the rest of the cases
  of specs 04 to 06.
- **`permissionPageData.test.ts`** (changed). The new sentence, the four role notes and the
  changed sentence of §5.
- **A mutation check.** Three rules are broken one at a time (`resolveWindows` draws Open repair
  even when the repair window is below; `canReadRepairFiles` lets the viewer in; the Total row
  sums the services' totals instead of showing `totalCents`) and the tests must fail each time.
- **Not unit-tested, by project limits:** the clicks on the button and on a service row, the
  stack of dialogs (the layers, Esc), the new tab of a file, and the hooks (`useVendorAddress`,
  `useRepairFiles`): Vitest has no jsdom, no portal and no `renderHook`. They are covered by the
  e2e scenarios, which are written and not run.

## 8. Edge cases and errors

- **Offline (PowerSync).** The window, its fields, its services, the vendor's address and the
  stack work offline: they read the local database. The files need a network (D99): the section
  says "Files could not be loaded. They need a connection." and a file itself needs a network.
- **Clerk and auth.** The files request goes through `useClerkSupabaseClient`; until the client
  exists the section says "Loading...", and a refused or failed request (an expired session, the
  database rule) gives the same text as offline. No other call is made by the window. A viewer
  makes no request at all (D102).
- **A repair, a vendor or an address that is not on the device:** the title and the fields use
  what the list row has; a vendor with no row gives a dash, an address that did not sync gives no
  address line.
- **A repair gone while its window is open** (Show Deleted flipped by Back, a repair restored
  elsewhere): its window and the windows above it are not drawn; the ones below stay. A repair that
  comes back is drawn again from the stack.
- **No repair days, no zone, no notes, no bleachers:** dashes.
- **Many services or many files:** the window grows and scrolls (`max-h-[90vh]`).
- **A file with no extension or an unknown one:** named "File 1" and opened as it is. A `heic`
  photo is named a Photo and opened in a new tab; the browser may offer to download it.
- **A file that does not exist in storage:** the new tab shows the storage's answer; the page does
  not check.
- **An amount wider than its column** (a Tax or a Freight of about $10,000 or more in the 72 px
  columns of the canvas) pushes into the gap; the canvas's widths are kept.
- **Esc:** closes the window on top only; a Radix dialog does this on its own.
- **A double click on the open button:** the second request for the same window changes nothing.
- **Show Deleted:** the window of a deleted repair is read-only like any other and carries the
  "Deleted" mark; its services are all those of the repair (D34), a service deleted on its own
  with its mark.
- **Not seen in a browser** (the user's rule: the Browser pane cannot run PowerSync): the last
  column and the button next to the sticky Restore, the repair window (size, scroll, the grid of
  fields, the table's sideways scroll), the stack of up to four dialogs (the layers and the
  focus after each closes), the files with real storage objects, and everything from specs 04 to
  06 that is still unseen; see §10.
- **E2E needs the sync rules of spec 02** (services, categories and reports reach the test user),
  as in specs 04 to 06; the files come from Supabase and need nothing more.

## 9. Not in this spec

- **The status menu and `completed_at` (08); Edit, Delete, Add service, New repair, Restore of a
  service, the upload and the deletion of a file (09); the button gates and the role specs
  (10); the Dashboard (11).**
- **A link to a repair or the window in the address; the stored address of a repair; the owner;
  the event name; the asset value; the size, the original name or the type of a file (the
  database does not hold them); syncing `MaintenancePhotos` to the device; the viewer reading
  files (it needs a change of the database rule).**
- **A sort or a filter of the services; the Reported day of each service beyond the table's
  column; any change to the list query, to `useRepairList`, to the sync rules, to the Damage
  Reports page, to the old Files tab or to the mobile app.**

## 10. Definition of done

- `npm run tc` and `npx vitest run`, each with the real output and the exit code.
- `npx prettier --check` on the files this spec touches only (the repo-wide `npm run lint` is red
  at baseline).
- Playwright E2E: written (§6) and **SKIPPED** (the user's rule is not to run it; the admin
  project cannot run locally).
- **The browser check: SKIPPED.** The Browser pane cannot run PowerSync, and the user's rule is
  to skip it. The report lists what nobody has seen in a browser: from spec 04 the sticky column,
  the hover colour, the centring of the empty and loading blocks, the `router.replace` writes and
  the first run of `useRepairList` on real data; from spec 05 the dropdowns, the search box, the
  sort buttons and the filters; from spec 06 the arrow and the open colour, the sticky block, the
  card's sideways scroll, both windows, the photos and the bleacher card; from this spec §8.
- A mutation check of three rules (§7), each broken and restored byte for byte.
- No change outside `src/features/repairs`, `permissionPageData.ts` (and its test) and
  `docs/specs`. No change to the database, `AppSchema.ts` or the sync rules.

## 11. Result (2026-11-20)

- **Implemented:** the ten counted files of §4 (new: `RepairWindow.tsx`, `RepairFiles.tsx`,
  `repairWindowQueries.ts`, `repairWindow.ts`; changed: `RepairsTable.tsx`, `RepairsPage.tsx`,
  `ServiceWindow.tsx`, `RepairServices.tsx`, `useRepairDetails.ts`, `repairDetails.ts`) and the
  matrix edits of §5. Tests: new `repairWindow.test.ts` (27), `repairWindowQueries.test.ts` (5),
  `RepairWindow.test.tsx` (23) and `RepairFiles.test.tsx` (10); changed `repairDetails.test.ts` (19
  to 40), `RepairServices.test.tsx` (20 to 32), `ServiceWindow.test.tsx` (19 to 21),
  `RepairsTable.test.tsx` (42 to 49) and `permissionPageData.test.ts` (two new cases, four
  changed: the viewer note, the open-repair sentence, the old notes and the old row). E2E: the new `repairsWindow.admin.spec.ts` (S28 to S32), the
  helper `repairWindowFlow.ts` (S33) and S33 added to the three `repairsAccess` specs, the fixture
  and the helpers extended.
- **Tests first:** the new and changed tests were written before the code. The first run was red:
  9 of 24 files failed (48 failing tests; four files could not load their module because it did
  not exist yet: `repairWindow`, `repairWindowQueries`, `RepairWindow`, `RepairFiles`).
- **Checks.**
  - `npm run tc`: exit 0 (the e2e files are type-checked too).
  - `npx vitest run`: exit 0, 565 files and 8340 tests (before: 561 and 8231, so +4 files and +109
    tests).
  - `npx prettier --check` on the 31 files this spec touches: clean.
  - Playwright: SKIPPED. The specs are written and were not run (the user's rule; the admin
    project cannot run locally either).
  - Browser check: SKIPPED (the user's rule; the Browser pane cannot run PowerSync).
- **Mutation check.** Three rules were broken one at a time (`resolveWindows` drew Open repair with
  the repair window below it; `canReadRepairFiles` let the viewer in; the Total row summed the
  services' totals instead of showing `totalCents`). The tests failed each time (2, 1 and 3 failing
  tests) and the three files were restored byte for byte (checked with a hash of each file).
- **What differs from the text above.**
  - `useRepairFiles` waits for the Clerk session (`useSession`) and puts the session id in its query
    key, not only "until the client exists" (§8): the client of `useClerkSupabaseClient` always
    exists, and a request sent before the session loads would get an empty list from the database
    rule and show a false "No files." until the next read. The signature is as in §3.
  - `buildRepairFileRows` puts a file whose time is not a date after the dated ones (§7 names only
    the tie by id); the case is tested.
  - `RepairServices.tsx` also has a small internal `ServicesHeader` that the block and the window's
    table share, besides the exported `ServiceRow` of §3.
  - The last cell of a row has `data-col="actions"` (it was `restore` in the Show Deleted view).
  - One more test id, `repair-window-created` (the Created line), and `data-field="address"` on a
    `div` inside the Vendor field; §3 lists the other hooks.
  - Two scenarios of earlier specs changed beyond what §6 names: S1 (the header list gets the hidden
    "Actions") and S21 (its "no buttons" check no longer lists Open repair, which every row has).
- **Not verified.**
  - **The browser check was not done.** So the last column and the open button next to the sticky
    Restore, the repair window (size, scroll, the grid of fields, the table's sideways scroll), the
    stack of up to four dialogs (the layers and the focus after each closes), the files with real
    storage objects and the vendor's address on real data have not been seen; everything from specs
    04 to 06 that was unseen still is.
  - The clicks on the button and on a service row, the stack of dialogs (the layers, Esc), the new
    tab of a file and the two hooks (`useVendorAddress`, `useRepairFiles`) are clicks or effects that
    Vitest cannot run (no jsdom, no portal, no `renderHook`). Only the e2e scenarios cover them, and
    those were not run. The new query was run on an in-memory SQLite shaped like the local database,
    not on PowerSync.
  - The e2e fixture's new rows (an address on the vendor, two `MaintenancePhotos` rows) were checked
    against the schema and the types, not executed.
- **Not done.** Nothing is committed. The headers of specs 04, 05 and 06 still say "uncommitted".
