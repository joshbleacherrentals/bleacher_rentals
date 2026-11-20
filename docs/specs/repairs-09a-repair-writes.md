# Repairs 09a: Edit, New repair, Delete and Restore of a repair

Status: **APPROVED and IMPLEMENTED 2026-11-20**, uncommitted (0 open decisions; D123 to D147 were
taken by the user in eight question batches; the results are in §11; no Playwright scenarios were
written (D147) and the browser check was not done). Build order: **09a of 11** (the plan's spec 09 is split in
two, D123). Needs: [repairs-01-design.md](repairs-01-design.md),
[repairs-02-sync-rules.md](repairs-02-sync-rules.md), [repairs-03-list-query.md](repairs-03-list-query.md),
[repairs-04-table.md](repairs-04-table.md), [repairs-05-toolbar.md](repairs-05-toolbar.md),
[repairs-06-expanded-row.md](repairs-06-expanded-row.md),
[repairs-07-repair-window.md](repairs-07-repair-window.md) and [repairs-08-status.md](repairs-08-status.md)
(all done and committed: 04 is 5280565b, 05 is 9567144a, 06 is 56f00da2, 07 is b9abca86, 08 is
bd586ad6; 06, 07 and 08 are not pushed). Needed by: 09b and the specs after it. Plan:
[repairs-plan.md](repairs-plan.md). Branch: `q4-sprint4-maintenance`.
Scope: **the repair window gets an Edit mode and a New repair mode, and the page gets a New repair
button. An administrator and a maintainer add a repair, edit its vendor, invoice number, status,
currency, repair days and notes, delete it, and restore a deleted one. Everything is written locally
(PowerSync), in one transaction per action. It changes clauses of D43 (no New repair button), of spec
07 (the repair window has no footer) and of spec 04 D67 (Restore as it was); §3 lists every one, and
the "Approved" of this spec approves them.** No migration, no sync change, no change to the list
query, to `useRepairList` or to the locked types of specs 03 and 05. The services (Add service, Edit,
Delete), the files, the bleachers and the zone of a repair, and the link from a repair to damage
reports are spec 09b.

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

**Decisions of this spec (user, 2026-11-20; eight question batches).**

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

**What follows from the design and from earlier decisions (no new decision).** Each item names its
source, so a reviewer can check it. The last item is wording only; it is listed so it can be
corrected, and no behaviour hangs on it.

- **The fixed name** (D18): New repair writes `event_name` = "Maintenance / Repair"; Edit never writes
  it. All 208 stored repairs already have that name. The Dashboard's old form can still change a name
  until spec 11; Edit leaves such a name as it is.
- **No Address field** (D18, D100): Save never writes `address_uuid`; New repair leaves it empty and an
  address a repair already has stays.
- **The owner and the creation moment** (D18): New repair writes `created_by_user_uuid` (the signed-in
  user's `Users.id`, from `useTeamPermissions().userId`) and `created_at` (the moment of Save); Edit
  never writes them. The database has a default for the owner, but a local row has no defaults, so
  the app writes both. When the user's id is not known yet the owner column is left out of the
  statement, and the database default fills it on the server.
- **Zone and Completed are read-only** (D18): Zone shows what spec 07 shows (D33), a new repair has no
  zone; Completed shows `completedOn`. `zone_uuid` is never written in 09a (D125). `completed_at` is
  written only through the status rules (D135).
- **Notes** (the old form wrote `notes || null`): a text of spaces only is saved as empty (NULL);
  any other text is saved as typed.
- **One way to change the status at a time** (spec 08): in view mode the pill menu works as it does;
  in Edit mode the Status field is the select and the menu is not drawn.
- **What the modes draw of the rest of the window** (the rule of D84 and D94, "only what works"): in
  Edit mode the Services table and the Files section stay as spec 07 draws them, read-only (no Add
  service, no file controls: 09b). The New repair window draws the fields only: no Services, no
  Files, no created line, no Bleachers and no Reported field. The canvas's "No services yet" text,
  Add service and file drop zone arrive with 09b.
- **Windows follow the data** (spec 06 §2.5): in view mode the window shows the newest values. In
  Edit mode the draft is not replaced by data arriving from sync. A window whose repair has left the
  list (someone else deleted it) is no longer drawn, and its draft with it (§8).
- **The title in Edit mode** is the title of the stored repair, not of the draft; the title of New
  repair is "New repair".
- **Where an error shows** (D138): after Save is pressed, not while typing.
- **Wording chosen by me** (presentation only): the texts of the errors and toasts (`REPAIR_FORM_MESSAGES`,
  §3), the buttons "Keep editing" and "Discard", "Saving..." on Save, the vendor line under the select
  in New repair ("The currency is filled from the vendor's country", as the canvas), and the test
  ids.

## 1. What the code has today (researched 2026-11-20)

- **The window.** `RepairWindow` (`components/RepairWindow.tsx`) is a Radix `Dialog` around
  `RepairWindowContent`: the fields, the services with a Total row and the files. It is read-only and
  has no footer. Its Status field is the menu of spec 08 for an allowed role. `onOpenChange(false)`
  (the cross, Esc, a click outside) calls `onClose`.
- **The stack.** `RepairsPage` keeps the windows as one stack of `WindowEntry` (`repair`, `service`,
  `reports`) and finds them again in the whole list on every render (`resolveWindows`); a window
  whose repair is no longer in the rows is not drawn.
- **The page header.** `PageHeader` has an `action` slot at the right; the Repairs page leaves it
  empty. The page's writes today: Restore (the old `setMaintenanceEventDeleted(id, false)`, which
  shows a green toast on success and a red one on failure) and `changeRepairStatus` (spec 08).
- **The old flows.** `createMaintenanceEvent` and `updateMaintenanceEvent` write through the Supabase
  client directly (address, event, junction, and on create the closing of reports); the form on the
  Dashboard (`MaintenanceEventForm`) and the Damage Reports page's "resolve with maintenance" modal use
  them. `setMaintenanceEventDeleted` is the local soft delete the Dashboard form also calls. None of
  them is used or changed by this spec. The old form required a name, both dates and one bleacher, and
  carried an owner select and sub-rental date limits; none of that comes over (D18, D125).
- **Who may write (policies read from the database on 2026-11-20, and the migrations).**
  - `MaintenanceEvents` and `BleacherMaintEvents`: read for admin, account_manager, viewer and
    maintainer; insert, update and delete for admin, account_manager and maintainer. The "account
    manager edits only their own" rule was dropped from the database (migrations `20260617200000`
    and `20260923140000`); it lives only in the matrix text.
  - `MaintenancePhotos`: all four operations for admin, account_manager and maintainer.
    `MaintenanceLineItems` (migration `20261117120000`, not yet on the database the read-only
    connector reaches): read for the four roles, write for the three.
  - The `maintenance-photos` bucket policies check only the bucket, not a role.
  - `Vendors`: the migration lets admin, account_manager, accountant and maintainer read; the web sync
    gives the viewer `Vendors` as well (spec 02 D21), and a local read is not a database rule.
  - So everything 09a writes (`MaintenanceEvents` rows) is inside what an administrator and a
    maintainer may do. The page's gate (D124) is narrower than the database, as in D110.
- **The unique index.** `MaintenanceEvents_vendor_invoice_uniq` is unique on the pair vendor and
  invoice number, where both are not null and `deleted = false`, on the exact text. A violation is
  `23505`: the connector discards the rest of the transaction and shows a general toast (spec 08 §1),
  and the local row goes back to the server's value at the next sync. So the app checks first (D137),
  and Restore can violate it too (D145).
- **Triggers.** `trg_sync_maintenance_cost_per_year` (after insert, update, delete on
  `MaintenanceEvents`) recomputes the yearly sum of `cost_cents` for the old and the new year of
  `event_start`; the sum has no `deleted` filter, so a soft delete does not change it. The trigger on
  `MaintenanceLineItems` recomputes `cost_cents` from the services (09b). Nothing sets `completed_at`
  on the server.
- **How a local write is made** (`docs/POWERSYNC_ARCHITECTURE.md`, `src/lib/powersync/typedQuery.ts`):
  Kysely `db`, `.compile()`, then `typedExecute` or `typedExecuteBatch` (one local transaction); ids
  from `crypto.randomUUID()`; booleans as `0` and `1`; `created_at` written by the app (a local row
  has no database defaults, as the roadmap writes do). `typedGetAll(compiled, expect<T>())` is the
  one-time read.
- **Parts that exist.** `SearchableSelect` (a Popover with a Command list: `options`, `selected`,
  `onSelect`), `Dropdown`, `AlertDialog`, `Dialog`, `useRepairFilterOptions` (every vendor with an
  `inactive` flag), `buildVendorAddressQuery` (the vendor's city, state and country),
  `changeRepairStatus` and `buildStatusStatements` (spec 08).
- **The data** (read-only connector, 2026-11-20; it lacks the new migrations): 208 repairs, 192 live;
  all named "Maintenance / Repair"; 46 have an amount. `Addresses.country` is `US` (402), `CA` (286)
  or empty (5919). Locally (spec 07): 44 vendors, none with an address.
- **The matrix.** The rows "Repairs & Maintenance" and "Repair Costs & Vendors" carry the sentences of
  spec 08 (§5 gives the exact text and what it becomes).
- **Tests that exist.** `RepairWindow.test.tsx`, `repairDetails.test.ts`, `permissionPageData.test.ts`
  and the SQLite harness of `db/repairStatusWrite.test.ts` (the app's Kysely compiled for SQLite and
  run on an in-memory `node:sqlite`).

## 2. The behaviour

### 2.1 Who gets what (D124, D141, D145)

- `RepairsPage` gives the windows and the table the write handlers only when
  `canManageDamageAndMaintenance({ isAdmin, isMaintainer })` is true (`canManage`). For every other
  role nothing changes: no New repair button, no footer in the repair window, no Restore.
- **New repair button:** in the `action` slot of `PageHeader`, label "New repair", drawn when
  `canManage`, in the Show Deleted view too (D141).
- **The footer of the repair window** (D128, D143, D145), only with the write handlers:
  - a live repair in view mode: Delete (red, at the left) and Edit (at the right);
  - a deleted repair: Restore (at the right); no Edit and no Delete (D145);
  - Edit mode and New repair: Cancel and Save ("Add repair" in New repair).
- The service window and the damage report window do not change.

### 2.2 The modes of the repair window (D128, D129)

- **View to Edit.** Edit copies the repair into a draft: `initial = repairFormFromRow(repair)` and
  `values = initial`. The eyebrow reads "Edit repair"; the Status pill menu is replaced by the select.
  The Services table and the Files section stay read-only (§0, "what the modes draw").
- **New repair.** The page opens `NewRepairWindow` with `emptyRepairForm()`: Status Inbound, Currency
  USD, no vendor, empty dates and notes. The eyebrow and the title read "New repair".
- **Leaving.** Cancel leaves at once. The cross, Esc and a click outside call `requestClose`: when
  `isRepairFormDirty(initial, values)` is true they open the dialog "Discard changes?" (Keep editing,
  Discard); otherwise they close the window (New repair) or return to view mode (Edit) at once. Discard
  does what Cancel does.
- **The draft belongs to the window.** It lives in the window's React state and is lost on a reload or
  when the window is no longer drawn. A service window opened from the repair window (the table of
  services is clickable) opens over it and the draft stays.

### 2.3 The fields (D130 to D133, D136)

- **Vendor:** `SearchableSelect` with the options of `vendorSelectOptions` and a first entry "No
  vendor" (D131). In New repair a line under it reads "The currency is filled from the vendor's
  country". Choosing a vendor in New repair reads that vendor's country once and applies
  `nextCurrencyForVendor` (D133).
- **Invoice #:** a text input, placeholder "e.g. DTR-2377" (canvas). Error: the duplicate message
  (D137, D138).
- **Status:** `Dropdown` with the six statuses in the order of the course (D74), labelled by
  `statusPill`. New repair starts at Inbound.
- **Currency:** `Dropdown` with USD and CAD. A pick by hand sets "touched" for the window (D133).
- **Repair from, Repair to:** date inputs (D136). Errors: required, and the order message under
  Repair to.
- **Zone:** read-only text (D33): the zones of the repair, one per line, or a dash; in New repair the
  canvas's "Set from the bleachers".
- **Completed:** read-only text: the day, or a dash; in New repair a dash.
- **Notes:** a textarea, placeholder "Notes about the repair" (canvas).
- While Save runs, every input is disabled and Save reads "Saving...".

### 2.4 Validation and Save (D130, D134 to D139)

1. Save pressed. When the form has changed nothing (Edit), the window returns to view mode and
   nothing is written. (New repair is never "unchanged": the dates are required.)
2. `validateRepairForm(values)` checks the dates: Repair from empty, Repair to empty, Repair to
   before Repair from (equal days are fine).
3. The duplicate check (D137) runs when a vendor and a number are both present and, in Edit, only
   when the vendor or the number was changed: `findInvoiceDuplicate` reads the local database. A
   record that was already a near-duplicate is therefore not a reason to refuse an unrelated edit.
4. When any check fails, nothing is written. The errors are shown under their fields (D138), the first
   field with an error gets focus, and the window stays in Edit.
5. Otherwise the statements of §2.5 run in one `typedExecuteBatch`. On success an Edit returns to view
   mode and a New repair closes the window (D128), with no toast (D140). On a write error the red
   toast of D139 shows and the window stays in Edit.

### 2.5 What is written (D125, D127, D132, D134, D135)

- **Add repair:** one insert into `MaintenanceEvents`:
  - `id` (a new uuid), `event_name` ("Maintenance / Repair"), `event_start`, `event_end`;
  - `vendor_uuid` and `invoice_number` (normalized; empty is NULL), `status`, `currency`, `notes`
    (empty is NULL);
  - `completed_at` = the moment of Save when the status is Completed, otherwise NULL;
  - `created_by_user_uuid` (when known), `created_at` (the moment of Save), `deleted` = 0.
  - **Not written:** `cost_cents`, `zone_uuid`, `address_uuid`; no `BleacherMaintEvents` row, no
    `MaintenanceLineItems` row, no `DamageReports` statement (D125, D127, D132).
- **Save of Edit** (one batch, in this order):
  1. One update of the changed columns among `vendor_uuid`, `invoice_number`, `currency`,
     `event_start`, `event_end` and `notes`; left out when none of them changed. `status` and
     `completed_at` are not in it.
  2. When the person picked another status (`initial.status` differs from `values.status`): the
     statements of `buildStatusStatements` of spec 08, called with the repair's id, `liveStatus` as
     `from`, the chosen status as `to`, the repair's `reported` list and `now`: the repair's `status`
     and `completed_at`, and the reports when the move is into Completed. `liveStatus` is the status
     the list shows at the moment of Save; when it already equals the chosen status, nothing is
     written for the status.
  - Never written by an Edit: `event_name`, `cost_cents`, `zone_uuid`, `address_uuid`,
    `created_by_user_uuid`, `created_at`, `deleted`, the junction, the services.
- **Delete and Restore:** one update, `deleted` = 1 or 0 (§2.6).

### 2.6 Delete and Restore (D143 to D145)

- **Delete:** the footer button opens the `AlertDialog` of D143. Continue runs `deleteRepair`: one
  update, `deleted` = 1. Services, files, junction and reports stay (D144), so Restore brings the
  repair back whole. A write error shows a red toast ("Failed to delete the repair.") and nothing
  changes. After Delete the repair is no longer in the live list, so the repair window is not drawn
  (spec 06 §2.5); the page does not close anything itself.
- **Restore:** the row button and the window button call `restoreRepair` with the repair's id, vendor
  and invoice number. It runs the duplicate check of D137 against the live repairs; when a live
  repair has the same pair it shows the red toast of D145 and writes nothing. Otherwise one update,
  `deleted` = 0. A write error shows "Failed to restore the repair." After Restore the repair leaves
  the Show Deleted list and its window is no longer drawn.
- Neither shows a green toast (D140).

### 2.7 What a person sees (D140, D142)

- A saved Edit returns to view mode with the new values. An Add repair closes the window; the page's
  tab, page, search and filters do not change (D142). A Delete or a Restore makes the repair leave the
  list it was in. Nothing says "saved".
- Offline (D120, as for the status): the write goes to the local database at once and to the server
  when the connection is back. Nothing on the page says the connection is missing.

### 2.8 The page (D126, D141)

- The stack gets a kind `new`: `{ kind: "new" }`. The New repair button opens it; it closes with Cancel,
  Discard, Add repair or the cross. Opening it twice on the top of the stack changes nothing.
- `RepairsPage` builds the handlers (the `now` of each is one reading of the clock):
  - `onCreate(values)` calls `createRepair` with `createdByUserUuid` from `useTeamPermissions`;
  - `onSave(initial, values)` calls `updateRepair` with the repair's id, the live status and the
    repair's `reported` list (the repair as the page holds it at that render);
  - `onDelete` calls `deleteRepair`; `onRestore` and the row's Restore call `restoreRepair`. Each is
    called as `void …catch(() => {})`: the writers show their own error toasts.
- The vendor options come from `useRepairFilterOptions` (`options.vendor`), already on the page.

## 3. Types and signatures (locked; changing them needs a new "Approved")

`src/features/repairs/utils/repairForm.ts` (new, pure):

```ts
import type { FilterOption } from "./repairFilters";
import type { RepairCurrency, RepairListRow, RepairStatus } from "./repairRows";

/** The fixed event name of a repair made here (D18). */
export const REPAIR_EVENT_NAME = "Maintenance / Repair";

export type RepairFormValues = {
  vendorUuid: string | null;
  invoiceNumber: string; // as typed
  status: RepairStatus;
  currency: RepairCurrency;
  eventStart: string; // YYYY-MM-DD, "" while empty
  eventEnd: string; // YYYY-MM-DD, "" while empty
  notes: string; // as typed
};
export type RepairFormField = keyof RepairFormValues;

/** New repair: Inbound, USD, no vendor, empty text and dates (D18, D136). */
export function emptyRepairForm(): RepairFormValues;
/** The values of a repair as the window opens it; empty text for an empty column. */
export function repairFormFromRow(row: RepairListRow): RepairFormValues;

/** Trimmed; empty is null; the case is kept (D137). */
export function normalizeInvoiceNumber(text: string | null | undefined): string | null;
/** `normalizeInvoiceNumber` in lower case: the key two numbers are compared by (D137). */
export function invoiceNumberKey(text: string | null | undefined): string | null;
/** Spaces only is null; any other text as typed. */
export function normalizeNotes(text: string | null | undefined): string | null;

/**
 * The fields that differ, in the order of the type, compared after normalizing the invoice number
 * and the notes (D134). `vendorUuid`, `status`, `currency` and the dates compare as they are.
 */
export function changedRepairFields(
  initial: RepairFormValues,
  current: RepairFormValues,
): RepairFormField[];
export function isRepairFormDirty(initial: RepairFormValues, current: RepairFormValues): boolean;

export type RepairFormErrors = { eventStart?: string; eventEnd?: string; invoiceNumber?: string };

export const REPAIR_FORM_MESSAGES: {
  eventStartRequired: "Repair from is required.";
  eventEndRequired: "Repair to is required.";
  eventEndBeforeStart: "Repair to must not be before Repair from.";
  invoiceDuplicate: "This vendor already has a repair with this invoice number.";
  restoreDuplicate: "A live repair already has this invoice number for this vendor.";
  saveFailed: "Failed to save the repair.";
  deleteFailed: "Failed to delete the repair.";
  restoreFailed: "Failed to restore the repair.";
};

/** The checks that need no database: both days present, the order (D130, D136). */
export function validateRepairForm(values: RepairFormValues): RepairFormErrors;

/** `CA` gives CAD, `US` gives USD (trimmed, any case); anything else is null (D133). */
export function currencyForCountry(country: string | null | undefined): RepairCurrency | null;
/** The currency after a vendor is chosen: changed only while untouched and the country is known. */
export function nextCurrencyForVendor(params: {
  current: RepairCurrency;
  touched: boolean;
  country: string | null;
}): RepairCurrency;

export type VendorSelectOption = { value: string; label: string };
/**
 * The active vendors, plus the repair's own vendor (`current`) even when inactive or not in the list
 * yet (then labelled with `current.name`); in the order of `vendors` (D131). "No vendor" is not an
 * option here: the select draws it.
 */
export function vendorSelectOptions(
  vendors: readonly FilterOption[],
  current: { uuid: string | null; name: string | null },
): VendorSelectOption[];
```

`src/features/repairs/db/repairWrite.ts` (new):

```ts
import type { CompiledQuery } from "kysely";
import type { RepairFormErrors, RepairFormValues } from "../utils/repairForm";
import type { ReportedReport } from "../utils/repairRows";

export type CreateRepairInput = {
  id: string; // a new uuid, chosen by the caller
  values: RepairFormValues;
  createdByUserUuid: string | null;
  now: string; // an ISO timestamp: created_at, and completed_at for a Completed repair
};
/** The insert of §2.5. Built with the app's `db` (Kysely). */
export function buildCreateRepairStatement(input: CreateRepairInput): CompiledQuery;

export type UpdateRepairInput = {
  repairId: string;
  initial: RepairFormValues;
  values: RepairFormValues;
  liveStatus: string; // the status the list shows at Save (the `from` of spec 08)
  reported: readonly ReportedReport[];
  now: string;
};
/** The statements of §2.5 for an Edit, in order; empty when no field changed. */
export function buildUpdateRepairStatements(input: UpdateRepairInput): CompiledQuery[];

/** `deleted` = 1 or 0 on one repair. */
export function buildSetDeletedStatement(repairId: string, deleted: boolean): CompiledQuery;

export type InvoiceDuplicateQuery = {
  vendorUuid: string | null;
  invoiceNumber: string | null;
  excludeRepairId: string | null;
};
/** The read of D137; null when there is no vendor or no number (nothing to compare). */
export function buildInvoiceDuplicateQuery(query: InvoiceDuplicateQuery): CompiledQuery | null;
/** Runs it with `typedGetAll`: true when a live repair has the same vendor and number. */
export function findInvoiceDuplicate(query: InvoiceDuplicateQuery): Promise<boolean>;

/** The vendor's country (`Addresses.country`) for D133, or null; one local read. */
export function readVendorCountry(vendorUuid: string): Promise<string | null>;

/**
 * Validates (`validateRepairForm`, then the duplicate check), writes in one `typedExecuteBatch`, and
 * returns null when written or the errors when nothing was written. A write error shows an
 * `ErrorToast` (`saveFailed` and the error text) and is thrown again.
 */
export function createRepair(
  input: Omit<CreateRepairInput, "id">,
): Promise<RepairFormErrors | null>;
export function updateRepair(input: UpdateRepairInput): Promise<RepairFormErrors | null>;

/** One update; a write error shows `deleteFailed` with the error text and is thrown again. */
export function deleteRepair(repairId: string): Promise<void>;
/**
 * The duplicate check, then one update. "duplicate": the red toast of D145 was shown and nothing
 * was written. A write error shows `restoreFailed` with the error text and is thrown again.
 */
export function restoreRepair(input: {
  repairId: string;
  vendorUuid: string | null;
  invoiceNumber: string | null;
}): Promise<"restored" | "duplicate">;
```

`src/features/repairs/components/RepairForm.tsx` (new):

```ts
export type RepairFormFieldsProps = {
  mode: "edit" | "new";
  values: RepairFormValues;
  errors: RepairFormErrors;
  vendors: readonly VendorSelectOption[];
  zones: readonly { uuid: string; name: string | null }[]; // read-only; empty in New repair
  completedOn: string | null; // read-only
  disabled: boolean; // while Save runs
  onChange: <K extends RepairFormField>(field: K, value: RepairFormValues[K]) => void;
};

/** The inputs of the Edit and New repair modes, with the error text under each field. */
export function RepairFormFields(props: RepairFormFieldsProps): JSX.Element;
```

`src/features/repairs/components/RepairWindow.tsx` (changed):

```ts
export type RepairEditing = {
  /** Every vendor, for the Vendor select (D131). */
  vendors: readonly FilterOption[];
  /** Save of an Edit: null when written, the errors when nothing was written (D138). */
  onSave: (initial: RepairFormValues, values: RepairFormValues) => Promise<RepairFormErrors | null>;
  onDelete: () => Promise<void>;
  onRestore: () => Promise<void>;
};

// RepairWindowProps gains:
//   editing?: RepairEditing;   // given only to a role that may write (D124); absent = spec 07's window
// RepairWindowContentProps gains:
//   eyebrow?: string;          // default "Repair"; "Edit repair" in Edit mode
//   fields?: ReactNode;        // replaces the fields grid in Edit mode

export type NewRepairWindowProps = {
  vendors: readonly FilterOption[];
  onCreate: (values: RepairFormValues) => Promise<RepairFormErrors | null>;
  onClose: () => void;
};
/** The window of New repair: the fields only, Cancel and Add repair (D128, D129). */
export function NewRepairWindow(props: NewRepairWindowProps): JSX.Element;

export type RepairWindowFooterProps = {
  mode: "view" | "edit" | "new";
  deleted: boolean;
  saving: boolean;
  onEdit: () => void;
  onDelete: () => void;
  onRestore: () => void;
  onCancel: () => void;
  onSave: () => void;
};
/** The footer of §2.1: a plain component so that a test can render it. */
export function RepairWindowFooter(props: RepairWindowFooterProps): JSX.Element;
```

`src/features/repairs/utils/repairDetails.ts` (changed): `WindowEntry` gains `{ kind: "new" }`;
`ResolvedWindow` gains `{ kind: "new"; index: number }`; `sameWindow`, `openWindow`, `closeFrom` and
`resolveWindows` handle it (a `new` entry is always drawn and is the same as another `new`).

`RepairsPage` has no exported signature change; it passes `editing` to `RepairWindow` and draws
`NewRepairWindow` for the `new` entry, and the New repair button in `PageHeader`'s `action`.

**Changed from earlier specs** (each is the old rule and what it becomes):

- **D43 (spec 04):** "no New repair button" becomes "the button is drawn for an administrator and a
  maintainer, also in Show Deleted (D126, D141)".
- **Spec 07 §2.7** ("the repair window is read-only, with no footer, no Edit, no Delete") becomes "the
  window has the footer of §2.1 for those two roles and is unchanged for the others (D124)".
- **D41 and D67 (specs 04 and 05)** ("Restore stays as it is until spec 09") end here: the row's
  Restore runs `restoreRepair` (the duplicate check of D137, no green toast), and the window of a
  deleted repair has a Restore too (D145). The old `setMaintenanceEventDeleted` is no longer used by
  the Repairs page; it stays for the Dashboard.
- **Spec 06 §2.5** (the stack): it gains the `new` entry.
- **Spec 08 §9** (the open question): the Status select of Edit calls the same writer (D135).
- **The tests** that say so: §7 lists them.

## 4. Files

**New (counted, 3):**

- `src/features/repairs/utils/repairForm.ts`
- `src/features/repairs/db/repairWrite.ts`
- `src/features/repairs/components/RepairForm.tsx`

**Changed (counted, 3):** `components/RepairWindow.tsx` (the Edit mode, `NewRepairWindow`,
`RepairWindowFooter`, the Discard and Delete dialogs), `components/RepairsPage.tsx` (the button, the
handlers, the new window), `utils/repairDetails.ts` (the `new` entry).

**Changed, not counted:** `src/features/userAccess/permissionPageData.ts` (§5) and its test.

**Tests (not counted):** `utils/repairForm.test.ts`, `db/repairWrite.test.ts`,
`components/RepairForm.test.tsx` (new); `components/RepairWindow.test.tsx`,
`utils/repairDetails.test.ts`, `permissionPageData.test.ts` (changed). **6 counted files**, under the
cap of 10; one logic.

No migration, no `database.types.ts`, no `AppSchema.ts` change (every column exists), no sync rule,
no new package.

## 5. The permissions matrix (`permissionPageData.ts`, same commit)

**Checked, the rule is the page's, not the database's.** No role gains data. The writes are the
administrator's and the maintainer's, as Restore and the status menu are (D124). The database would
also let an account manager write (§1), and the matrix has said an account manager edits only their
own repairs; this spec leaves the account manager out on the Repairs page and says so in the matrix.
The levels do not change in either row (D146).

**Edits in the row "Repairs & Maintenance":**

- The description: its last sentence, "For now the Repairs page lists repairs and, for an
  administrator or a maintainer, shows and restores deleted ones and changes the status of a repair,
  in its row or in its window; the rest of a repair is edited from the Dashboard until the repair
  window can edit.", becomes "On the Repairs page an administrator or a maintainer adds a repair,
  edits its vendor, invoice number, status, currency, repair days and notes in its window, changes
  its status from the pill in a row, deletes it, and shows and restores deleted ones. A repair's
  bleachers and files are still edited from the Dashboard, and its services cannot be added or
  edited yet."
- The role notes. The administrator's gets at its end: "On the Repairs page adds, edits, deletes and
  restores repairs, but not yet their services, bleachers or files." The account manager's last
  sentence, "Does not get the status menu on the Repairs page.", becomes "On the Repairs page sees
  every repair but cannot add, edit, delete or restore one, or change its status." The viewer's is
  unchanged. The maintainer's last sentence becomes: "Uses the Repairs page to look repairs up, add
  them, edit their details and status, delete and restore them, and the Dashboard for their bleachers
  and files."

**Edits in the row "Repair Costs & Vendors":**

- The description: its last three sentences, from "The status is the one thing the page changes" to
  "Nothing else on the page can be edited yet.", become "An administrator and a maintainer can add a
  repair and, in the repair window, change its vendor, invoice number, status, currency, repair days
  and notes; the status can also be changed from the pill in a row. Moving a repair into Completed
  records the moment it was completed and closes the damage reports found for it, which then leave
  the drivers' phones; moving it out of Completed clears that moment and leaves the reports closed.
  The amounts, the services and the files cannot be edited yet."
- The role notes (the level stays `read` for all four). The administrator's and the maintainer's last
  sentence, "Changes the status from the pill.", becomes "Changes the status from the pill, adds
  repairs, and edits their vendor, invoice number, currency, days and notes in the window; the amounts
  are read-only." The account manager's and the viewer's are unchanged.

`permissionPageData.test.ts` gets cases for the two new descriptions and the changed role notes.

## 6. Behaviour scenarios (Playwright)

**None are written (D147).** The user's rule is that Playwright is not run here and, for this spec,
that the scenarios are not written either. The report marks E2E as **not written and not run**. What
the scenarios would have covered is covered at the level of the unit and component tests of §7 (the
rules, the statements run on SQLite, the markup of the fields and the footer, the matrix); the whole
path in a real browser with PowerSync (the dialogs and the select in their portals, the focus on the
first error, the date inputs, a new repair appearing in the list, a delete and a restore reaching the
server) is **not checked by anyone**, and the report says so.

## 7. Tests (Vitest, written first)

All run in the node environment; tests are written first and seen failing (red) before the code.

- **`utils/repairForm.test.ts`.**
  - `emptyRepairForm`: Inbound, USD, no vendor, empty text and dates. `repairFormFromRow`: empty
    columns become empty text, the status and currency are the row's.
  - `normalizeInvoiceNumber`: spaces trimmed, empty and spaces-only give null, the case kept.
    `invoiceNumberKey`: `" JJ-5 "` and `"jj-5"` give the same key; null stays null.
    `normalizeNotes`: spaces-only gives null, other text is returned as typed.
  - `changedRepairFields` and `isRepairFormDirty`: nothing changed gives none and false; every field
    alone gives itself; a change of spaces around the invoice number, or of empty notes to
    spaces-only notes, is not a change; fields come in the order of the type.
  - `validateRepairForm`: both days empty gives both errors; Repair to before Repair from gives the
    order error on `eventEnd`; equal days give none; a valid form gives `{}`.
  - `currencyForCountry`: `CA`, `ca`, `" US "`; `Canada`, empty and null give null.
    `nextCurrencyForVendor`: changes only when not touched and the country is known; a touched
    window and an unknown country keep the current value.
  - `vendorSelectOptions`: only active vendors; the current vendor is added when inactive or missing
    (then with `current.name`); no duplicate when it is already active; the order of the input; no
    current vendor adds nothing.
- **`db/repairWrite.test.ts`** (the harness of `repairStatusWrite.test.ts`: the app's Kysely compiled
  for SQLite and run on an in-memory `node:sqlite` shaped like the local database).
  - `buildCreateRepairStatement`: every column of §2.5 with its parameter; `completed_at` is the
    moment only for Completed; empty vendor, number and notes are NULL; the number is trimmed;
    `cost_cents`, `zone_uuid` and `address_uuid` are not in the statement; `created_by_user_uuid` is
    left out when null. Run on SQLite: the row exists with `deleted` = 0 and nothing else changes.
  - `buildUpdateRepairStatements`: nothing changed gives an empty list; only the changed columns are
    in the first statement; a status change adds the statements of spec 08 (Completed: `completed_at`
    and the reports with `resolved_at IS NULL`; out of Completed: `completed_at` cleared, no reports
    statement); `liveStatus` equal to the chosen status adds nothing for the status; a column the
    person did not change is not in any statement. Run on SQLite: only the changed columns of that
    repair change; another repair and the reports not in the list are untouched.
  - `buildSetDeletedStatement`: `deleted` 1 and 0, one repair.
  - `buildInvoiceDuplicateQuery` and `findInvoiceDuplicate` on SQLite: the same vendor and number
    with other case or spaces is a duplicate; a deleted repair is not; the repair itself is not; the
    same number for another vendor is not; no vendor or no number gives null and false.
  - `createRepair`, `updateRepair`, `deleteRepair`, `restoreRepair` (with `typedExecuteBatch`,
    `typedGetAll` and the toast mocked): errors from validation or from a duplicate are returned and
    nothing is written; a success calls the batch once and shows no toast; a write failure shows an
    `ErrorToast` with the message of §3 and rejects; `restoreRepair` finding a duplicate shows the
    toast of D145, writes nothing and returns "duplicate"; an unchanged Edit writes nothing and does
    not run the duplicate check; an Edit that changed neither vendor nor number does not run it.
- **`components/RepairForm.test.tsx`** (`renderToStaticMarkup`): the labels and the values of the
  inputs; an error text sits under each of the three fields that can carry one and nowhere else;
  Zone and Completed are text, not inputs; New repair shows "Set from the bleachers" and the vendor
  line; disabled inputs while `disabled`; the date inputs are `type="date"`.
- **`components/RepairWindow.test.tsx`** (changed): `RepairWindowFooter` draws Delete and Edit in
  view mode of a live repair, Restore only for a deleted one, Cancel and Save for Edit and Cancel and
  "Add repair" for New repair, "Saving..." and disabled while `saving`; `RepairWindowContent` with
  `eyebrow` and `fields` draws them; the window without `editing` has no footer (the spec 07 case
  keeps passing); the pill menu is not drawn when `fields` is given.
- **`utils/repairDetails.test.ts`** (changed): a `new` entry is opened, is the same as another `new`
  on the top (no double open), closes with `closeFrom`, and is drawn by `resolveWindows` with no
  repair behind it.
- **`permissionPageData.test.ts`:** the changed descriptions and the role notes of §5.
- **A mutation check** (the habit of specs 03 to 08): three rules are broken on purpose and the tests
  must fail: (1) the duplicate check stops ignoring case and spaces; (2) an Edit writes a column the
  person did not change; (3) Restore stops running the duplicate check. The files are restored by
  their hash afterwards.

## 8. Edge cases and errors

- **Clerk and auth.** Every write is local and makes no network call, so a Clerk error does not reach
  it. The role comes from `useTeamPermissions`, as for Restore and the status menu; while it is not
  known no button is drawn. A New repair made before the user's id is known leaves the owner column
  out (§0).
- **Offline** (D120, extended): the repair, its edit, its deletion or its restoring is written locally
  and shown at once; the server, the other people and the Dashboard learn about it when the
  connection is back.
- **The server refuses.** For an administrator and a maintainer the database rules cannot refuse a
  `MaintenanceEvents` write. A duplicate made on another device in the same minutes passes the local
  check and fails at the server with `23505`: the connector shows its general toast and discards it;
  an insert that is discarded disappears from the list at the next sync, with the person's work in it.
  The check cannot close that window.
- **Two people at once.** Each Save sends an update of the columns it wrote (D134); the later one to
  reach the server wins for a column both wrote. A status changed by the pill meanwhile is not
  overwritten unless the person picked a status; then `from` is the status at the moment of Save
  (D135).
- **The repair leaves the list while edited** (someone else deleted it): the window is no longer drawn
  and the draft is lost. Nothing was written by this person.
- **Old repairs.** No vendor, no number, Completed with an empty `completed_at`: Edit shows them as
  they are (dashes, empty fields) and saves without asking for a vendor (D130). Choosing the status
  Completed on an old repair that is already Completed changes nothing.
- **An inactive vendor** stays in the select of the repair that has it, until changed (D131).
- **A currency change** on a repair that has services moves its whole amount to the other currency's
  total in the strip; nothing is converted (maintenance-01 D5).
- **A change of `event_start` across a year** makes the yearly cost trigger recompute both years; a
  delete or a restore does not change the yearly sum (it has no `deleted` filter).
- **A repair made in 09a** has no bleachers, no zone and no `cost_cents` until 09b: it is not on the
  Dashboard, the Bleacher and Zone filters do not find it, its Total is a dash, and its title is the
  number and vendor or "Repair" (D125, D126).
- **A new repair that no tab shows** (the other tab, a search or a filter that does not match it): it
  is simply not in the visible list; the page says nothing (D142).
- **The same number typed twice in a row**: the second Save sees the first, because the local write is
  immediate and the check reads the local database.
- **A draft and a reload:** a reload loses the draft (§2.2).
- **The width.** The window is 1152 px (§11, a change after the first review); the Edit layout reuses
  its grid. Nobody has seen it in a browser (the Browser pane cannot run PowerSync, spec 04 D54).

## 9. Not in this spec

- **Services** (Add service, Edit, Delete and their Restore), **files** (upload, delete), **the
  junction and the zone of a repair**, **the link from a repair to damage reports**: spec 09b.
- **Editing the Total** of a repair (D132), the name, the address, the owner, `completed_at` by hand,
  and a new vendor.
- **A success message, an offline hint, an undo, a draft that survives a reload.**
- **The Dashboard form** and the Damage Reports page's "resolve with maintenance" modal, which both
  create repairs through `createMaintenanceEvent`. Spec 11 names only the Dashboard; who moves the
  modal is not decided here.
- **Playwright scenarios** (D147) and a browser check.
- **The permissions spec 10** (the gates in general, the role specs and the last check of the matrix).

## 10. Definition of done

- `npm run tc` and `npx vitest run`, each with the real output and the exit code (Node 24 first in
  `PATH`).
- `npx prettier --check` on the files this spec touches only (the repo-wide `npm run lint` is red at
  baseline); the spec's Markdown is also checked for an inline code span that breaks a line.
- Playwright E2E: **not written (D147) and not run**; the report says so.
- The browser check is skipped (the Browser pane cannot run PowerSync); the report lists what nobody
  has seen: the portals of the selects and dialogs, the date inputs, the focus on the first error, a
  new repair in the list, and the first write of an insert and of `deleted` on real data.
- The matrix rows of §5 are edited in the same commit.
- The Ukrainian artifact of this spec is updated with the status and the result.
- The final report with real output: TS compilation, Vitest, E2E (not written, not run).

## 11. Result (2026-11-20)

- **Done as specified.** The New repair button and window, the Edit mode of the repair window, the
  footer (Delete and Edit, Restore, Cancel and Save), the discard and delete dialogs, the four
  writers (`createRepair`, `updateRepair`, `deleteRepair`, `restoreRepair`) with the duplicate check,
  Restore in the row and in the window, and the matrix rows. 6 counted files (3 new: `utils/repairForm.ts`,
  `db/repairWrite.ts`, `components/RepairForm.tsx`; 3 changed: `RepairWindow.tsx`, `RepairsPage.tsx`,
  `repairDetails.ts`) plus the matrix and the tests. No migration, no sync change, no change to the
  list query, to `useRepairList` or to `AppSchema.ts`.
- **Tests first.** Red run before any code: 6 files failed (the 3 new test files could not import
  their modules; 19 tests of the changed files failed). Then green.
- **Checks (real output).** `npm run tc` exit 0. `npx vitest run` exit 0: 571 files, 8500 tests
  (before this spec 568 files and 8390 tests: +3 files, +110 tests). `prettier --check` clean on the 14
  files this spec touched (the repo-wide check is red at baseline).
- **Mutation check.** Three rules were broken on purpose and the tests failed: the invoice key no
  longer ignoring case (4 failing tests), an Edit writing a column the person did not change (3), Restore
  no longer running the duplicate check (1). The files were restored and checked by hash.
- **E2E:** not written (D147) and not run. **Browser check:** not done (the Browser pane cannot run
  PowerSync). Nobody has seen: the select and dialog portals inside the window, the focus on the first
  error, the date inputs, a new repair appearing in the list, an insert and a `deleted` write reaching
  the server, and the width of the Edit layout.
- **Extras against the spec text** (no behaviour of the spec changed):
  - `utils/repairForm.ts` also exports `clearedRepairFormErrors` (a change of a field clears its own
    errors, D138), with 4 tests; `components/RepairForm.tsx` also exports `firstErrorFieldId` (the
    field that gets focus after a refused Save).
  - `RepairWindow.tsx` is now a client module (`"use client"`) and holds the internal
    `useRepairDraft`, `RepairEditBody`, `DiscardChangesDialog` and `DeleteRepairDialog`. The Edit mode
    draws no vendor address line under the Vendor select; the footer is sticky at the bottom of the
    window.
  - The "No vendor" entry of the Vendor select has the internal value `__no_vendor__`;
    `vendorSelectOptions` labels a current vendor with an empty name "Unknown".
  - Test ids: `new-repair`, `new-repair-window`, `repair-window-footer`, `repair-delete`, `repair-edit`,
    `repair-restore`, `repair-cancel`, `repair-save`, `repair-discard-dialog`, `repair-delete-dialog` and
    `repair-error-invoice`, `repair-error-from`, `repair-error-to`. The description of the discard dialog
    reads "The changes you made to this repair have not been saved."
  - `RepairsPage` builds the `RepairEditing` object of each repair window in `editingFor`; the row's
    Restore calls `restoreRepair` with the vendor and the invoice number found in the list.
- **Not done.** Nothing is committed. The headers of specs 04 to 08 still say "uncommitted" and the
  plan still lists spec 09 as one spec (fix in a docs commit if told). `seed.sql`,
  `supabase/.temp/cli-latest` and `scripts/seed_add_on_conflict.py` stay out of every commit.
- **Changed after the first review (2026-11-21, the user asked to remove the side scroll in the
  modal).** The table of services in the repair window needs 1056 px (`WINDOW_MIN_WIDTH`), but a
  1080 px window gave it 1030 px (2 px of dialog border, 48 px of padding, 2 px of the table's own
  border), so the table scrolled sideways inside the window. The window and the New repair window are
  now **1152 px** (`REPAIR_WINDOW_WIDTH`, `REPAIR_WINDOW_CLASS` in `RepairWindow.tsx`), and the
  window itself has `overflow-x-hidden`, so it cannot scroll sideways. On a screen narrower than about
  1190 px the table still scrolls inside its own box, the one wide thing a window may have. The
  counted files are now 7: `RepairServices.tsx` only gained the export of `WINDOW_MIN_WIDTH`. Two
  tests keep the sizes tied together (the room left for the table is at least its minimum width, and
  the class carries that width). The recording the user attached could not be opened here, so the
  cause is the one found in the code; if another modal scrolls sideways, say which one.
