# Repairs 09b1: Services of a repair (Add service, Edit, Delete)

Status: **APPROVED and IMPLEMENTED 2026-11-21**, uncommitted (0 open decisions; D148 to D167 were
taken by the user in five question batches; the results are in §11; no Playwright scenarios were
written (D167) and the browser check was not done). Build
order: **09b1 of 11** (the plan's spec 09 is split: 09a is done and committed as 2d0f5931, and 09b
is cut into three specs, D148). Needs: [repairs-01-design.md](repairs-01-design.md),
[repairs-02-sync-rules.md](repairs-02-sync-rules.md),
[repairs-03-list-query.md](repairs-03-list-query.md), [repairs-04-table.md](repairs-04-table.md),
[repairs-05-toolbar.md](repairs-05-toolbar.md),
[repairs-06-expanded-row.md](repairs-06-expanded-row.md),
[repairs-07-repair-window.md](repairs-07-repair-window.md),
[repairs-08-status.md](repairs-08-status.md) and
[repairs-09a-repair-writes.md](repairs-09a-repair-writes.md) (all done and committed: 04 is
5280565b, 05 is 9567144a, 06 is 56f00da2, 07 is b9abca86, 08 is bd586ad6, 09a is 2d0f5931; 06 to
09a are not pushed). Needed by: 09b2, 09b3 and the specs after them. Plan:
[repairs-plan.md](repairs-plan.md). Branch: `q4-sprint4-maintenance`.

Scope: **an administrator and a maintainer add, edit and delete the services of a repair: from the
open row, from the repair window and from the service window, and as a draft inside New repair and
inside the Edit mode of a repair. Everything is written locally (PowerSync), in one local
transaction per action. It changes clauses of D43 and D84 (Add service, Edit and Delete are not
drawn), of spec 07 and spec 09a (the service window has no footer; the New repair window draws
only fields; the Edit mode keeps the services read-only; the signatures of `onSave`, `onCreate`,
`createRepair` and `updateRepair`); §3 lists every one, and the "Approved" of this spec approves
them.** No migration, no sync change, no change to the list query, to `useRepairList`, to
`AppSchema.ts` or to the locked types of specs 03 and 05. What a service does to the repair around
it (the list of its bleachers, its zone, the damage reports) is spec 09b2, and the files are spec
09b3, so until they land a repair with services has no bleachers and no zone, and a service does
not change the repair's Bleachers column (D29 does not hold between these commits, D148).

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

**Decisions of spec 08 (done, user, 2026-11-20; four question batches).**

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

**Decisions of spec 09a (done, user, 2026-11-20; eight question batches).**

- **D123 (the split):** the plan's spec 09 is two specs. **09a** (this spec): Edit, New repair, Delete
  and Restore of a repair. **09b**: the services (Add service, Edit, Delete and their Restore), the
  files, the bleachers and the zone of a repair, and the link from a repair to damage reports. The
  files are `repairs-09a-repair-writes.md` and `repairs-09b-*.md`; the plan's 10 (permissions) and 11
  (Dashboard) keep their numbers. This chat writes 09a only; 09b has its own question round in
  another chat.
- **D124 (who writes):** an administrator and a maintainer (`canManageDamageAndMaintenance`, the gate
  of D110, of Show Deleted and of Restore). An account manager and a viewer see the windows
  read-only: no New repair, Edit, Delete or Restore. The database lets an account manager write too
  (§1); the page does not offer it, as in D110. The same rule holds for 09b.
- **D125 (the bleachers of a repair):** they come only from its services (D29). The repair window has
  no Bleachers input and Save never writes `BleacherMaintEvents`. A repair made by New repair has no
  bleachers: no chips, no zone, and it is not on the Dashboard until 09b adds a service. The 151 old
  repairs keep their junction rows as they are. How the junction follows the services is 09b.
- **D126 (New repair now):** the button is drawn in 09a, although a repair made by it has no
  bleachers until 09b (D125). Such a repair has no chips and no zone, is not on the Dashboard, and its
  title is the invoice number and the vendor, or "Repair" when it has neither.
- **D127 (damage reports when a repair is made):** New repair closes no report. The rule is that a
  repair **links** the open reports of its bleachers (`maintenance_event_uuid` is the repair,
  `resolved_at` stays empty), so that Reported finds them and the drivers' phones keep them until the
  repair is Completed (D116). A repair of 09a has no bleachers (D125), so 09a writes no link; 09b
  writes it when a service gives the repair a bleacher.
- **D128 (the look of the modes):** the canvas's `InvoiceModalEdit` and `InvoiceModalNew`. In Edit the
  fields of the window become inputs in place: Vendor (select), Invoice # (text), Status (select),
  Currency (select), Repair from and Repair to (date inputs), Notes (textarea); Zone and Completed
  are read-only text. The footer has Cancel and Save ("Add repair" in New repair). The eyebrow reads
  "Edit repair" or "New repair". Save returns the window to view mode (Edit) or closes it (Add
  repair), as the canvas links them. Cancel drops the changes at once and does the same (view mode,
  or close). The footer of the view mode of a live repair has Delete at the left and Edit at the
  right.
- **D129 (unsaved changes):** when at least one field differs from what the window opened with, the
  cross, Esc and a click outside the window ask "Discard changes?" (Keep editing, Discard). When
  nothing differs they close the window at once. Cancel does not ask.
- **D130 (required fields):** only Repair from and Repair to (the database requires them). Vendor and
  Invoice # may be empty, as in the 208 repairs that exist, so an old repair can be edited without
  choosing a vendor.
- **D131 (the Vendor select):** the vendors that are active (`is_active`), plus the repair's own
  vendor while it is unchanged, even if inactive. The list has an entry "No vendor" at the top;
  choosing it empties `vendor_uuid`. Vendors are only picked, never added (D18).
- **D132 (Total):** read-only. `cost_cents` is never written by 09a: Edit does not touch it and New
  repair leaves it empty. The Total row of the window stays as spec 07 D101 draws it. The Total of a
  repair that has no services (46 of the 208 repairs have an amount) cannot be changed from the
  window.
- **D133 (currency):** a select of USD and CAD. In New repair, choosing a vendor sets the currency
  from the country of the vendor's address (`Addresses.country`: `CA` gives CAD, `US` gives USD; any
  other value, or no address, leaves the currency as it is), as long as the person has not picked a
  currency in that window; picking one by hand stops the prefill for the rest of the window. Edit
  never prefills. Locally 0 of 44 vendors have an address, so nothing is prefilled until vendors get
  addresses.
- **D134 (what Save writes):** only the columns the person changed, compared with the repair as the
  window opened (not with the live row). Nothing changed: nothing is written and the window returns
  to view mode. A change by someone else, or by the status menu, in a column the person did not touch
  is not overwritten.
- **D135 (the Status select):** it uses the rules of the menu through the same writer
  (`changeRepairStatus`, spec 08): when the person picked another status, Save writes it with
  `completed_at` and the reports exactly as the menu does (D112, D113, D116, D117), in one
  transaction with the other changed columns. `from` is the status the list shows at the moment of
  Save. In New repair the select starts at Inbound (D18); when Completed is chosen, `completed_at`
  gets the moment of Save and no report is closed (a new repair has no bleachers, D125).
- **D136 (the dates):** the browser's date input (`type="date"`), values `YYYY-MM-DD`, empty at the
  start of New repair. Repair to before Repair from is an error: the text under Repair to, and Save
  writes nothing.
- **D137 (a duplicate invoice number):** a repair may not have the same vendor and invoice number as
  another live repair. They are compared after removing the spaces at both ends and ignoring the case
  (`JJ-5` and `jj-5` are one number); deleted repairs and the repair itself do not count; the pair
  needs both a vendor and a number. The number is saved without the spaces at its ends, in the case
  typed, and an empty one is saved as empty (NULL). The check reads the local database at the moment
  of Save. It is stricter than the database's unique index (exact text), which stays as the last
  guard.
- **D138 (errors):** validation errors are shown under the field, in red, after Save is pressed:
  Repair from or Repair to empty, Repair to before Repair from, a duplicate invoice number. No toast
  for them. The window stays in Edit, the first field with an error gets focus, and an error goes
  when its field changes.
- **D139 (a failed local write):** a red toast "Failed to save the repair." with the error text; the
  window stays in Edit with the draft, so Save can be pressed again.
- **D140 (no success feedback):** Save, Add repair, Delete and Restore show no green toast (the way of
  D114). The window and the row are the answer. This removes today's green toasts of Delete and
  Restore on the Repairs page; the Dashboard keeps its own.
- **D141 (New repair in Show Deleted):** the button is drawn there too, although the new repair does
  not appear in a list of deleted repairs.
- **D142 (after Add repair):** nothing changes on the page: the tab, the page, the search and the
  filters stay. The repair appears where the list puts it (D36), on the tab of its status, if the
  search and the filters let it.
- **D143 (Delete):** in the footer of the window of a live repair, at the left, a red Delete button.
  It opens the existing dialog with the title "Are you absolutely sure?" and a new description: "This
  moves the repair to Show Deleted. An administrator or a maintainer can restore it." with Cancel and
  Continue. Continue writes `deleted` = 1 locally. Nothing else changes: services, files, junction
  and reports stay as they are. The repair leaves the live list, so its window and the windows of its
  services are no longer drawn (spec 06 §2.5).
- **D144 (reports on Delete and Restore):** they are not touched. A report closed by a Completed
  repair stays closed when that repair is deleted and when it is restored.
- **D145 (Restore):** the Restore button of the row (spec 04, D67) and a new Restore button in the
  footer of the window of a deleted repair, for the same roles. Both write `deleted` = 0 locally,
  after the duplicate check of D137 (the repair's own vendor and number against the live repairs):
  when a live repair has the same pair, nothing is written, a red toast says so ("A live repair
  already has this invoice number for this vendor."), and the repair stays deleted. The window of a
  deleted repair has no Edit and no Delete (the rule of D118).
- **D146 (the matrix):** both rows, "Repairs & Maintenance" and "Repair Costs & Vendors", change
  their sentences and the notes of the administrator, the account manager and the maintainer; the
  levels (full, read, custom, none) do not change in either row (§5).
- **D147 (e2e):** no Playwright scenarios are written (the user's rule, as D122). The report marks
  E2E as not written and not run.

**Decisions of this spec (user, 2026-11-21; five question batches).**

- **D148 (the cut):** the plan's spec 09b is three specs. **09b1** (this spec): the services of a
  repair (Add service, Edit, Delete) with the drafts in New repair and in Edit. **09b2**: what a
  service does to the repair around it (the list of its bleachers, its zone, the link to damage
  reports). **09b3**: the files. The files are `repairs-09b1-services.md`, `repairs-09b2-*.md` and
  `repairs-09b3-*.md`; the plan's 10 (permissions) and 11 (Dashboard) keep their numbers. This
  chat writes 09b1 only; 09b2 and 09b3 have their own question rounds in their own chats. Between
  the commits of 09b1 and 09b2 a service on a bleacher that is not in the junction is not visible
  in the Bleachers column (D29 does not hold for that time).
- **D149 (New repair):** the New repair window gets a Services block as the canvas draws it: the
  services are a **draft in the window** (in memory), and Add repair writes the repair and its
  services in one local transaction. In 09b1 the draft holds services only; the files join the
  same draft in 09b3, and the junction, the zone and the report links in 09b2. This changes spec
  09a, where the New repair window drew the fields only.
- **D150 (Add repair without services):** allowed, as in 09a. The repair is saved with its fields;
  it has no bleachers, no zone and no place on the Dashboard until a service is added to it later.
- **D151 (required fields):** Bleacher and Severity only, the minimum of the database. Category
  may be empty (a dash in the table, an entry "No category" at the top of its list). A service
  without a category is not found by a damage report for Reported (spec 03 D26) and the Category
  filter does not see it. An empty amount is saved as 0.
- **D152 (two alike):** two live services of one repair on the same bleacher and the same category
  are allowed. The database does not forbid it and nothing here checks it.
- **D153 (the lists of the selects):** Bleacher lists the bleachers that are not deleted (147
  locally), by number, searchable by number. Category lists the active categories, plus the
  service's own category while it is unchanged even if it is switched off (the rule of D131 for
  vendors), and "No category" at the top.
- **D154 (the size of an amount):** no check. An amount that does not fit the database (an
  `integer` of cents, about $21,474,836.47, for each of the four amounts, and for the sum of a
  repair's services) is refused by the server; the connector discards the write with its general
  toast and the service disappears at the next sync.
- **D155 (the style of 09a):** the service window follows the style of 09a: no green toast for
  Save, Add service or Delete; a red toast "Failed to save the service." for a failed write, the
  window staying in Edit with its draft; validation errors under the field after Save is pressed,
  the first field with an error gets focus, and an error goes when its field changes; Save writes
  only the columns the person changed, compared with the service as the window opened; "Discard
  changes?" on the cross, Esc and a click outside when a field differs, and Cancel closes at once;
  Save of an Edit returns to the view mode, Add service closes the window; an Edit that changed
  nothing writes nothing.
- **D156 (Delete):** the footer of the service window has a red Delete at the left, which opens
  the existing dialog with the title "Are you absolutely sure?", the description "This removes the
  service from the repair. It cannot be undone in the app.", Cancel and Continue. Continue writes
  `deleted` = 1 locally. The last live service of a repair is deleted the same way, and the Total
  of the repair then becomes $0.00 (the server's trigger).
- **D157 (no Restore of a service):** a deleted service has no Restore anywhere. It stays deleted;
  a service deleted on its own is not in the normal view (D34), and in Show Deleted its window has
  no buttons. The grey "Deleted" mark of D89 stays as it is. So Delete is final in the app, also
  for a service whose repair is deleted and later restored.
- **D158 (where Add service is drawn):** in four places: under the services of an open row; in the
  repair window in view mode; in the repair window in Edit mode; in the New repair window (the
  draft). Never in the Show Deleted view and never for a deleted repair (the rule of D118). Edit
  and Delete of a service live in the footer of its window (D84).
- **D159 (Total follows the server):** a service write never writes `cost_cents`. The Total column
  and the Total of the repair window (D101) follow the server's trigger and come back at the next
  sync, so for a moment after a write, and while offline, the Total can differ from the sum of
  Labor, Parts, Tax and Freight (spec 03 D32). This keeps D132.
- **D160 (the first service of a repair that has an amount):** nothing special, no warning and no
  dialog. 46 of the 208 repairs have an amount and no services; the first service replaces that
  amount by the sum of the services (the new service's amounts are 0 unless typed), and the old
  amount is not kept anywhere.
- **D161 (Edit of a repair):** while the repair window is in Edit mode, adding, changing and
  deleting a service are held in the window's draft together with the repair's fields. Save writes
  the repair and the services in one local transaction, Cancel and Discard drop all of it, and
  "Discard changes?" counts the services too. In the view mode of the repair window and in the
  open row of the table, a service is written at once.
- **D162 (the service window of a draft):** a click on a service of a draft (New repair, Edit)
  opens the service window as it is for a stored service: view mode with Edit and Delete in the
  footer, the same Delete dialog, and changes going to the draft, not to the database. There is no
  Open repair, and Reported and View Damage Report are not drawn for a service added in the draft.
- **D163 (the Total of the window while the draft changes):** the Total row of the repair window
  shows the sum of the four amounts of the draft's live services as soon as the draft differs from
  what was stored (New repair and Edit), and $0.00 when none remain; while the draft has no change
  it shows the stored `cost_cents` as in D101. The sums above it are always those of the services
  shown.
- **D164 (Completed):** services can be added, edited and deleted on a repair in any status,
  Completed included, as the fields of a repair can (09a).
- **D165 (who writes):** an administrator and a maintainer (`canManageDamageAndMaintenance`, as
  D124). An account manager and a viewer see the services read-only: no Add service, no Edit, no
  Delete. The database lets an account manager write too; the page does not offer it.
- **D166 (the matrix):** in the row "Repair Costs & Vendors" the level of the administrator and
  the maintainer becomes `custom` (they edit the amounts through the services, not the Total and
  not the vendors); the account manager and the viewer stay `read`. The levels of the row "Repairs
  & Maintenance" do not change. Both rows change their sentences and notes (§5).
- **D167 (e2e):** no Playwright scenarios are written. The report marks E2E as not written and not
  run (the rule of D122 and D147).

**What follows from the design and from earlier decisions (no new decision).** Each item names its
source, so a reviewer can check it. The last item is wording only; it is listed so it can be
corrected, and no behaviour hangs on it.

- **The form** (the canvas `ServiceModal`, `ServiceModalEdit`, `ServiceModalNew`): Bleacher,
  Category and Severity selects, a Description textarea, four money inputs (Labor, Parts, Tax,
  Freight) with a Total that is the live sum, and in Edit of a stored service a read-only line
  "Reported" with the day and "found from the driver's damage report, not edited here". The money
  inputs are `CentsInput` (text, up to two decimals, commas, no minus) with the sign of the
  repair's currency in front (`$` or `C$`; in a draft, the currency the window shows).
- **Severity** is the enum `minor`, `major`, `routine`, shown as Minor, Major, Routine (the pills
  of the table).
- **Description** (the rule of Notes in 09a): a text of spaces only is saved as empty (NULL); any
  other text is saved as typed.
- **Amounts:** an empty amount is 0; "1,260.00", "1260" and "1260.00" are the same amount and a
  change between them is not a change.
- **The ids and the order:** a new service gets `crypto.randomUUID()`. `created_at` is the moment
  of its Save; services added in one draft get that moment plus their index in milliseconds, so
  the list (ordered by `created_at`, spec 03) keeps the order they were added in.
- **Where nothing is drawn:** for an account manager and a viewer; in the Show Deleted view and in
  a deleted repair (the rule of D118 and D145); for a service marked Deleted (D157).
- **Windows of a draft** (spec 09a §2.2, "the draft belongs to the window"): the service window of
  a draft is drawn by the repair window itself, over it, and not through the page's stack (the
  stack finds services in the stored list, a draft is not there). Esc, the cross and a click
  outside close only the top window. A stored service of an Edit draft still has its Reported
  button, which opens the damage report window through the page.
- **The eyebrow and the title:** "Service" and the usual title in the view mode; "Edit service" in
  Edit; "New service" with the title "Add service" in Add.
- **A service of a repair whose Bleachers column is empty** (D148): the services table shows it;
  the repair's own list of bleachers does not change in 09b1.
- **Wording chosen by me** (presentation only): the texts of the errors and toasts
  (`SERVICE_FORM_MESSAGES`, §3), "Keep editing" and "Discard", "Saving..." on Save, the
  placeholders from the canvas ("Select a bleacher", "Select a category", "Select severity", "What
  is wrong, or what was done", "0.00"), the description of the discard dialog ("The changes you
  made to this service have not been saved."), and the test ids.

## 1. What the code has today (researched 2026-11-21)

- **The service window.** `ServiceWindow` and `ServiceWindowContent`
  (`components/ServiceWindow.tsx`) are read-only: 760 px, the cross of the dialog only, no footer
  (spec 06 D84). The repair strip has Open repair when the page gives `onOpenRepair` (D98). The
  window is opened through the page's stack (`WindowEntry`: `repair`, `service`, `reports`,
  `new`), which finds the repair and the service again in the whole list on every render.
- **The services table.** `RepairServicesBlock` (the open row) and `RepairWindowServices` (the
  repair window, with a Total row) in `components/RepairServices.tsx` draw `ServiceRow`s. They
  have no Add service (D84). In Edit mode of the repair window the table stays read-only (09a).
- **The repair window of 09a.** `RepairWindow`, `RepairEditBody`, `useRepairDraft`,
  `NewRepairWindow` and `RepairWindowFooter` in `components/RepairWindow.tsx`;
  `RepairEditing.onSave(initial, values)` and `NewRepairWindowProps.onCreate(values)`; New repair
  draws the fields only.
- **The writers of 09a.** `db/repairWrite.ts`: `buildCreateRepairStatement`,
  `buildUpdateRepairStatements`, `createRepair`, `updateRepair`, `deleteRepair`, `restoreRepair`;
  each writes through `typedExecuteBatch` (one local transaction) and shows a red toast on a write
  error. `db/repairStatusWrite.ts` writes the status.
- **How an upload works** (`src/lib/powersync/BackendConnector.ts`). The connector sends the
  operations of one local transaction one by one, each as its own request (an insert is an upsert,
  an update patches the changed columns). A server error of class 22 or 23, or 42501, discards the
  failed operation and the rest of that transaction, with a general red toast. Any other error is
  retried without end and the queue waits. So a local transaction is atomic on the device and not
  on the server.
- **The database** (migration `20261117120000_maintenance_schema.sql`). `MaintenanceLineItems`:
  `maintenance_event_uuid` and `bleacher_uuid` and `severity` are required, `damage_category_uuid`
  and `description` may be empty, four amounts of `integer` cents default to 0 and must be at
  least 0, `deleted` defaults to false. There is no unique index, so two lines of one bleacher and
  category are allowed. Policies: read for admin, account manager, viewer and maintainer; insert,
  update and delete for admin, account manager and maintainer. The trigger
  `maintenance_line_items_sync_cost` sets the repair's `cost_cents` to the sum of its live lines
  after every insert, update and delete (0 when none are live; a repair that never had lines is
  never touched). The table is in `AppSchema.ts` and in the web sync rules of the four roles (spec
  02, committed in `../br_powersync` as 692b21c, not pushed).
- **The data** (the read-only connector, 2026-11-21). The migration is not on that database yet
  (repairs have no `status` column, there is no `MaintenanceLineItems`), so what is said about
  services comes from the migration. 208 repairs; 46 have an amount (from $1.00 to $9,091.47, all
  of them ended); 207 have exactly one bleacher in the junction, and the only one with several
  (four) is deleted. 48 open damage reports on 38 bleachers, none linked to a repair. Locally
  (spec 07): 0 services.
- **Parts that exist.** `SearchableSelect`, `Dropdown`, `CentsInput`, `AlertDialog`,
  `useRepairFilterOptions` (`options.bleacher`: the bleachers that are not deleted, labelled
  `#52`; `options.category`: every category with `inactive`), `formatRepairMoney`,
  `normalizeNotes`, `RepairFormFields` (the pattern of an Edit form with errors), the page's
  `editingFor`, and the SQLite harness of `db/repairStatusWrite.test.ts`.
- **The matrix.** The rows "Repairs & Maintenance" and "Repair Costs & Vendors" carry the
  sentences of 09a (§5 gives the exact text and what it becomes).
- **Tests that exist.** `ServiceWindow.test.tsx`, `RepairServices.test.tsx`,
  `RepairWindow.test.tsx`, `RepairsTable.test.tsx`, `repairDetails.test.ts`,
  `repairWrite.test.ts`, `permissionPageData.test.ts`.

## 2. The behaviour

### 2.1 Who gets what (D157, D158, D164, D165)

- `RepairsPage` gives the service handlers only when
  `canManageDamageAndMaintenance({ isAdmin, isMaintainer })` is true (`canManage`). For every
  other role nothing changes: no Add service, no footer in the service window.
- **Add service** is drawn under the table of services of an open row, under the table of the
  repair window in view mode, in Edit mode and in New repair, and only for a repair that is not
  deleted. The table of a repair that has no services keeps its text ("No services on this
  repair.") and the button under it.
- **The footer of the service window** is drawn only with the handlers, for a service that is not
  deleted of a repair that is not deleted: Delete (red, at the left) and Edit (at the right) in
  the view mode; Cancel and Save in Edit; Cancel and "Add service" in Add. A service marked
  Deleted, and every service of the Show Deleted view, has no footer.
- The status of the repair does not matter (D164).

### 2.2 The service form (D151 to D154)

- **Bleacher:** `SearchableSelect` with `bleacherSelectOptions` (the bleachers that are not
  deleted, plus the service's own bleacher while it is unchanged when it is deleted or missing,
  labelled `#N`). Required.
- **Category:** `SearchableSelect` with an entry "No category" at the top and
  `categorySelectOptions` (the active categories plus the service's own while unchanged). Choosing
  "No category" empties it.
- **Severity:** `Dropdown` with Minor, Major, Routine. Required.
- **Description:** a textarea, three rows.
- **Labor, Parts, Tax, Freight:** `CentsInput` with the currency sign in front. The Total under
  them is the live sum of the four.
- **Reported:** in Edit of a stored service, a read-only line (§0, "what follows").
- While a write runs, every input is disabled and Save reads "Saving...".

### 2.3 The service window (D155, D156, D162)

- **View to Edit.** Edit copies the service into a draft: `initial = serviceFormFromRow(service)`
  and `values = initial`. The eyebrow reads "Edit service", the fields and the amounts become
  inputs in place, the repair strip, the Reported line and the bleacher card stay.
- **Save of an Edit** (§2.5): nothing changed returns to the view mode and writes nothing.
  Otherwise `validateServiceForm`; on errors nothing is written, the errors show under the fields,
  the first one gets focus; otherwise one statement is written and the window returns to the view
  mode with the new values. A failed write shows the red toast and the window stays in Edit.
- **Add** opens the window empty (`emptyServiceForm()`): the eyebrow "New service", the title "Add
  service", Cancel and "Add service". A saved Add closes the window.
- **Leaving.** Cancel leaves at once (view mode from Edit, closed from Add). The cross, Esc and a
  click outside ask "Discard changes?" (Keep editing, Discard) when `isServiceFormDirty` is true;
  otherwise they leave at once (from the view mode they close the window as today).
- **Delete.** The footer button opens the dialog of D156. Continue runs `deleteService` (one
  update, `deleted` = 1). A write error shows the red toast "Failed to delete the service." and
  nothing changes. After a Delete the service is not in the list, so its window is no longer drawn
  (spec 06 §2.5); in a draft the window closes itself.
- **The window follows the data** (spec 06 §2.5): in the view mode it shows the newest values; in
  Edit the draft is not replaced by data arriving from sync.

### 2.4 Add service and the stack (D158)

- **From the open row and from the repair window in view mode** the button opens a New service
  window through the page's stack: `WindowEntry` gets `{ kind: "newService"; repairId }`. It is
  resolved against the list: when the repair is not in the list any more, or is deleted, the
  window is not drawn. Asking again for the same entry on the top changes nothing.
- **From Edit and from New repair** the button opens the New service window inside the repair
  window (React state of the window), over it, and its Add service puts the service in the draft
  (§2.6).
- The New service window's repair strip shows the repair (in a draft, the repair as the window
  shows it, §2.6).

### 2.5 Writes on a live repair (D151, D155, D156, D159)

- **Add service:** one insert into `MaintenanceLineItems`:
  - `id` (a new uuid), `maintenance_event_uuid` (the repair), `bleacher_uuid`,
    `damage_category_uuid` (empty is NULL), `severity`;
  - `description` (spaces only is NULL), `labor_cents`, `parts_cents`, `tax_cents`,
    `freight_cents` (an empty amount is 0);
  - `created_at` (the moment of Save), `deleted` = 0.
  - **Not written:** the repair's `cost_cents` (D159), `BleacherMaintEvents`, `zone_uuid`,
    `DamageReports` (09b2).
- **Save of an Edit:** one update of the changed columns among `bleacher_uuid`,
  `damage_category_uuid`, `severity`, `description`, `labor_cents`, `parts_cents`, `tax_cents`,
  `freight_cents` (D155). Never written: `maintenance_event_uuid`, `created_at`, `deleted`.
- **Delete:** one update, `deleted` = 1.
- **Validation:** `validateServiceForm` checks Bleacher and Severity only (D151). Nothing is
  checked against the other services (D152) and amounts are not limited (D154).
- A write error of any of the three shows a red toast (`saveFailed` or `deleteFailed` and the
  error text) and is thrown again, so the window can stay as it is.

### 2.6 The draft in New repair and in Edit (D149, D161 to D163)

- **When there is a draft.** In New repair from the moment the window opens (it starts empty); in
  the Edit mode of a repair from the moment Edit is pressed (it starts with the repair's live
  services). It belongs to the repair window: it is lost with the window, on Cancel, on Discard
  and on a reload.
- **What it holds.** One entry per service: a stored service (with its values as the window
  opened) or a service added in the draft. Add puts a new entry; Edit of a service changes the
  values of its entry; Delete of a new entry drops it, Delete of a stored entry marks it removed
  (it leaves the table at once).
- **What the window shows.** The table of services shows the draft's live entries, the sums of
  Labor, Parts, Tax and Freight are theirs, and the Total row follows D163. In Edit the window
  shows the repair row with the draft's services (`repairWithServicesDraft`); in New repair it
  shows a row made from the draft's values (`newRepairDisplayRow`: the vendor's name, the status,
  the currency and the services of the draft, nothing else). The currency sign of the money inputs
  follows the currency the window shows.
- **Dirty and leaving** (D129, D161): the window is dirty when a field of the repair differs or
  the draft of services differs from what was stored (`isServicesDraftChanged`). A service added
  and then deleted in the draft is no change; a stored service changed back to its stored values
  is no change.
- **Save of the repair** (09a §2.4, extended): when neither the fields nor the services changed,
  the window returns to the view mode and nothing is written. The validation and the duplicate
  check are 09a's and ignore the services (a draft service was validated by its own window). The
  statements run in one `typedExecuteBatch`, in this order:
  1. In New repair: the insert of the repair (09a §2.5). In Edit: the update of the changed fields
     and the statements of the status (09a §2.5).
  2. The services of the draft (`buildServicesDraftStatements`): an insert for each added service
     (with `created_at` = the moment of Save plus its index in milliseconds), an update of the
     changed columns for each changed stored service, `deleted` = 1 for each removed stored
     service. Nothing for a stored service that is unchanged.
  - A failed write shows the red toast of 09a ("Failed to save the repair.") and the window stays
    with its draft.
- **Not in the draft:** the junction, the zone, the report links, the files (09b2, 09b3).

### 2.7 What a person sees (D155, D159)

- A saved service shows at once in the table and in the sums of the row and the window. The Total
  column and the Total of the repair window change when the server has added the services up and
  the change comes back (D159); offline they do not change.
- An Add service from the open row or the window closes its window and leaves the row open.
  Nothing says "saved".
- Offline (D120, as for the status and the repair): the write goes to the local database at once
  and to the server when the connection is back.

### 2.8 The page (D158, D162, D165)

- `RepairsPage` builds, for `canManage`:
  - the `ServiceEditing` of a service window of a live repair: `onSave` calls `updateService` with
    the service's id; `onDelete` calls `deleteService`;
  - `onAddService` of the table, of the open row and of the repair window: it opens
    `{ kind: "newService", repairId }`;
  - the `NewServiceWindow` of a `newService` entry: `onCreate(values)` calls `createService` with
    the repair's id and the moment of the call; Cancel and a saved Add close it;
  - in `editingFor`: the lists of the selects (`options.bleacher`, `options.category`),
    `onAddService`, and the new third argument of `onSave`;
  - for the New repair window: the lists and the new second argument of `onCreate`.
- Each write is called as `void …catch(() => {})`: the writers show their own error toasts.
- A service window for a deleted repair, or for a service marked Deleted, gets no `editing`.

## 3. Types and signatures (locked; changing them needs a new "Approved")

`src/features/repairs/utils/serviceForm.ts` (new, pure; the rules of the form and of the draft):

```ts
import type { FilterOption } from "./repairFilters";
import type { RepairFormValues } from "./repairForm";
import type { RepairListRow, RepairService, RepairSeverity } from "./repairRows";

export type ServiceFormValues = {
  bleacherUuid: string | null;
  categoryUuid: string | null; // null = No category
  severity: RepairSeverity | null; // null until chosen
  description: string; // as typed
  laborText: string; // as typed, commas allowed; "" while empty
  partsText: string;
  taxText: string;
  freightText: string;
};
export type ServiceFormField = keyof ServiceFormValues;

/** Add service: nothing chosen, empty text and amounts (D151). */
export function emptyServiceForm(): ServiceFormValues;
/** The values of a stored service as the window opens it; amounts as "1,260.00", zero as "0.00". */
export function serviceFormFromRow(service: RepairService): ServiceFormValues;

/** "" is 0; commas are ignored; "1,260.00" is 126000. */
export function amountTextToCents(text: string): number;
/** 126000 is "1,260.00"; 0 is "0.00". */
export function centsToAmountText(cents: number): string;
export type ServiceFormCents = {
  laborCents: number;
  partsCents: number;
  taxCents: number;
  freightCents: number;
  totalCents: number; // the sum of the four
};
export function serviceFormCents(values: ServiceFormValues): ServiceFormCents;

/** The description after normalizing: spaces only is null, other text as typed (`normalizeNotes`). */
export function normalizeDescription(text: string | null | undefined): string | null;

/**
 * The fields that differ, in the order of the type, compared after normalizing the description and
 * reading the amounts as cents (D155): "1,260", "1260.00" and "1,260.00" are one amount, "" and "0.00"
 * are one amount.
 */
export function changedServiceFields(
  initial: ServiceFormValues,
  current: ServiceFormValues,
): ServiceFormField[];
export function isServiceFormDirty(initial: ServiceFormValues, current: ServiceFormValues): boolean;

export type ServiceFormErrors = { bleacherUuid?: string; severity?: string };

export const SERVICE_FORM_MESSAGES: {
  bleacherRequired: "Bleacher is required.";
  severityRequired: "Severity is required.";
  saveFailed: "Failed to save the service.";
  deleteFailed: "Failed to delete the service.";
};

/** The checks of D151: a bleacher and a severity. */
export function validateServiceForm(values: ServiceFormValues): ServiceFormErrors;
/** The errors without the one a change of `field` makes stale; the same object when none. */
export function clearedServiceFormErrors(
  errors: ServiceFormErrors,
  field: ServiceFormField,
): ServiceFormErrors;

export type SelectOption = { value: string; label: string };
/**
 * The bleachers of the list (the ones that are not deleted, in its order), plus the service's own
 * bleacher (`current`) when it is not in the list, labelled `#N` (`#?` without a number) (D153).
 */
export function bleacherSelectOptions(
  bleachers: readonly FilterOption[],
  current: { uuid: string | null; number: number | null },
): SelectOption[];
/**
 * The active categories, plus the service's own category (`current`) even when inactive or not in
 * the list yet (then labelled `current.name`, or "Unknown"), in the order of `categories` (D153).
 * "No category" is not an option here: the select draws it.
 */
export function categorySelectOptions(
  categories: readonly FilterOption[],
  current: { uuid: string | null; name: string | null },
): SelectOption[];

// ── The draft of New repair and Edit (D149, D161 to D163) ──

export type DraftService = {
  /** The stored service's id, or a new uuid for a service added in the draft. */
  id: string;
  /** The stored service as the window opened with it; null for a service added in the draft. */
  stored: RepairService | null;
  /** The values it opened with; null for an added service. */
  initial: ServiceFormValues | null;
  values: ServiceFormValues;
  /** A stored service deleted in the draft; written as `deleted` = 1 on Save. */
  removed: boolean;
};
export type ServicesDraft = DraftService[];

/** The live services of a repair, in the list's order; null (New repair) gives an empty draft. */
export function servicesDraftFromRepair(repair: RepairListRow | null): ServicesDraft;
/** A new entry at the end. */
export function addDraftService(
  draft: ServicesDraft,
  id: string,
  values: ServiceFormValues,
): ServicesDraft;
/** New values for the entry with that id. */
export function updateDraftService(
  draft: ServicesDraft,
  id: string,
  values: ServiceFormValues,
): ServicesDraft;
/** An added entry is dropped; a stored entry is marked removed. */
export function removeDraftService(draft: ServicesDraft, id: string): ServicesDraft;
/**
 * True when the draft differs from what was stored: an added entry that is not removed, a removed
 * stored entry, or a stored entry whose fields changed (`changedServiceFields`).
 */
export function isServicesDraftChanged(draft: ServicesDraft): boolean;

/** What the table of a draft needs to name a bleacher and a category from their uuids. */
export type ServiceLookups = {
  bleacherNumber: (uuid: string) => number | null;
  categoryName: (uuid: string) => string | null;
};
/** Lookups made from the two lists (`#52` gives 52, `#?` gives null). */
export function serviceLookups(
  bleachers: readonly FilterOption[],
  categories: readonly FilterOption[],
): ServiceLookups;
/** The live entries of the draft as the rows of a table; `reported` is kept for a stored service. */
export function draftServiceRows(draft: ServicesDraft, lookups: ServiceLookups): RepairService[];
/**
 * The repair as the Edit window shows it: its services are the draft's, Labor, Parts, Tax and
 * Freight are their sums (null when none), and `totalCents` is the sum of the four sums when the
 * draft changed (0 when none remain) and the stored `cost_cents` when it did not (D163).
 */
export function repairWithServicesDraft(
  repair: RepairListRow,
  draft: ServicesDraft,
  lookups: ServiceLookups,
): RepairListRow;
/** The row the New repair window shows: the draft's values and services, nothing else (D149, D163). */
export function newRepairDisplayRow(input: {
  values: RepairFormValues;
  vendorName: string | null;
  draft: ServicesDraft;
  lookups: ServiceLookups;
}): RepairListRow;
```

`src/features/repairs/db/serviceWrite.ts` (new):

```ts
import type { CompiledQuery } from "kysely";
import type { ServiceFormErrors, ServiceFormValues, ServicesDraft } from "../utils/serviceForm";

export type CreateServiceInput = {
  id: string; // a new uuid, chosen by the caller
  repairId: string;
  values: ServiceFormValues;
  now: string; // an ISO timestamp: created_at
};
/** The insert of §2.5. Never writes `cost_cents` (D159). Built with the app's `db` (Kysely). */
export function buildCreateServiceStatement(input: CreateServiceInput): CompiledQuery;

export type UpdateServiceInput = {
  serviceId: string;
  initial: ServiceFormValues;
  values: ServiceFormValues;
};
/** The update of the changed columns only (D155); null when nothing changed. */
export function buildUpdateServiceStatement(input: UpdateServiceInput): CompiledQuery | null;

/** `deleted` = 1 on one service. */
export function buildDeleteServiceStatement(serviceId: string): CompiledQuery;

/**
 * The statements of a draft on Save, in the order of §2.6: the inserts of the added services (with
 * `created_at` = `now` plus the entry's index in milliseconds), the updates of the changed stored
 * services (changed columns only), `deleted` = 1 for the removed stored ones. Empty when the draft
 * is unchanged.
 */
export function buildServicesDraftStatements(input: {
  repairId: string;
  draft: ServicesDraft;
  now: string;
}): CompiledQuery[];

/**
 * Validates (`validateServiceForm`), writes one insert with `typedExecuteBatch`, and returns null when
 * written or the errors when nothing was written. A write error shows an `ErrorToast` (`saveFailed`
 * and the error text) and is thrown again.
 */
export function createService(
  input: Omit<CreateServiceInput, "id">,
): Promise<ServiceFormErrors | null>;
/** The same for an Edit. Nothing changed: nothing is checked and nothing is written. */
export function updateService(input: UpdateServiceInput): Promise<ServiceFormErrors | null>;
/** One update; a write error shows `deleteFailed` with the error text and is thrown again. */
export function deleteService(serviceId: string): Promise<void>;
```

`src/features/repairs/db/repairWrite.ts` (changed): `CreateRepairInput` and `UpdateRepairInput`
each gain `services?: ServicesDraft` (absent is an empty draft). `createRepair` writes
`[buildCreateRepairStatement(...), ...buildServicesDraftStatements(...)]` in one batch.
`buildUpdateRepairStatements` appends `buildServicesDraftStatements(...)` after the statements of
the fields and the status. `updateRepair` writes nothing and checks nothing when no field changed
and `isServicesDraftChanged` is false; the duplicate check still runs only when the vendor or the
number changed.

`src/features/repairs/components/ServiceForm.tsx` (new):

```ts
export type ServiceFormFieldsProps = {
  mode: "edit" | "new";
  values: ServiceFormValues;
  errors: ServiceFormErrors;
  bleachers: readonly SelectOption[];
  categories: readonly SelectOption[];
  currency: RepairCurrency; // the sign of the money inputs
  reportedDay: string | null; // the read-only line of Edit; null draws none
  disabled: boolean; // while Save runs
  onChange: <K extends ServiceFormField>(field: K, value: ServiceFormValues[K]) => void;
};

/** The id of the first input that carries an error, in the order the fields are drawn. */
export function firstServiceErrorFieldId(errors: ServiceFormErrors): string | null;

/** The inputs of the Edit and Add modes of the service window, with the error text under each. */
export function ServiceFormFields(props: ServiceFormFieldsProps): JSX.Element;
```

`src/features/repairs/components/ServiceWindow.tsx` (changed):

```ts
export type ServiceEditing = {
  /** The lists of the selects (D153). */
  bleachers: readonly FilterOption[];
  categories: readonly FilterOption[];
  /** Save of an Edit: null when written, the errors when nothing was written. */
  onSave: (
    initial: ServiceFormValues,
    values: ServiceFormValues,
  ) => Promise<ServiceFormErrors | null>;
  onDelete: () => Promise<void>;
};

// ServiceWindowProps gains:
//   editing?: ServiceEditing;  // given only to a role that may write, for a service that is not deleted
//                              // of a repair that is not deleted (D165); absent = spec 06's window
// ServiceWindowContentProps gains:
//   eyebrow?: string;          // default "Service"; "Edit service" in Edit mode
//   form?: ReactNode;          // replaces the fields and the amounts in Edit mode

export type NewServiceWindowProps = {
  repair: RepairListRow; // shown in the strip (in a draft, the repair as the window shows it)
  bleachers: readonly FilterOption[];
  categories: readonly FilterOption[];
  onCreate: (values: ServiceFormValues) => Promise<ServiceFormErrors | null>;
  onClose: () => void;
};
/** The window of Add service: the fields only, Cancel and "Add service" (D155). */
export function NewServiceWindow(props: NewServiceWindowProps): JSX.Element;

export type ServiceWindowFooterProps = {
  mode: "view" | "edit" | "new";
  saving: boolean;
  onEdit: () => void;
  onDelete: () => void;
  onCancel: () => void;
  onSave: () => void;
};
/** The footer of §2.1: a plain component so that a test can render it. */
export function ServiceWindowFooter(props: ServiceWindowFooterProps): JSX.Element;
```

`src/features/repairs/components/RepairServices.tsx` (changed): `RepairServicesBlockProps` and
`RepairWindowServicesProps` each gain `onAddService?: () => void`; with it, a button "Add service"
(test id `add-service`) is drawn under the table; without it nothing changes.

`src/features/repairs/components/RepairsTable.tsx` (changed): `RepairsTableProps` gains
`onAddService?: (repairId: string) => void`; the table gives the open block of a repair that is
not deleted `onAddService` for that repair.

`src/features/repairs/components/RepairWindow.tsx` (changed):

```ts
export type RepairEditing = {
  vendors: readonly FilterOption[];
  /** The lists of the service selects (D153). */
  bleachers: readonly FilterOption[];
  categories: readonly FilterOption[];
  /** Save of an Edit: the fields and the services draft (D161). */
  onSave: (
    initial: RepairFormValues,
    values: RepairFormValues,
    services: ServicesDraft,
  ) => Promise<RepairFormErrors | null>;
  onDelete: () => Promise<void>;
  onRestore: () => Promise<void>;
  /** Add service in view mode: the page opens the New service window (D158). */
  onAddService: () => void;
};

// RepairWindowContentProps gains:
//   onAddService?: () => void;  // passed to the table of services; absent = no button

export type NewRepairWindowProps = {
  vendors: readonly FilterOption[];
  bleachers: readonly FilterOption[];
  categories: readonly FilterOption[];
  onCreate: (values: RepairFormValues, services: ServicesDraft) => Promise<RepairFormErrors | null>;
  onClose: () => void;
};
```

`src/features/repairs/utils/repairDetails.ts` (changed): `WindowEntry` gains
`{ kind: "newService"; repairId: string }`; `ResolvedWindow` gains
`{ kind: "newService"; index: number; repair: RepairListRow }`; `sameWindow`, `openWindow`,
`closeFrom` and `resolveWindows` handle it (a `newService` entry of one repair equals another of
the same repair; it is left out when the repair is not in the rows or is deleted).

`RepairsPage` has no exported signature change; it builds the handlers of §2.8.

**Changed from earlier specs** (each is the old rule and what it becomes):

- **D43 and D84 (specs 04 and 06):** "Add service, Edit and Delete are not drawn" becomes "they
  are drawn for an administrator and a maintainer, as D158 and §2.1 say".
- **Spec 07 (the repair window and the service window have no footer for services):** the service
  window has the footer of §2.1 for those two roles and is unchanged for the others.
- **Spec 09a §0, §2.2 and §2.8** ("the New repair window draws the fields only", "in Edit mode the
  Services table stays read-only"): the New repair window draws the Services block with Add
  service (D149), and the Edit mode's table has Add service and a draft (D161).
- **Spec 09a §3:** `RepairEditing.onSave` gains the third argument `services`,
  `NewRepairWindowProps.onCreate` gains the second argument `services`, `RepairEditing` and
  `NewRepairWindowProps` gain `bleachers` and `categories`, and `CreateRepairInput` and
  `UpdateRepairInput` gain `services?`. The writers' behaviour for an empty draft is unchanged.
- **Spec 06 §2.5 and spec 07 §2.7** (the stack): it gains the `newService` entry.
- **The tests** that say so: §7 lists them.

## 4. Files

**New (counted, 3):**

- `src/features/repairs/utils/serviceForm.ts`
- `src/features/repairs/db/serviceWrite.ts`
- `src/features/repairs/components/ServiceForm.tsx`

**Changed (counted, 7):** `components/ServiceWindow.tsx` (the modes, the footer,
`NewServiceWindow`, the Delete and Discard dialogs), `components/RepairWindow.tsx` (the draft of
services in Edit and New repair, the nested service windows, Add service),
`components/RepairServices.tsx` (the Add service button), `components/RepairsTable.tsx`
(`onAddService` to the open block), `components/RepairsPage.tsx` (the handlers, the `newService`
window), `utils/repairDetails.ts` (the `newService` entry), `db/repairWrite.ts` (the services in
the two batches).

**Changed, not counted:** `src/features/userAccess/permissionPageData.ts` (§5) and its test.

**Tests (not counted):** `utils/serviceForm.test.ts`, `db/serviceWrite.test.ts`,
`components/ServiceForm.test.tsx` (new); `components/ServiceWindow.test.tsx`,
`components/RepairServices.test.tsx`, `components/RepairWindow.test.tsx`,
`components/RepairsTable.test.tsx`, `utils/repairDetails.test.ts`, `db/repairWrite.test.ts`,
`permissionPageData.test.ts` (changed). **10 counted files**, at the cap; one logic (the services
of a repair).

No migration, no `database.types.ts`, no `AppSchema.ts` change (every column exists), no sync
rule, no new package.

## 5. The permissions matrix (`permissionPageData.ts`, same commit)

**Checked, the rule is the page's, not the database's.** No role gains data. The writes are the
administrator's and the maintainer's, as everything else a repair can do (D165). The database
would also let an account manager write the services (§1); the page does not offer it, and the
matrix says so. The level of the administrator and the maintainer in "Repair Costs & Vendors"
becomes `custom` (D166); no other level changes.

**Edits in the row "Repairs & Maintenance":**

- The description: its last two sentences, "A repair's bleachers and files are still edited from
  the Dashboard, and its services cannot be added or edited yet.", become "They also add, edit and
  delete the services of a repair, from its open row, from its window and from the service window;
  a deleted service cannot be brought back. A repair's own list of bleachers and its files are
  still edited from the Dashboard: a service names a bleacher, but that does not change the
  repair's list of bleachers yet."
- The role notes. The administrator's last sentence, "On the Repairs page adds, edits, deletes and
  restores repairs, but not yet their services, bleachers or files.", becomes "On the Repairs page
  adds, edits, deletes and restores repairs, and adds, edits and deletes their services, but not
  yet their bleachers or files." The account manager's last sentence, "On the Repairs page sees
  every repair but cannot add, edit, delete or restore one, or change its status.", becomes "On
  the Repairs page sees every repair and its services but cannot add, edit, delete or restore one,
  change its status, or change its services." The viewer's is unchanged. The maintainer's last
  sentence becomes: "Uses the Repairs page to look repairs up, add them, edit their details,
  status and services, delete and restore them, and the Dashboard for their bleachers and files."

**Edits in the row "Repair Costs & Vendors":**

- The description: its last sentence, "The amounts, the services and the files cannot be edited
  yet.", becomes "The amounts are edited through the services: an administrator and a maintainer
  add, change and delete a service, with its bleacher, category, severity, description and its
  four amounts, and the total of the repair follows a moment later, when the server has added the
  services up. The total cannot be typed in, and the files cannot be edited yet."
- The role notes. The administrator's and the maintainer's level becomes `custom`, and the last
  clause of their note, "; the amounts are read-only.", becomes "; edits the amounts through the
  services, while the total is calculated and cannot be typed in." The account manager's and the
  viewer's are unchanged (level `read`).

`permissionPageData.test.ts` gets cases for the two new descriptions, the changed role notes and
the level `custom` of the two roles in the second row.

## 6. Behaviour scenarios (Playwright)

**None are written (D167).** The user's rule is that Playwright is not run here and, for this
spec, that the scenarios are not written either. The report marks E2E as **not written and not
run**. What the scenarios would have covered is covered at the level of the unit and component
tests of §7 (the rules, the statements run on SQLite, the markup of the fields and the footers,
the stack, the matrix); the whole path in a real browser with PowerSync (the selects and dialogs
in their portals, the nested windows of a draft, the focus on the first error, a new service in
the table, the Total coming back from the server, a draft saved with its repair, and a write
reaching the server) is **not checked by anyone**, and the report says so.

## 7. Tests (Vitest, written first)

All run in the node environment; tests are written first and seen failing (red) before the code.

- **`utils/serviceForm.test.ts`.**
  - `emptyServiceForm`: nothing chosen, empty text and amounts. `serviceFormFromRow`: the stored
    values, an amount as `1,260.00`, zero as `0.00`, an empty category and description as null and
    empty text.
  - `amountTextToCents`: `""`, `"0"`, `"1,260.00"`, `"1260"`, `"12.5"`, `"0.05"`.
    `centsToAmountText`: `126000`, `0`, `5`. `serviceFormCents`: the four amounts and their sum,
    an empty text as 0.
  - `normalizeDescription`: spaces only and empty give null; other text as typed.
  - `changedServiceFields` and `isServiceFormDirty`: nothing changed gives none and false; every
    field alone gives itself; `"1,260"` against `"1260.00"` and `""` against `"0.00"` are not
    changes; spaces-only description against empty is not a change; fields come in the order of
    the type.
  - `validateServiceForm`: no bleacher gives the bleacher error, no severity the severity error,
    both gives both, a category and amounts alone give none; a valid form gives `{}`.
    `clearedServiceFormErrors`: a change of a field clears its own error only; the same object
    when nothing is cleared.
  - `bleacherSelectOptions`: the list as it is; the service's own bleacher added when missing
    (`#52`, and `#?` without a number); no duplicate when it is in the list; no current bleacher
    adds nothing. `categorySelectOptions`: only active categories; the current one added when
    inactive or missing (then with `current.name`, or "Unknown"); no duplicate; the order of the
    input; "No category" is not an option.
  - The draft: `servicesDraftFromRepair` takes only the live services in the list's order and
    gives `[]` for null; `addDraftService` appends; `updateDraftService` changes only the entry
    with that id; `removeDraftService` drops an added entry and marks a stored one removed;
    `isServicesDraftChanged`: an empty draft, an untouched stored draft, an added entry that was
    removed again and a stored entry changed back to its values are all false; an added entry, a
    removed stored entry and a changed stored entry are true.
  - `serviceLookups`: `#52` gives 52, `#?` and an unknown uuid give null, a category name by uuid.
    `draftServiceRows`: removed entries are left out; the amounts, the total of a row, the
    bleacher number and the category name; `reported` kept for a stored service and empty for an
    added one. `repairWithServicesDraft`: the sums of the four amounts (null when no service),
    `totalCents` the sum when the draft changed (0 when none remain) and the stored value when it
    did not. `newRepairDisplayRow`: the vendor's name, the status and the currency of the values,
    the draft's services, no bleachers and no zone, a dash Total while the draft has no change.
- **`db/serviceWrite.test.ts`** (the harness of `repairStatusWrite.test.ts`: the app's Kysely
  compiled for SQLite and run on an in-memory `node:sqlite` shaped like the local database, with a
  `MaintenanceLineItems` table).
  - `buildCreateServiceStatement`: every column of §2.5 with its parameter; an empty category is
    NULL; a spaces-only description is NULL; empty amounts are 0; `created_at` is `now`; `deleted`
    is 0; `cost_cents` is not in the statement. Run on SQLite: the row exists and nothing else
    changes.
  - `buildUpdateServiceStatement`: null when nothing changed; only the changed columns are in the
    statement; `maintenance_event_uuid`, `created_at` and `deleted` never are; an amount typed in
    another form of the same number is not a change. Run on SQLite: only the changed columns of
    that service change; another service is untouched.
  - `buildDeleteServiceStatement`: `deleted` is 1 on one service only.
  - `buildServicesDraftStatements`: empty for an unchanged draft; an insert per added service with
    `created_at` in the order added (`now` plus the index in milliseconds); an update of the
    changed columns for a changed stored service; `deleted` = 1 for a removed stored one; nothing
    for an unchanged stored one. Run on SQLite with a draft that adds, changes and removes:
    exactly those rows change.
  - `createService`, `updateService`, `deleteService` (with `typedExecuteBatch` and the toast
    mocked): errors from validation are returned and nothing is written; a success calls the batch
    once and shows no toast; a write failure shows an `ErrorToast` with the message of §3 and
    rejects; an unchanged `updateService` writes nothing and does not validate.
- **`db/repairWrite.test.ts`** (changed): `createRepair` with a draft writes the repair insert
  first and then the services, in one batch; without a draft its statements are what they were;
  `updateRepair` with only a services change writes the services, runs no duplicate check and
  returns null; with no field change and no services change it writes nothing; with both it writes
  the repair's statements first and the services after; `buildUpdateRepairStatements` appends the
  services statements after the status statements.
- **`components/ServiceForm.test.tsx`** (`renderToStaticMarkup`): the labels and the values; an
  error text sits under Bleacher and Severity only; the Total is the live sum; the currency sign
  is `$` or `C$`; the Reported line is drawn only in Edit with a day; the inputs are disabled
  while `disabled`; "No category" is the first entry of its list.
- **`components/ServiceWindow.test.tsx`** (changed): `ServiceWindowFooter` draws Delete and Edit
  in view mode, Cancel and Save in Edit, Cancel and "Add service" in Add, "Saving..." and disabled
  while `saving`; `ServiceWindowContent` with `eyebrow` and `form` draws them; the window without
  `editing` has no footer (the spec 06 and 07 cases keep passing); a service marked Deleted has no
  footer even with `editing`.
- **`components/RepairServices.test.tsx`** (changed): the button "Add service" is drawn under the
  open block and under the table of the window when `onAddService` is given, also for a repair
  with no services, and not otherwise.
- **`components/RepairsTable.test.tsx`** (changed): the open block of a live repair has the button
  when the table gets `onAddService`; the open block of a deleted repair never has it.
- **`components/RepairWindow.test.tsx`** (changed): `RepairWindowContent` with `onAddService`
  draws the button; the New repair window draws the Services block with its button and the text
  "No services on this repair." for an empty draft, and no Files section.
- **`utils/repairDetails.test.ts`** (changed): a `newService` entry is opened, is the same as
  another of the same repair on the top (no double open) and different for another repair, closes
  with `closeFrom`, and is drawn by `resolveWindows` only while its repair is in the rows and is
  not deleted.
- **`permissionPageData.test.ts`:** the changed descriptions and role notes of §5, and the level
  `custom` of the administrator and the maintainer in "Repair Costs & Vendors".
- **A mutation check** (the habit of specs 03 to 09a): three rules are broken on purpose and the
  tests must fail: (1) an Edit of a service writes a column the person did not change; (2) a
  service removed in a draft writes nothing (the removal is ignored by `isServicesDraftChanged`
  and by the statements); (3) `createService` stops checking that a bleacher is chosen. The files
  are restored by their hash afterwards.

## 8. Edge cases and errors

- **Clerk and auth.** Every write is local and makes no network call, so a Clerk error does not
  reach it. The role comes from `useTeamPermissions`, as for the repair; while it is not known no
  button is drawn.
- **Offline** (D120, extended): a service, its edit and its deletion are written locally and shown
  at once; the server and the other people learn about them when the connection is back. The Total
  column does not change while offline (D159).
- **Deploy order.** The migration `20261117120000` and the sync rules of spec 02 must be on the
  server before any user can write a service. A write to a table or a column the server does not
  have fails with a code that is not in the connector's discard list (for example 42P01), so it is
  retried without end and the upload queue of that user waits; nothing is lost, but nothing
  reaches the server. The read-only database used for the facts of this spec does not have the
  migration yet.
- **The server refuses.** An amount outside the `integer` range (D154), or a trigger sum outside
  it, fails with class 22 and the connector discards the write with its general toast. For an
  administrator and a maintainer the database rules cannot refuse a `MaintenanceLineItems` write.
  A foreign key that fails (for example a bleacher deleted for good) is class 23 and is discarded
  the same way. The local row goes back to the server's state at the next sync.
- **One local transaction is not one server transaction** (§1). A draft saved with its repair is
  atomic on the device. On the server the operations arrive one by one: when one of the services
  is refused, the operations before it (the repair, the earlier services) have already been
  applied and the rest of that transaction is discarded, so the server can hold the repair with
  only some of its services. The device shows the server's state after the next sync.
- **Two people at once.** Each Save sends an update of the columns it wrote (D155); the later one
  to reach the server wins for a column both wrote. A service deleted by someone else while its
  window is open disappears from the list and the window is no longer drawn (spec 06 §2.5); an
  Edit draft of it is lost, and nothing was written by this person.
- **A service added or deleted by someone else while an Edit draft is open:** the draft holds the
  services as the window opened, so a service added meanwhile is not shown in that Edit window and
  is not touched by its Save; one deleted meanwhile is deleted again by a Save that removed it
  (harmless).
- **A repair that leaves the list while edited** (someone deleted it): the window and its draft
  are no longer drawn; the windows of its services go with it.
- **An old repair with an amount** (D160): the first service replaces the amount by the sum of the
  services when the server has added them up; a first service with all amounts 0 leaves the Total
  at $0.00. The old amount is not kept anywhere.
- **The last service deleted** (D156): the Total becomes $0.00 (the trigger); the repair stays in
  the list with no services.
- **A service whose bleacher is not in the repair's junction** (D148): the service shows in the
  services table; the Bleachers column and the Dashboard do not follow until 09b2.
- **A repair made in 09b1 with services:** it has no bleachers, no zone and no `cost_cents` until
  the server has added the services up; it is not on the Dashboard (D125, D148).
- **A category switched off** while a service uses it: the service keeps it and shows it; the
  select offers it while unchanged and never offers it to another service (D153).
- **A currency change in Edit** while services are in the draft: the money inputs and the sums
  show the new currency's sign at once; nothing is converted (maintenance-01 D5).
- **A draft and a reload:** a reload loses the draft (§2.6).
- **The width.** The service window stays 760 px; the form uses the canvas's two columns. The
  repair window is 1152 px (09a §11). Nobody has seen either in a browser (the Browser pane cannot
  run PowerSync, spec 04 D54).

## 9. Not in this spec

- **The repair's list of bleachers, its zone and the link to damage reports** (what a service does
  to the repair around it): spec 09b2. The user's answer to the question about old repairs, taken
  on 2026-11-21 while 09b1 was asked, is recorded for 09b2 and is not asked again: the old rows of
  the junction stay, so the junction is its current rows plus the bleachers of the services.
- **The files** (upload, delete, the draft's files in New repair): spec 09b3.
- **Restore of a service** (D157), **a warning before the first service of a repair with an
  amount** (D160), **a limit on an amount** (D154), **a check for two alike services** (D152).
- **Editing the Total** of a repair, a success message, an offline hint, an undo, a draft that
  survives a reload.
- **The Dashboard form** and the Damage Reports page's "resolve with maintenance" modal, which
  create repairs through `createMaintenanceEvent` and write the junction themselves. After 09b2
  the Dashboard form's Save can still replace the junction from its own list of bleachers; who
  changes that is not decided here.
- **Playwright scenarios** (D167) and a browser check.
- **The permissions spec 10** (the gates in general, the role specs and the last check of the
  matrix).

## 10. Definition of done

- `npm run tc` and `npx vitest run`, each with the real output and the exit code (Node 24 first in
  `PATH`).
- `npx prettier --check` on the files this spec touches only (the repo-wide `npm run lint` is red
  at baseline); the spec's Markdown is also checked for an inline code span that breaks a line.
- Playwright E2E: **not written (D167) and not run**; the report says so.
- The browser check is skipped (the Browser pane cannot run PowerSync); the report lists what
  nobody has seen: the selects and dialogs in their portals, the nested windows of a draft, the
  focus on the first error, the money inputs, a new service in the table, the Total coming back
  from the server, a draft saved with its repair, and the first write of an insert, an update and
  `deleted` on `MaintenanceLineItems` on real data.
- The matrix rows of §5 are edited in the same commit.
- The Ukrainian artifact of this spec is updated with the status and the result.
- The final report with real output: TS compilation, Vitest, E2E (not written, not run).

## 11. Result (2026-11-21)

- **Done as specified.** The Add service button (open row, repair window in view and in Edit mode, New
  repair), the service window with its footer, its Edit mode, Add service and the Delete and Discard
  dialogs, the three writers (`createService`, `updateService`, `deleteService`), the services draft of
  New repair and Edit saved in the batch of the repair, the `newService` window of the stack, and the
  matrix rows. 10 counted files (3 new: `utils/serviceForm.ts`, `db/serviceWrite.ts`,
  `components/ServiceForm.tsx`; 7 changed: `ServiceWindow.tsx`, `RepairWindow.tsx`,
  `RepairServices.tsx`, `RepairsTable.tsx`, `RepairsPage.tsx`, `repairDetails.ts`, `repairWrite.ts`) plus
  the matrix and the tests. No migration, no sync change, no change to the list query, to
  `useRepairList` or to `AppSchema.ts`.
- **Tests first.** Red run before any code: 10 files failed. Four suites could not import their module
  (`serviceForm.test.ts`, `serviceWrite.test.ts`, `ServiceForm.test.tsx` and the changed
  `repairWrite.test.ts`) and 23 tests failed in six changed files. Then green.
- **Checks (real output).** `npm run tc` exit 0. `npx vitest run` exit 0: 574 files, 8599 tests (before
  this spec 571 files and 8500 tests: +3 files, +99 tests). `prettier --check` clean on the 22 files this
  spec touches (the repo-wide check is red at baseline), and no inline code span of the spec breaks a
  line.
- **Mutation check.** Three rules were broken on purpose and the tests failed: an Edit of a service
  writing a column the person did not change (5 failing tests), a service removed in a draft writing
  nothing (5), `createService` no longer checking that a bleacher is chosen (3). The files were restored
  and checked by hash.
- **E2E:** not written (D167) and not run. **Browser check:** not done (the Browser pane cannot run
  PowerSync). Nobody has seen: the selects and dialogs in their portals, the service windows nested in
  the repair window, the focus on the first error, the money inputs, a new service in the table, the
  Total coming back from the server, a draft saved with its repair, and the first write of an insert, an
  update and `deleted` on `MaintenanceLineItems` on real data. The width of the 760 px window with the
  two-column form has not been seen either.
- **Extras against the spec text** (no behaviour of the spec changed):
  - `ServiceWindow.tsx` also exports `serviceIsEditable` (the rule of §2.1 that the window and a test
    share). `ServiceForm.tsx` also exports `focusServiceField` (the focus on the first error: the selects
    sit in a wrapper with an id, so it finds the control inside). `RepairWindow.tsx` also exports
    `RepairServicesSection` (the Services heading, the table and the button, used by the view mode, Edit
    and New repair, so that a test can render it) and keeps `DraftServiceWindows` internal.
  - `RepairEditing` also has `onOpenServiceReports` (the reports of a stored service of an Edit draft,
    which the page opens, §0). `RepairsPage` builds it with the others in `editingFor`.
  - `created_at` of the services of a draft counts the index among the added ones, so the first added
    service has exactly the moment of Save and the next ones one millisecond more each.
  - `buildCreateServiceStatement` throws when the bleacher or the severity is missing (the writers check
    them first, so a statement without them is a bug). `serviceWrite.ts` has its own small
    `showErrorToast` and `writeBatch`: `repairWrite.ts` imports `serviceWrite.ts`, so sharing the ones of
    `repairWrite.ts` would be a circular import.
  - In Edit mode of the repair window, the table and the service windows show the draft's currency, and
    the bleacher card of the service window in Edit follows the bleacher the form has chosen. The
    Category select reads "No category" in Edit and "Select a category" in Add while none is chosen.
  - Test ids: `add-service`, `service-window-footer`, `service-delete`, `service-edit`,
    `service-cancel`, `service-save`, `service-discard-dialog`, `service-delete-dialog`,
    `service-error-bleacher`, `service-error-severity`, `service-form-total`, `new-service-window`.
- **Not done.** Nothing is committed. The headers of specs 04 to 09a still say "uncommitted" and the plan
  still lists spec 09 as one spec (fix in a docs commit if told). `seed.sql`, `supabase/.temp/cli-latest`
  and `scripts/seed_add_on_conflict.py` stay out of every commit.
