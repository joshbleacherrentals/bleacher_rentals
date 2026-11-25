# Repairs 08: the status menu

> **Amended by [repairs-08a-choose-reports-to-close.md](repairs-08a-choose-reports-to-close.md)
> (2026-11-24).** D116 (the reports found for the repair are closed on the way into Completed) is
> replaced: a dialog asks which open linked reports to close (08a D238 to D244). D115 (no
> confirmation) now holds only where no dialog is drawn (08a D249). §2.3, §3 (`StatusChange`,
> `reportIdsToClose`) and §5 (the matrix sentences) follow 08a §2.4, §3 and §5. D112 reads "the
> moment of the write" (08a D239). D117 and D122 stand, except that 08a D251 writes scenarios.

Status: **APPROVED and IMPLEMENTED 2026-11-20**, uncommitted (0 open decisions; D110 to D122 were
taken by the user in four question batches; the results are in §11; no Playwright scenarios were
written (D122) and the browser check was not done). Build order: **08 of 11**.
Needs: [repairs-01-design.md](repairs-01-design.md), [repairs-02-sync-rules.md](repairs-02-sync-rules.md),
[repairs-03-list-query.md](repairs-03-list-query.md), [repairs-04-table.md](repairs-04-table.md),
[repairs-05-toolbar.md](repairs-05-toolbar.md), [repairs-06-expanded-row.md](repairs-06-expanded-row.md)
and [repairs-07-repair-window.md](repairs-07-repair-window.md) (all done and committed: 04 is
5280565b, 05 is 9567144a, 06 is 56f00da2, 07 is b9abca86; 06 and 07 are not pushed). Needed by: 09
and the specs after it. Plan: [repairs-plan.md](repairs-plan.md). Branch: `q4-sprint4-maintenance`.
Scope: **the status menu. The status pill of a row and the status pill of the repair window become
a menu of the six statuses for an administrator and a maintainer. Choosing a status writes it on
the repair; moving into Completed also writes `completed_at` and closes the damage reports found
for the repair; moving out of Completed clears `completed_at`. It changes clauses of D43 (the pill
has no chevron) and of spec 07 (the pill of the repair window is plain); §3 lists every one, and
the "Approved" of this spec approves them.** No migration, no sync change, no change to the list
query, to `useRepairList`, to the locked types of spec 03 or to the address of the page. Edit, New
repair, services, files, Delete and the Status select of the Edit mode are spec 09.

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

**Decisions of spec 07 (done, user, 2026-11-20; four question batches).**

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

**Decisions of this spec (user, 2026-11-20; four question batches).**

- **D110 (who changes the status):** an administrator and a maintainer, the two roles that already
  see Show Deleted and Restore (`canManageDamageAndMaintenance`). An account manager, a viewer and
  every other role see the plain pill, with no chevron and no menu, as today. The database would
  let an account manager write too; the page does not offer it.
- **D111 (where the menu is):** in the row of the table and in the repair window. The pill in the
  header of the service window stays plain for everyone.
- **D112 (what `completed_at` gets):** when a repair moves into Completed from another status,
  `completed_at` gets the moment of the click, read from the clock of the browser, as an ISO
  timestamp. The table keeps showing the day of it in the app time zone (D37).
- **D113 (leaving Completed):** when a repair moves from Completed to another status,
  `completed_at` is cleared (set to empty). An open repair has no completed date. Moving into
  Completed again writes a new moment. The 151 repairs from before maintenance-01 have an empty
  `completed_at` already, so leaving Completed changes nothing for them, and moving them back in
  writes a moment, which then replaces the `event_end` fallback of D31 for that repair.
- **D114 (what a person sees after a change):** nothing but the change: no message on success,
  and no message when the row moves to the other tab. The row follows the list, which is
  reactive: it stays where the list puts it, or it leaves the tab at once.
- **D115 (confirmation):** none. Choosing a status in the menu writes it at once, in both
  directions, including the way out of Completed that clears `completed_at`.
- **D116 (reports on the way into Completed):** the damage reports found for the repair (the
  Reported list of the row, spec 03 D26 to D28) that are still open are closed in the same write:
  `resolved_at` gets the same moment as `completed_at`, and `maintenance_event_uuid` gets the id of
  this repair, as `createMaintenanceEvent` does when a repair is created. A closed report leaves
  the phones of the drivers (the mobile sync rule carries only reports with an empty
  `resolved_at`, besides the driver's own reports).
- **D117 (reports on the way out of Completed):** the reports stay closed. Leaving Completed
  does not touch a report.
- **D118 (a deleted repair):** its pill has no menu and no chevron, in the Show Deleted view and
  in its window. The status of a deleted repair changes only after Restore.
- **D119 (a failed local write):** a red error toast, as Restore shows today ("Failed to change
  the status." and the error text). It is shown only for an error, never for a success (D114).
- **D120 (offline):** nothing special. The write goes to the local database at once and to the
  server when the connection is back; until then other people (and the phones of the drivers)
  do not see it. The app has no global offline indicator and this spec adds none.
- **D121 (the matrix):** both rows, "Repairs & Maintenance" and "Repair Costs & Vendors"; the
  levels (full, read, custom, none) do not change in either row, only the sentences and the notes
  of the administrator, the account manager, the viewer and the maintainer (§5).
- **D122 (e2e):** no Playwright scenarios are written for this spec (the user: they are not run
  anyway). The report marks E2E as not written and not run. This differs from specs 04 to 07.

**What follows from the design and from earlier decisions (no new decision).** Each item names its
source, so a reviewer can check it. The last item is wording and sizes only; it is listed so it can
be corrected, and no behaviour hangs on it.

- **The same status again** (D17, "any of the six to any other"): choosing the status the repair
  already has closes the menu and writes nothing.
- **The pill's click** (D80, D94): it stops the click, so opening the menu does not also open or
  close the block under the row, as the arrow, the Reported link and the open button do.
- **The chevron** (the canvas, `StatusMenu`; D43): drawn only where the menu works, that is for
  the two roles of D110 on a live repair (D118). Everywhere else the pill is as it is today.
- **The menu** (the canvas, `StatusMenu`; D17, D74): six entries in the order of the course of a
  repair (Inbound, Triaged, Waiting repair, In repair, Confirm repair, Completed), each with a dot
  in the colour of the status and the word of its pill, the current one ticked.
- **Windows follow the data** (the rule of spec 06 §2.5): the repair window found again in the
  list shows the new status and the new Completed day at once; a service window shows the new
  status in its strip. A window is not closed by a status change.
- **The row after a change** (D12, D13, D36, spec 05 sort): the row moves to the other tab when the
  change crosses Completed; the strip of totals and the pager are computed again from the list,
  so the rows below move up and a page that has become empty shows the last page (spec 04).
- **Which `completed_at` the table shows** (spec 03 §2.5): an open repair a dash; a completed
  one the day of `completed_at`, or `event_end` when `completed_at` is empty (D31).
- **A status the code does not know** (spec 04): its pill shows its stored word in grey. For an
  allowed role it is a menu too, with no entry ticked, and the six entries are the only ones that
  can be written.
- **The service window** (D111): its pill stays `StatusPill`; no prop of it changes.
- **The matrix and CLAUDE.md** (§5): the change carries its rows in the same commit.
- **Wording and sizes chosen by me** (presentation only): the toast words, the `aria-label` of the
  pill ("Change status of repair JJ-5, now In repair"), the size of the chevron and of the dot, the
  width of the menu, and the test ids.

## 1. What the code has today (researched 2026-11-20)

- **The pill.** `StatusPill({ status })` in `src/features/repairs/components/RepairChips.tsx` is a
  plain `span` (28 px high, 13 px type) that takes its word and colours from `statusPill()` of
  `utils/repairFormat.ts`. It is used in the Status column of `RepairsTable`, in the Status field of
  `RepairWindow` and in the repair strip of `ServiceWindow`. Its comment says it becomes a menu in
  spec 08. The six words and colours are the canvas's; a word the code does not know is grey.
- **The row and its clicks.** A click on a row toggles its block (`onToggleRepair`); the arrow,
  the Reported link, the open button and Restore each call `event.stopPropagation()` so that one
  click does one thing. `RepairsTable` gets its column cells from a `render(row, ctx)` function with
  a `CellContext` (`expanded`, `blockId`, `onToggle`, `onOpenReports`).
- **The page.** `RepairsPage` knows the role (`useTeamPermissions` and
  `canManageDamageAndMaintenance`, the gate of Show Deleted and Restore), takes the whole list from
  `useRepairList`, and draws the windows from a stack that it finds again in the whole list on every
  render. Its one write today is Restore: `setMaintenanceEventDeleted(repairId, false)`, called as
  `void … .catch(() => {})` because the function shows its own error toast.
- **How a repair is written today.**
  - `setMaintenanceEventDeleted` (`src/features/maintenanceEvents/db/deleteMaintenanceEvent.ts`)
    builds `db.updateTable("MaintenanceEvents")…compile()` and runs it with `typedExecute` (the
    PowerSync-first pattern of `docs/POWERSYNC_ARCHITECTURE.md`); on an error it shows an
    `ErrorToast` and rethrows; on success it shows a `SuccessToast`.
  - The old form (`createMaintenanceEvent`, `updateMaintenanceEvent`) writes through the Supabase
    client directly; this spec does not use it. `createMaintenanceEvent` closes reports like this:
    `resolved_at = now` and `maintenance_event_uuid = the new repair` on every report of the
    bleachers that has an empty `resolved_at` (`… .is("resolved_at", null)`).
  - `typedExecuteBatch(statements)` (`src/lib/powersync/typedQuery.ts`) runs compiled statements
    in one local write transaction: atomic, one commit, one wake-up of the watchers.
- **The upload.** `BackendConnector.uploadData` sends each local change of a row as one
  `update(opData).eq("id", id)` through the Supabase client, so the row-level rules of the database
  apply. A refusal with code `42501` (row-level security), `22…` or `23…` is not retried: the rest
  of the transaction is discarded and a general toast says "A change could not be saved and has
  been discarded". The local row then returns to the server's value at the next sync.
- **Who may write (migrations and the database behind the read-only connector, 2026-11-20).**
  - `MaintenanceEvents`: select for admin, account*manager, viewer and maintainer; insert, update
    and delete for admin, account_manager and maintainer (`maint_events*\*`, migration
`20260923140000`). A viewer's write is refused. The web sync streams carry the table for the
    same four roles.
  - `DamageReports`: update for admin, account_manager and maintainer (`rbac_update`), and for a
    driver on three columns only.
  - The page gates the buttons more narrowly than the database: only an administrator and a
    maintainer (`canManageDamageAndMaintenance`), while the permissions matrix says an account
    manager edits only the repairs they created. The three rules differ; D110 follows the page.
- **Triggers on `MaintenanceEvents`.** Exactly one: `trg_sync_maintenance_cost_per_year` (after
  insert, update or delete), which recomputes the sum of `cost_cents` of the year of `event_start`
  in `DriverScoreCardStats`. It does not read `status` or `completed_at`. **No trigger sets
  `completed_at`** (maintenance-01 added the column and the migration has none), so writing it is
  the app's job (D10, D112). The trigger on `MaintenanceLineItems` recomputes `cost_cents` only.
  The database that the read-only connector reaches has no `status` column yet: migration
  `20261117120000` is not applied there, so the facts above come from the migrations and from the
  policies and triggers that connector could read.
- **Damage reports.** `DamageReports.resolved_at` and `maintenance_event_uuid` are the two columns
  `createMaintenanceEvent` writes. A trigger (`damage_report_categories_sync_resolved_at`) copies a
  changed `resolved_at` into `DamageReportCategories.report_resolved_at`, a mirror for the mobile
  sync. The mobile sync rules carry `DamageReports` with an empty `resolved_at`, and, in another
  stream, the driver's own reports. The damage reports page treats a report with `resolved_at` as
  resolved. The Reported list of a row (spec 03 §2.6) holds the ids of the reports found for the
  repair by the link or by a service; it does not carry `resolved_at`.
- **Who reads `status` and `completed_at`.** Nothing outside `src/features/repairs` reads
  `MaintenanceEvents.status` or `completed_at` (the Dashboard reads `event_start`, `event_end` and
  the junction only).
- **The canvas.** `docs/design/repairs/StatusMenu.dc.html` draws the pill with a chevron and the
  menu open on a row: six entries, a dot in the status colour, the current one ticked. Views for
  roles that cannot edit are not drawn.
- **The menu component.** `src/components/ui/dropdown-menu.tsx` is the shadcn wrapper of Radix
  `DropdownMenu`; its content is drawn in a portal and its items need the Radix menu context.
  Component tests run in Vitest's node environment with `renderToStaticMarkup`: no jsdom, no
  `renderHook`, no portal, so an open menu cannot be rendered and its entries come from a pure
  function (§3), as the contents of the windows do in specs 06 and 07.
- **Data (local dev, 2026-11-20).** The repairs from before maintenance-01 were marked completed
  by its migration (those whose `event_end` is before today) and have an empty `completed_at`;
  there are no services, so a repair's Reported list is the only link to reports that matters.
- **The matrix.** "Repair Costs & Vendors" ends with "The page only reads for now."; "Repairs &
  Maintenance" says that the Repairs page lists repairs and shows and restores deleted ones, that
  the repair window only shows a repair, and that a repair is edited from the Dashboard.
- **Tests that exist for this page.** `RepairsTable.test.tsx` has "has no New repair and no chevron
  on the status pill (D43 still holds)" and "draws the status as a coloured pill with its word and
  no chevron (D43)"; `RepairWindow.test.tsx` draws the plain pill; `permissionPageData.test.ts`
  holds cases for the sentences of the two rows.

## 2. The behaviour

### 2.1 Who gets the menu (D110, D111, D118)

- `RepairsPage` passes `onChangeStatus` to the table and to the repair window only when
  `canManageDamageAndMaintenance({ isAdmin, isMaintainer })` is true. For every other role it is
  absent and nothing about the pill changes.
- A pill is a menu when `onChangeStatus` is present **and** the repair is not deleted
  (`canChangeRepairStatus`, §3). A deleted repair's pill is plain in the Show Deleted view and in
  its window, for every role.
- The service window is not given the prop and its pill stays plain (D111).

### 2.2 The pill and the menu (D17, D74, canvas `StatusMenu`)

- The trigger is the pill itself with a chevron at its right, a button
  (`data-testid="repair-status-menu"`, `aria-haspopup="menu"`, an `aria-label` that names the
  repair and the current status). The status column keeps its 160 px.
- A click, Enter or Space opens the menu; the arrows move; Esc and a click outside close it
  (Radix). The click on the trigger stops (the row does not toggle).
- The menu has six entries, one for each status, in the order Inbound, Triaged, Waiting repair, In
  repair, Confirm repair, Completed. Each shows a dot in the colour of the status and its word; the
  current status is ticked and `aria-checked`. Each is `data-testid="repair-status-option"` with
  `data-status`.
- Choosing an entry closes the menu and calls `onChangeStatus(to)`. Choosing the current one
  calls it as well and the write finds nothing to do (§2.3, "the same status again").
- In the repair window the same trigger replaces the plain pill in the Status field. Nothing else
  of the window changes.

### 2.3 The write (D112 to D117, D119)

`changeRepairStatus(change)` is the only writer. The page calls it with the repair's id, its
current status, its Reported list and one reading of the clock (`now`, an ISO timestamp).

- **What is written** (one local transaction, `typedExecuteBatch`, so it is atomic):
  - Nothing at all when `to` equals `from`.
  - One statement on the repair: `status = to`, and
    - moving **into** Completed (from any other status): `completed_at = now` (D112);
    - moving **out of** Completed (to any other status): `completed_at = NULL` (D113);
    - between two statuses that are not Completed: `completed_at` is not in the statement.
  - Only when moving into Completed, and only when the Reported list is not empty, a second
    statement on `DamageReports`: `resolved_at` gets `now` and `maintenance_event_uuid` gets the
    id of the repair, for the ids of the list **and** `resolved_at IS NULL` (D116). A report that is already
    closed is never changed, as `createMaintenanceEvent` guarantees with the same condition.
  - Moving out of Completed writes no statement on `DamageReports` (D117).
- **What is not written:** `event_start`, `event_end`, `cost_cents` and every other column of the
  repair (D10); no row of `MaintenanceLineItems`; nothing for a repair with no reports beyond the
  first statement.
- **After the write** (D114): no toast. The reactive list returns the repair with its new status
  and Completed day, the row leaves or keeps its tab, and the totals strip and the pager follow.
- **When the local write fails** (D119): `changeRepairStatus` shows `ErrorToast` with "Failed to
  change the status." and the error text, and rethrows; the page calls it as
  `void changeRepairStatus(…).catch(() => {})`, as it does for Restore. Nothing was written, because
  the batch is atomic.
- **When the server refuses it later** (RLS, a constraint): the connector's general toast shows
  (§1) and the transaction, status and reports together, is discarded; the row returns to the old
  status at the next sync. This spec adds nothing to that (D120).

### 2.4 What a person sees (D114, D115, D120)

- There is no confirmation and no toast on success, in either direction.
- The row may leave the current tab at once (a move across Completed). The Open tab can become
  empty and then reads "No repairs found." (spec 04).
- Open blocks and windows: the page closes the open blocks only when the state of the address
  changes (spec 06 D82), so a status change does not close any; a block of a row that left the
  tab is simply not drawn, and is drawn again, open, if the row comes back to the same view. A
  window stays open and shows the new values (the rule of spec 06 §2.5).
- Offline the pill changes at once on this device; the server, the other people and the phones of
  the drivers learn about it when the connection is back (D120).

## 3. Types and signatures (locked; changing them needs a new "Approved")

`src/features/repairs/utils/repairStatus.ts` (new, pure):

```ts
import type { RepairStatus, ReportedReport } from "./repairRows";

/** The six statuses in the course of a repair: the order of the menu (D74). */
export const REPAIR_STATUSES: readonly RepairStatus[];

/** What a change writes on the repair itself. */
export type StatusPatch = {
  status: RepairStatus;
  /** A moment: written. null: cleared. undefined: left as it is. */
  completedAt: string | null | undefined;
};

/**
 * `null` when the status does not change. Into Completed: `completedAt` is `now`. Out of Completed
 * (`from` is "completed"): `null`. Otherwise `undefined`. `from` is any stored word (D112, D113).
 */
export function statusPatch(from: string, to: RepairStatus, now: string): StatusPatch | null;

/**
 * The ids of the reports a change closes: the ids of `reported`, but only when `to` is Completed
 * and `from` is not; none otherwise (D116, D117).
 */
export function reportIdsToClose(
  from: string,
  to: RepairStatus,
  reported: readonly ReportedReport[],
): string[];

/** The menu is drawn when the role may (`allowed`) and the repair is live (D110, D118). */
export function canChangeRepairStatus(params: { allowed: boolean; deleted: boolean }): boolean;

export type StatusMenuEntry = {
  status: RepairStatus;
  label: string; // the word of the pill
  dotClassName: string; // a background class in the colour of the status, written out in full
  current: boolean;
};

/** The six entries of the menu in order; `current` is any stored word, ticked when it matches. */
export function statusMenuEntries(current: string): StatusMenuEntry[];
```

`src/features/repairs/db/repairStatusWrite.ts` (new):

```ts
import type { CompiledQuery } from "kysely";
import type { RepairStatus, ReportedReport } from "../utils/repairRows";

export type StatusChange = {
  repairId: string;
  from: string;
  to: RepairStatus;
  reported: readonly ReportedReport[];
  now: string; // an ISO timestamp: one reading of the clock for the whole change
};

/**
 * The compiled statements of a change, in the order they run: the repair, then the reports. An
 * empty list when nothing is to be written. Built with the app's `db` (Kysely).
 */
export function buildStatusStatements(change: StatusChange): CompiledQuery[];

/** Runs them with `typedExecuteBatch`; shows an `ErrorToast` and rethrows when the write fails. */
export function changeRepairStatus(change: StatusChange): Promise<void>;
```

`src/features/repairs/components/RepairStatusMenu.tsx` (new):

```ts
export type RepairStatusMenuProps = {
  status: string;
  /** Names the repair for the `aria-label`: "JJ-5", "Bleachers #52, #53" or "Repair". */
  repairLabel: string;
  onChange: (to: RepairStatus) => void;
};

/** The pill with a chevron as a button, and the menu it opens (Radix `DropdownMenu`). */
export function RepairStatusMenu(props: RepairStatusMenuProps): JSX.Element;
```

Changed signatures (each is the old rule and what it becomes, §3 "Changed from earlier specs"):

- `StatusPill({ status })` gets an optional `chevron?: boolean` (default false): the same pill with
  a chevron after its word. Its colours and size do not change.
- `RepairsTableProps` gets `onChangeStatus?: (repair: RepairListRow, to: RepairStatus) => void`.
  `CellContext` gets the same optional member; the `status` column draws `RepairStatusMenu` when it
  is present and the row is live, and `StatusPill` otherwise.
- `RepairWindowProps` and `RepairWindowContentProps` get
  `onChangeStatus?: (to: RepairStatus) => void`; the Status field draws `RepairStatusMenu` under
  the same rule.
- `RepairsPage` defines `changeStatus(repair, to)` (it calls `changeRepairStatus` with
  `new Date().toISOString()` and `repair.reported`) and passes it only when `canManage` is true.

**Changed from earlier specs** (each is the old rule and what it becomes):

- **D43 (spec 04):** "a pill with no chevron" becomes "a pill with a chevron where the menu works
  (D110, D118), and a plain pill everywhere else".
- **Spec 07 §2.7** ("the status: a plain pill, with no chevron; the menu is spec 08") becomes "the
  status of the repair window is the menu under D110 and D118; the pill of the service window stays
  plain (D111)".
- **Spec 03 §2.5 and §8** ("what `completed_at` does when a completed repair is reopened is decided
  in spec 08"; "keeps `completed_at` until spec 08 says otherwise") become: it is cleared (D113).
  Nothing in the list query changes: an open repair already shows a dash whatever `completed_at`
  holds.
- **The tests** named in §1 ("no chevron on the status pill") keep their meaning for a table drawn
  without `onChangeStatus`; §7 lists them.

## 4. Files

**New (counted, 3):**

- `src/features/repairs/utils/repairStatus.ts`
- `src/features/repairs/db/repairStatusWrite.ts`
- `src/features/repairs/components/RepairStatusMenu.tsx`

**Changed (counted, 4):** `components/RepairChips.tsx` (the optional chevron of `StatusPill`),
`components/RepairsTable.tsx`, `components/RepairWindow.tsx`, `components/RepairsPage.tsx`.

**Changed, not counted:** `src/features/userAccess/permissionPageData.ts` (§5) and its test.

**Tests (not counted):** `utils/repairStatus.test.ts`, `db/repairStatusWrite.test.ts`,
`components/RepairStatusMenu.test.tsx` (new); `RepairsTable.test.tsx`, `RepairWindow.test.tsx`,
`permissionPageData.test.ts` (changed). **7 counted files**, under the cap of 10; one logic.

No migration, no `database.types.ts`, no `AppSchema.ts` change (all the columns exist), no sync
rule, no new package.

## 5. The permissions matrix (`permissionPageData.ts`, same commit)

**Checked, the rule is the page's, not the database's.** No role gains data. The write is the
administrator's and the maintainer's, as Restore is. The database would also let an account manager
write the status (§1), and the matrix has said an account manager edits only their own repairs;
this spec leaves the account manager out (D110) and says so in the matrix. The levels do not change.

**Edits in the row "Repairs & Maintenance" (D121):**

- The description: "For now the Repairs page only lists repairs and, for an administrator or a
  maintainer, shows and restores deleted ones; the repair window only shows a repair, and a repair
  is edited from the Dashboard until that window can edit." becomes "For now the Repairs page lists
  repairs and, for an administrator or a maintainer, shows and restores deleted ones and changes the
  status of a repair, in its row or in its window; the rest of a repair is edited from the Dashboard
  until the repair window can edit."
- The role notes. The administrator's gets at its end: "Changes the status of any repair from the
  Repairs page." The account manager's gets: "Does not get the status menu on the Repairs page."
  The viewer's gets: "Sees the status but cannot change it." The maintainer's becomes: "Can create,
  edit, delete, and restore any repair or maintenance event, including its address, bleachers, and
  photos, regardless of who created it. Uses the Repairs page to look repairs up, change their
  status and restore deleted ones, and the Dashboard to edit them."

**Edits in the row "Repair Costs & Vendors" (D121):**

- The description: its last sentence, "The page only reads for now.", becomes "The status is the one
  thing the page changes: an administrator and a maintainer change it from the pill, in a row or in
  the repair window. Moving a repair into Completed records the moment it was completed and closes
  the damage reports found for it, which then leave the drivers' phones; moving it out of Completed
  clears that moment and leaves the reports closed. Nothing else on the page can be edited yet."
- The role notes (the level stays `read` for all four, D121). The administrator's and the
  maintainer's get at their end: "Changes the status from the pill." The account manager's and the
  viewer's get at their end: "The status is a label; it cannot be changed here."

`permissionPageData.test.ts` gets cases for the new sentences and the four role notes of each of
the two rows.

## 6. Behaviour scenarios (Playwright)

**None are written (D122).** The user's rule is that Playwright is not run here and, for this
spec, that the scenarios are not written either. The report marks E2E as **not written and not
run**. What the scenarios would have covered is covered at the level of the unit and component
tests of §7 (the rules, the statements run on SQLite, the markup of the pill, the matrix); the
whole path in a real browser with PowerSync (the menu opening in a portal, the click that does not
toggle the row, the row leaving its tab, the reports leaving a phone) is **not checked by anyone**
and the report says so.

## 7. Tests (Vitest, written first)

All run in the node environment; tests are written first and seen failing (red) before the code.

- **`utils/repairStatus.test.ts`.**
  - `statusPatch`: the same status gives `null`; Inbound to Completed gives `completedAt` equal to
    `now`; Completed to In repair gives `null` for `completedAt`; Inbound to Triaged gives
    `undefined`; every ordered pair of the six statuses gives the rule above (36 pairs, six of
    them `null`); a stored word the code does not know as `from` is treated as "not Completed".
  - `reportIdsToClose`: into Completed from another status gives the ids in order; from Completed
    to Completed, out of Completed and between two other statuses give an empty list; an empty
    list gives an empty list.
  - `canChangeRepairStatus`: true only for an allowed role and a live repair.
  - `statusMenuEntries`: six entries in the order of D74, each with its label from `statusPill`
    and a dot class; exactly one `current` for each of the six words; none for an unknown word.
- **`db/repairStatusWrite.test.ts`** (the harness of `repairListQueries.test.ts`: the app's Kysely
  compiled for SQLite and run on an in-memory `node:sqlite` shaped like the local database).
  - `buildStatusStatements`: the same status gives no statement; Inbound to Completed gives the
    repair statement (`status` and `completed_at` set to `now`) and the reports statement; Completed
    to In repair gives one statement that sets `completed_at` to null and no reports statement;
    Inbound to Triaged gives one statement with no `completed_at`; an empty Reported list gives
    only the repair statement.
  - Run on SQLite: the repair row has the new status and `completed_at`; **only** the reports of
    the list with an empty `resolved_at` get `resolved_at` and `maintenance_event_uuid`; a report
    that was already closed keeps its `resolved_at` and its link; a report not in the list is not
    touched; no other column of the repair and no other repair changes; the leaving of Completed
    clears the date and leaves a closed report as it is.
  - `changeRepairStatus` (with `typedExecuteBatch` and the toast mocked): a success calls the batch
    once with the statements and shows no toast; a failure shows an `ErrorToast` with "Failed to
    change the status." and rejects; the same status calls nothing.
- **`components/RepairStatusMenu.test.tsx`** (`renderToStaticMarkup`): the trigger is a button
  with `aria-haspopup="menu"`, the word of the pill, a chevron, and an `aria-label` with the repair
  label and the current status; the six words are not in the closed markup (the menu is a portal),
  so the entries are tested through `statusMenuEntries`.
- **`RepairsTable.test.tsx`.** Without `onChangeStatus` the pill is the plain one, with no chevron
  and no button (the two old cases keep passing); with it, a live row draws the menu trigger; a
  deleted row (Show Deleted) draws the plain pill; the open and Restore buttons and the other
  cells are unchanged.
- **`RepairWindow.test.tsx`.** The Status field is the plain pill without `onChangeStatus` and for
  a deleted repair, the menu trigger with it for a live one; the service window's pill is plain.
- **`permissionPageData.test.ts`.** The two changed descriptions and the role notes of D121.
- **A mutation check** (the habit of specs 03 to 07): three rules are broken on purpose and the
  tests must fail: (1) leaving Completed no longer clears `completed_at`; (2) the reports
  statement loses `resolved_at IS NULL`; (3) a deleted repair still gets the menu. The files are
  restored by their hash afterwards.

## 8. Edge cases and errors

- **Clerk and auth.** The write is local and makes no network call, so a Clerk error does not
  reach it. The role comes from `useTeamPermissions`, as for Restore; while it is not known the
  menu is not drawn.
- **Offline** (D120): the change is written locally and the pill changes; the server gets it
  later. Other people and the driver phones still see the old status and the open reports until
  then. Nothing on the page says the connection is missing.
- **The server refuses** (a role that changed, a row rule): the general toast of the connector
  shows; status and reports are discarded together; the row goes back to the old status at the next
  sync (and, if it had crossed tabs, goes back to its tab).
- **Two people at once.** Each change is sent as an update of the columns it wrote; the later one
  to reach the server wins for `status` and `completed_at`. If one completes a repair and another
  moves it to In repair, the end state is whichever upload comes last, and the reports closed by
  the first stay closed (D117).
- **A report closed by someone else after the list loaded.** The `resolved_at IS NULL` condition
  leaves it as it is, so nobody's moment is overwritten (D116).
- **A report not yet synced.** The Reported list is the local one; a report that has not reached
  the device is not in it and is not closed.
- **The same status chosen** writes nothing. **A second choice made before the list renders** (a
  very quick double action) writes again with a later moment; harmless, and the reports guard
  keeps the first closing moment.
- **A repair with no reports** (a repair entered by hand, or one whose reports are all closed):
  only the repair statement. **An old repair** (from before maintenance-01, empty `completed_at`):
  moving it out of Completed changes nothing about the date; moving it in again writes a moment,
  and the Completed column then shows that day and not `event_end` (D31).
- **A deleted repair** (D118): no menu until Restore. After Restore the pill is a menu.
- **The yearly cost trigger.** Every update of a repair fires
  `trg_sync_maintenance_cost_per_year`, which recomputes the sum of `cost_cents` for the year of
  `event_start`. A status change does not change that sum.
- **The width.** The longest word ("Waiting repair", "Confirm repair") with the chevron must fit the
  160 px column; nobody has seen it in a browser (the Browser pane cannot run PowerSync, spec 04
  D54, spec 06 D90).
- **The database behind the read-only connector has no `status` column** (§1): the menu works on
  the local data and on any database where migration `20261117120000` and the sync rules of spec
  02 are deployed; until then the page cannot show a status there at all.

## 9. Not in this spec

- **Edit, New repair, services, files, Delete, and the Status select of the Edit mode** (spec
  09). Spec 09 decides whether that select calls `changeRepairStatus`, so that choosing Completed
  there also writes `completed_at` and closes the reports. This spec does not decide it.
- **The service window's pill as a menu** (D111), the menu for an account manager (D110), a
  confirmation (D115), a message on success (D114), an offline hint (D120), an undo.
- **A server-side trigger** that sets `completed_at` or closes the reports, a migration, a sync
  rule, a change to the list query or to `useRepairList`.
- **Reopening the closed reports** when a repair leaves Completed (D117).
- **Playwright scenarios** (D122), a browser check (the Browser pane cannot run PowerSync).
- **The permissions spec 10** (the role gates in general, the role specs and the last check of the
  matrix), the Dashboard (11) and the mobile app.

## 10. Definition of done

- `npm run tc` and `npx vitest run`, each with the real output and the exit code (Node 24 first
  in `PATH`).
- `npx prettier --check` on the files this spec touches only (the repo-wide `npm run lint` is red
  at baseline); the spec's Markdown is also checked for an inline code span that breaks a line.
- Playwright E2E: **not written (D122) and not run**; the report says so.
- The browser check is skipped (the Browser pane cannot run PowerSync); the report lists what
  nobody has seen: the menu in its portal, the chevron's width in the 160 px column, the click that
  must not toggle the row, the row leaving its tab, the first write of `status` on real data.
- The matrix rows of §5 are edited in the same commit.
- The Ukrainian artifact of this spec is updated with the status and §11.
- The final report with real output: TS compilation, Vitest, E2E (not written, not run).

## 11. Result (2026-11-20)

- **Done as specified.** The status menu on the pill of a row and of the repair window for an
  administrator and a maintainer; the one writer `changeRepairStatus`; `completed_at` written on the
  way into Completed and cleared on the way out; the still-open reports of the Reported list closed
  on the way in; the plain pill for every other role and for a deleted repair; the two rows of the
  matrix. 7 counted files (3 new, 4 changed) plus the matrix and the tests; no migration, no sync
  change, no change to the list query.
- **Tests first.** Written before the code and seen red: 6 test files failed (the three new ones
  could not import their module; the table, the window and the matrix failed on their new cases),
  12 tests failed and 580 passed in the 27 files that were run. After the code the same 27 files
  were green: 628 tests.
- **Checks (real output, Node 24 first in `PATH`).**
  - `npm run tc`: exit 0 (`tsc --noEmit`, no output after the command line).
  - `npx vitest run`: exit 0, Test Files 568 passed (568), Tests 8390 passed (8390); before this spec the series stood at 565 files and 8340 tests, so +3 files and +50 tests.
  - `npx prettier --check` on the 14 touched code and test files: all matched files use Prettier
    code style (the repo-wide `npm run lint` is red at baseline).
  - Mutation check: three rules broken on purpose and the tests failed each time, 4, 2 and 2 tests
    (leaving Completed keeps `completed_at`; the reports statement loses `resolved_at IS NULL`; a
    deleted repair still gets the menu); the files were restored and their hashes compared.
  - Playwright: **not written (D122) and not run.** The browser check was **not done** (the Browser
    pane cannot run PowerSync).
- **What nobody has seen** (§6, §8): the menu opening in its portal, over the repair window's
  dialog and in the row; the chevron's width in the 160 px column; the click inside the list not
  toggling the row (a stop on the list was added, see below); the row leaving its tab; the reports
  leaving a driver's phone; the first write of `status` and `completed_at` on real data, and the
  server accepting the two-statement upload.
- **Extras and differences against the text above.**
  - `RepairStatusMenuProps.repairLabel` takes the existing `repairLabel(row)` string ("repair
    JJ-5", "repair of bleacher #52, #53", "repair"), not "JJ-5" as the comment of §3 says; the
    `aria-label` it gives is exactly the one §2.2 states ("Change status of repair JJ-5, now In
    repair").
  - `CellContext.onChangeStatus` is `(to) => void`, already bound to the row; the table's own prop
    keeps the `(repair, to)` signature of §3.
  - The list of the menu stops its clicks (`onClick` with `stopPropagation` on the content), not
    only the trigger: React sends the events of a portal to the parent components, so a click on an
    entry would otherwise reach the row's own click and toggle it. §2.2 named the trigger only.
  - The six entries are Radix `RadioItem`s from the primitive package (so `role="menuitemradio"` and
    `aria-checked` come for free), laid out here with the dot, the word and the tick; the shadcn
    wrapper's own radio item draws a circle in a left gutter that the canvas does not have.
  - The hidden description of the repair window no longer ends with "Read-only.": it would be wrong
    for the two roles that can change the status.
  - The write module's tests mock `sonner` and `typedExecuteBatch` and compile with a Kysely that is
    never connected, as `deleteTask.test.ts` does; the SQLite half runs the compiled text.
- **Not done.** Nothing is committed. Specs 04, 05 and 06 and the status line of spec 07 still say
  "uncommitted" in their headers (to be fixed in a docs commit when the user says so). `seed.sql`,
  `supabase/.temp/cli-latest` and `scripts/seed_add_on_conflict.py` are not mine and stay out of
  every commit.
