# Repairs 09b2: What a service does to its repair (bleachers, zone, damage report links)

Status: **APPROVED and IMPLEMENTED 2026-11-23**, uncommitted (0 open decisions; D168 to D188 were
taken by the user in seven question batches; the results are in §11; the Playwright scenarios are
written and not run (D187) and the browser check was not done). Build order: **09b2 of 11** (the plan's
spec 09 is split: 09a is done and committed as 2d0f5931, 09b1 is done and committed as 60c73fbc, and
09b is cut into three specs, D148; 09b2 is one spec, D168). Needs:
[repairs-01-design.md](repairs-01-design.md), [repairs-02-sync-rules.md](repairs-02-sync-rules.md),
[repairs-03-list-query.md](repairs-03-list-query.md), [repairs-04-table.md](repairs-04-table.md),
[repairs-05-toolbar.md](repairs-05-toolbar.md),
[repairs-06-expanded-row.md](repairs-06-expanded-row.md),
[repairs-07-repair-window.md](repairs-07-repair-window.md),
[repairs-08-status.md](repairs-08-status.md),
[repairs-09a-repair-writes.md](repairs-09a-repair-writes.md) and
[repairs-09b1-services.md](repairs-09b1-services.md) (all done and committed: 04 is 5280565b, 05 is
9567144a, 06 is 56f00da2, 07 is b9abca86, 08 is bd586ad6, 09a is 2d0f5931, 09b1 is 60c73fbc; 06 to
09b1 are not pushed). Needed by: 09b3 and the specs after them. Plan:
[repairs-plan.md](repairs-plan.md). Branch: `q4-sprint4-maintenance`.

Scope: **a service writes three things into the repair around it, in the same local transaction as
the service itself: the repair's list of bleachers (the junction `BleacherMaintEvents`), the repair's
zone (`MaintenanceEvents.zone_uuid`), and the link of the open damage reports of the service's
bleacher to the repair (`DamageReports.maintenance_event_uuid`), with the closing of those reports
when the repair is Completed. This holds for every way a service is written: Add service, Edit and
Delete of a service, a services draft saved with New repair, and a services draft saved with Edit of
a repair. A service whose bleacher is in another zone than the repair is refused. It changes
clauses of spec 03 D29, of spec 09a (D125, D126, D135) and of spec 09b1 (D148, D149, §2.5, §3: the
signatures of `createService`, `updateService`, `deleteService`, `createRepair`, `updateRepair`,
`RepairFormErrors`, `RepairEditing` and `NewRepairWindowProps`); §3 lists every one, and the
"Approved" of this spec approves them.** No migration, no sync change, no change to the list query,
to `useRepairList`, to `AppSchema.ts` or to the locked types of specs 03 and 05. The files are spec
09b3. The Dashboard form and the "Create Maintenance to Resolve" modal are not changed (D173).

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

**Decisions of spec 09b1 (done, user, 2026-11-21; five question batches).**

- **D148 (the cut):** the plan's spec 09b is three specs. **09b1** (done): the services of a
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

**Decisions of this spec (user, 2026-11-23; seven question batches).**

- **D168 (the cut):** 09b2 is one spec: the repair's list of bleachers, its zone and the link to its
  open damage reports. The three parts are written in one local transaction with the service and
  change the same writers, so they are not cut apart. The files stay spec 09b3.
- **D169 (when a bleacher leaves the list):** a bleacher leaves the repair's junction when a write
  takes its live services in this repair from one or more to none: the last live service on it is
  deleted, or moved to another bleacher. An old junction row is treated like a new one: a bleacher
  that had a service, and has none after the write, is removed even if its row was there before any
  service. A bleacher that never had a live service in this repair is never removed by a service
  write, so the junction can hold bleachers without services (the user's answer "old rows stay",
  taken 2026-11-21, so spec 03 D29 is rewritten that way, §3).
- **D170 (a duplicate pair):** the app checks, and nothing else. Before it inserts a junction row,
  the writer reads the repair's rows in the same local transaction and inserts none when a row of
  that bleacher exists. There is no migration and no unique index. Two devices that write at the same
  moment can still make a duplicate and the server accepts it: Repairs shows one chip, and the
  Dashboard would draw the bar of the repair twice on that bleacher.
- **D171 (the value of the zone):** the zone written into the repair is the zone of the bleacher on
  the repair's `event_start`: its own zone (`Bleachers.zone_uuid`), or, when an accepted sub-rental
  covers `event_start`, the zone that sub-rental borrows (maintenance-01 D7). Locally, 2 live repairs
  would get Zone 2 (a borrowing sub-rental) where the Zone column shows Zone 1 today (spec 03 D33).
- **D172 (when the zone is written):** only while the repair's `zone_uuid` is empty. The first
  service whose bleacher has a zone writes it. After that it is never changed: not by another
  service, not by a change of the repair days in Edit, not when the services are deleted. All 209
  repairs of the local data have it empty, and all of them keep showing the current zones of their
  bleachers (D33) until a service writes the zone.
- **D173 (the Dashboard form and the modal):** nothing changes in the Dashboard form
  (`updateMaintenanceEvent`) and in the Damage Reports modal "Create Maintenance to Resolve" before
  spec 11. What they can do to the data meanwhile is written in §8.
- **D174 (the zone of an old repair):** the zone comes only from the bleachers of services. The old
  junction rows are not looked at. An old repair with a row on #52 (Zone 1) whose first service is on
  #60 (Zone 2) gets Zone 2, while its Bleachers column shows #52 and #60.
- **D175 (a bleacher without a zone):** a service on it is allowed. It conflicts with no zone and
  sets none: the repair's zone stays empty when it was empty, and the Zone column then shows the
  current zones of the repair's bleachers (D33). Locally 2 live bleachers have no zone, and 6 live
  repairs have a bleacher without one.
- **D176 (one zone):** a service whose bleacher is in another zone than the repair's zone is
  refused: the text sits under the Bleacher field and nothing is written. The same check runs when a
  service is added to a draft and when the bleacher of a service is changed. Moving a service to a
  bleacher of another zone is therefore refused too.
- **D177 (two sub-rentals):** when two or more accepted sub-rentals that borrow different zones cover
  the bleacher on `event_start`, the bleacher has no zone on that day, and D175 applies.
- **D178 (which reports):** all the open reports of the bleacher: not deleted, `resolved_at` empty,
  of any category and created on any day (D185 narrows this for a Completed repair). The category of
  the service is not looked at, because `DamageReportCategories` is empty (0 rows) until the driver
  app writes it. Because the Reported column and the closing on Completed (spec 08 D116) both use the
  reports linked to the repair, a link brings a report of another category into Reported, and the
  repair closes it when it becomes Completed. Locally 48 open reports lie on 38 bleachers (30 have
  one, 6 have two, 2 have three).
- **D179 (a report that is linked already):** a report linked to another repair is skipped, whether
  that repair is live or deleted. It stays with the repair that has it.
- **D180 (a bleacher leaves):** when a bleacher leaves the junction (D169), the open reports of that
  bleacher that are linked to this repair lose the link (`maintenance_event_uuid` is emptied). A
  closed report is never touched.
- **D181 (a Completed repair):** when the repair is Completed, the open reports that D178 and D179
  select are linked and closed at once, in the same transaction: `resolved_at` is the moment of the
  write, `maintenance_event_uuid` is the repair. This is the closing of spec 08 D116 moved to the
  moment a bleacher gets its first service, for a repair that is already Completed.
- **D182 (when it all happens):** the junction row, the zone, the link and, on a Completed repair,
  the closing happen in a write that makes the first live service of the repair appear on a bleacher
  (none before, one or more after), and the loss of D169 and D180 in a write that makes the last one
  disappear. A second service on the same bleacher, and an edit of an amount, the category, the
  severity or the description, change none of them. A report that a driver creates after the first
  service on its bleacher is not linked until the live services of that bleacher have gone to none
  and have come back. Locally 0 services exist, so every first service of every repair is such a
  moment.
- **D183 (Delete and Restore of a repair):** they do not touch the junction, the zone or the reports
  (spec 09a D143, D144). A report linked to a deleted repair stays linked, and no other repair takes
  it (D179); it is closed by hand on the Damage Reports page, or when the deleted repair is restored
  and completed.
- **D184 (the order of the statements):** in one local transaction, the services come first and what
  they derive comes after: the statements of the repair (09a, and the status of spec 08), the
  statements of the services (09b1), then the junction (rows removed, then rows inserted), then the
  zone, then the damage reports (links removed, then links and closings). The repair statement stays
  first because the other rows point to it. The server receives the statements one by one, and when
  it refuses one, the ones before it have already been applied, so a refused service leaves at most
  a bleacher, a zone or a link without a service, a state the page already allows (D169, D172).
- **D185 (a Completed repair: which reports):** on a Completed repair D181 links and closes only the
  reports created no later than the repair's `event_end` (the day of `created_at` in the app time
  zone, spec 03 D37). Newer reports stay open and unlinked. For a repair that is not Completed
  nothing is narrowed (D178). Reason: after the migration of maintenance-01 D10 every old repair
  whose `event_end` is in the past is Completed, and a service added to one of them to record its
  invoice must not close the damage reported after it ended.
- **D186 (a zone conflict found at Save):** in New repair and in Edit of a repair the zone depends on
  `Repair from`, which can be filled or changed after the services were added. Save checks the added
  and moved services again with `Repair from` as it is then. A conflict is a red line above the
  table of services, not under a field; Save writes nothing and the window stays in Edit. The line
  goes when the services or `Repair from` change.
- **D187 (e2e):** Playwright scenarios are written and not run, as in specs 04 to 07: the full set
  for the administrator and one scenario each for the account manager, the viewer and the
  maintainer (S34 to S42, §6).
- **D188 (the matrix):** the levels of both rows do not change; the sentences and the notes do. They
  speak of the bleachers, the zone and the damage reports, the closing on a Completed repair
  included (§5).

**What follows from the design and from earlier decisions (no new decision).** Each item names its
source, so a reviewer can check it. The last item is wording only; it is listed so it can be
corrected, and no behaviour hangs on it.

- **Words.** A _live service_ is a row of `MaintenanceLineItems` of this repair with `deleted` = 0. A
  _gain_ is a bleacher that has no live service before a write and one or more after it. A _loss_ is
  a bleacher that has one or more before and none after (D169, D182).
- **The zone of a bleacher on a day** (D171, D175, D177): its own zone, unless accepted sub-rentals
  of that bleacher cover the day: then the zone they all borrow, and no zone when they borrow
  different zones or one of them has no zone. With no day (`Repair from` still empty while a service
  is added to the New repair draft) it is its own zone, without sub-rentals. A bleacher with no zone
  has no zone.
- **The zone to compare with** (D172, D174, D176): the repair's stored zone; when that is empty, the
  first zone found among the live services of the repair after the write, in the list's order
  (`created_at`; in a draft, the order of the draft). When there is none, nothing is compared.
- **Which services are checked** (D176): the services that a write adds and the services whose
  bleacher it changes, each with the zone of its bleacher on the repair's `event_start` as the
  repair has it at that moment (in Edit, as the draft has it). A change of an amount, the category,
  the severity or the description, and a delete, are not checked.
- **When the zone is written** (D172, D182): by a write that has a gain, when the stored zone is
  empty and a zone to compare with exists. The zone is then the zone to compare with. Nothing
  clears it.
- **Reports in play** (D178; spec 03 does not count a deleted report): the reports of the bleacher
  with `deleted` = 0 and `resolved_at` empty. A report that is linked to this repair already is not
  changed and is not "linked to another repair".
- **The closing** (D181, D185): `resolved_at` is the `now` of the write, the same reading of the
  clock as the statements of the repair; `maintenance_event_uuid` is the repair. A report closed
  here leaves the drivers' phones (spec 08 D116: the mobile sync carries only open reports).
- **The status that counts** is the status the repair has after its own statements of the same
  write. A Save that makes the repair Completed and adds a first service on a bleacher closes the
  reports of that bleacher (the status statements of spec 08 close the repair's Reported list,
  first, and the guard `resolved_at IS NULL` keeps a report from being closed twice); a Save that
  moves it out of Completed does not.
- **New repair** has no junction rows and no zone, so every bleacher of its live services is a
  gain. A New repair saved as Completed closes the reports of those bleachers that D185 selects
  (this replaces the "closes no report" of spec 09a D135, which was written when a New repair had no
  bleachers).
- **Old junction rows** of a bleacher that never had a service stay (D169).
- **A junction row** is inserted with a new uuid and `created_at` equal to the `now` of the write.
  When a bleacher is lost, every row of the pair is removed (there is more than one when a
  duplicate exists).
- **A write that changes no service** (the fields of a repair only, a status change, Delete,
  Restore) reads and writes no junction row, zone or report (D183; specs 08 and 09a).
- **The Dashboard** draws the junction: a repair gets a bar on the row of each of its bleachers and
  loses it when the bleacher leaves. The strip of an open report on that row ends the day before the
  `event_start` of the repair the report is linked to, and does not appear at all when that repair
  started before the report was created (`computeDamageOverlayRanges`). This is today's behaviour,
  which the new links reach.
- **The driver app** reads the column `maintenance_event_uuid` of a report and does nothing with it
  (checked in `../br_driver`); a linked open report stays on the phones, as it is open.
- **Wording chosen by me** (presentation only): the texts of the refusals (§3), the test ids, and
  the lines of the examples in §2.6.

## 1. What the code has today (researched 2026-11-21 and 2026-11-23)

- **The writers.** `db/serviceWrite.ts` (`createService`, `updateService`, `deleteService`,
  `buildServicesDraftStatements`) and `db/repairWrite.ts` (`createRepair`, `updateRepair`,
  `buildUpdateRepairStatements`) build their statements with the app's Kysely and run them with
  `typedExecuteBatch`: one local transaction, statements known in advance. Neither reads anything
  inside the transaction. `db/repairStatusWrite.ts` closes the Reported reports on the way into
  Completed (`buildStatusStatements`, guard `resolved_at IS NULL`).
- **What the project has for a write that reads.** `typedWriteTransaction(work)` in
  `src/lib/powersync/typedQuery.ts` runs `work(tx)` in one write transaction: reads with
  `tx.getAll` and writes with `tx.execute` share one commit, and a throw inside rolls everything
  back and reaches the caller. Users: `syncEventLineItems` and `saveNextTask`. The test support
  `src/lib/powersync/testing/fakePowerSyncDb.ts` stands in for `powerSyncDb` on `node:sqlite`.
- **How the list reads these tables** (`db/repairListQueries.ts`, `utils/repairRows.ts`). The
  bleachers and zones of a repair come from the junction (spec 03 D29, D33). A report linked to a
  repair counts in Reported only on a bleacher that is in the repair's junction. A report that is
  linked to the repair always counts (D28); the closing of spec 08 D116 uses exactly that list.
- **The junction** (`BleacherMaintEvents`: `id`, `bleacher_uuid`, `maintenance_event_uuid`,
  `created_at`). The local database has the primary key and nothing else: no unique index on the pair
  and no trigger. Policies exist for select, insert, update and delete. Locally (2026-11-23): 211
  rows on 208 repairs, 0 duplicate pairs, one repair with several bleachers (four, deleted), one
  live repair with no row (made by New repair in 09a). A removal in the app is a `DELETE` that the
  connector uploads.
- **The damage reports** (`DamageReports`). Triggers: the mirror of `resolved_at` into
  `DamageReportCategories` and `DamageReportAcknowledgements`, a backfill of the bleacher on insert,
  and `damage_reports_driver_update_guard`, which lets admin, account manager, viewer and
  maintainer through and limits a driver. Update is allowed to admin, account manager and
  maintainer. Locally: 304 live reports, 48 open (on 38 bleachers: 30 with one, 6 with two, 2 with
  three), 0 open and linked, 225 linked, 31 closed with no repair, 0 open and marked fixed by a
  driver; `DamageReportCategories` has 0 rows. The web sync carries every report to the four web
  roles, so the local table has the open ones. The mobile sync carries only open reports and the
  driver's own; `../br_driver` selects `maintenance_event_uuid` and never acts on it.
- **The zone.** `MaintenanceEvents.zone_uuid` exists (maintenance-01 D7) and is empty on all 209
  local repairs; nothing writes it. `Bleachers.zone_uuid` is the own zone: 144 live bleachers
  locally, 2 without one. `SubrentalEvents` (`bleacher_uuid`, `status`, `requested_zone_uuid`,
  `event_start`, `event_end`) reaches the four web roles, so it is read locally: 15 accepted (every
  one with a zone), none overlapping on a bleacher, and no rule in the schema forbids an overlap.
  Two live repairs have an accepted sub-rental on their `event_start` (own zone Zone 1, borrowed
  zone Zone 2). Six live repairs have a bleacher without a zone, and none has bleachers in two
  zones.
- **The Dashboard** (`useDashboardPowerSync.ts`, `usePsBleacherMaintEvents.ts`,
  `damageOverlayRanges.ts`). It reads every junction row and draws a bar of the repair on the row of
  each bleacher; the strip of a damage report ends the day before the `event_start` of the linked
  repair, or the next repair after the report.
- **The old flows** (`src/features/maintenanceEvents`, `src/app/damage-reports`).
  `createMaintenanceEvent` writes straight to Supabase: it inserts the junction rows from the
  form's bleachers and closes the open reports of those bleachers (or the one report the modal
  passes). `updateMaintenanceEvent` (the Dashboard form's Save) writes the repair's `cost_cents`
  from the form, removes every junction row of the repair and inserts them again from the form's
  list, also through Supabase. The Damage Reports modal offers "Create Maintenance to Resolve" for
  every open report; the page shows "Linked to: <name>" for a linked one.
- **How an upload works** (`BackendConnector.ts`). The operations of one local transaction go up one
  by one. A server error of class 22 or 23, or 42501, discards the failed operation and the rest of
  that transaction, with a general red toast; any other error is retried without end. So a local
  transaction is atomic on the device and not on the server (spec 09b1 §1).
- **The window.** `RepairWindow.tsx` draws the draft of New repair and Edit, the services table
  (`RepairServicesSection`) and the nested service windows of a draft (`DraftServiceWindows`, whose
  Add service and Save only call `validateServiceForm`). `RepairFormErrors` has `eventStart`,
  `eventEnd` and `invoiceNumber`. The page builds the handlers (`editingFor`, `serviceEditingFor`,
  the `newService` window) and has the app time zone (`useTimezoneStore`).
- **The matrix.** The rows "Repairs & Maintenance" and "Repair Costs & Vendors" carry the sentences
  of 09b1 (§5 gives the text and what it becomes), among them "a service names a bleacher, but that
  does not change the repair's list of bleachers yet".
- **Tests that exist.** `serviceWrite.test.ts`, `repairWrite.test.ts`, `repairStatusWrite.test.ts`
  (the SQLite harness), `repairForm.test.ts`, `RepairForm.test.tsx`, `RepairWindow.test.tsx`,
  `permissionPageData.test.ts`, `typedWriteTransaction.test.ts`, the e2e fixtures in
  `e2e/helpers/repairsFixtures.ts` (S10 to S33).

## 2. The behaviour

### 2.1 What a write does (D169 to D185)

Every write that can change the live services of a repair runs as one local transaction with these
steps, in this order. A write that changes no service (§0, "A write that changes no service") keeps
running as `typedExecuteBatch`, with no read.

1. **Before.** Read the bleachers of the live services of the repair (none for a repair that does
   not exist yet).
2. **The action's own statements**, in the order of 09a and 09b1: the repair (insert, or the update
   of the changed fields), the status statements of spec 08, the statements of the services.
3. **After.** Read the repair (`status`, `event_start`, `event_end`, `zone_uuid`), the bleachers of
   its live services again, and its junction rows.
4. **The zone verdict** (D171 to D177). Read the own zones and the accepted sub-rentals that cover
   `event_start` for the bleachers of the live services; `zoneOnDay` gives each bleacher's zone;
   `judgeZones` compares the checked services with the repair's zone. A conflict throws out of the
   transaction: nothing is kept, and the refusal goes back to the caller (§2.4).
5. **Gains and losses** from step 1 against step 3 (D169, D182). Read the open reports of the
   gained and lost bleachers.
6. **The plan and its statements** (D184), in this order: the junction rows of lost bleachers are
   removed; a junction row is inserted for a gained bleacher that has none (D170); the zone is
   written when the repair has none and a gain exists (D172); the links of the open reports of lost
   bleachers that are linked to this repair are removed (D180); the open reports of gained bleachers
   that are not linked to another repair (D179) are linked, and, when the repair is Completed, only
   those created no later than its `event_end` are linked and closed (D181, D185).

The plan is a pure function (`planRepairLinks`) so that it is tested without a database; the reads
and the statements are in `db/repairLinkWrite.ts`.

### 2.2 Single writes (D176, D182)

- **Add service** (`createService`): the checked service is the new one. A refusal returns
  `{ bleacherUuid: <text> }`, shown under the Bleacher field; nothing is written. A first live
  service on its bleacher is a gain.
- **Save of an Edit of a service** (`updateService`): when the bleacher changed, the checked service
  is that one and the write runs as in §2.1 (the old bleacher can be a loss, the new one a gain).
  When the bleacher did not change, the write is the update of 09b1, with no read.
- **Delete** (`deleteService`): no service is checked; the bleacher of the deleted service is a loss
  when it was its last live service.

### 2.3 Drafts (D161, D186)

- **Add repair** (`createRepair`): when the draft holds live added services, the statements of the
  repair and of the services run as in §2.1 with every added bleacher checked. A repair with no
  services is written as in 09a, with no read.
- **Save of an Edit of a repair** (`updateRepair`): when the draft changed the services, the
  statements of the fields, of the status and of the services run as in §2.1, with the checked
  services of the draft (the added ones and the stored ones whose bleacher changed). A refusal
  returns `{ services: <text> }`, drawn as the red line above the table (D186). A Save that changed
  only fields and the status is written as in 09a, with no read.
- **The check while the draft is built.** Add service and an Edit that changes the bleacher, in a
  service window of a draft, call `checkServiceZone` before the service goes into the draft. The
  text goes under the Bleacher field; the service is not added. `Repair from` of the window is the
  day (none while it is empty). The other live services of the draft are the context.

### 2.4 The refusal (D176, D186)

- From the service window and from Add service of an open row or a repair window in view mode: red
  text under Bleacher, as the other errors of the form (09b1 D155); the first field with an error
  gets focus.
- From a draft: the same text under Bleacher when the service is added or moved, and, at Save of
  the repair, the red line above the table with the first conflict found. The line has the test id
  `repair-services-error`, takes focus, and goes when a service is added, changed or removed, or
  `Repair from` changes (D186).
- The text is `zoneConflictMessage`: "Bleacher #60 is in Zone 2, but this repair is in Zone 1." and,
  when a day is known, "Bleacher #60 is in Zone 2 on 2026-11-20, but this repair is in Zone 1."

### 2.5 What a person sees

- The Bleachers column and the Zone column follow the write at once (the list is reactive). The
  Reported day appears for the linked reports; on a Completed repair the closed reports leave the
  open list of the Damage Reports page and leave the phones.
- The repair appears on the Dashboard as a bar on the row of each of its bleachers.
- No message on success; a red toast "Failed to save the service." / "Failed to delete the service."
  / "Failed to save the repair." with the error text when the local write fails (09a, 09b1). A
  refusal is not a failure and shows no toast.
- Offline (spec 08 D120): everything is written locally at once and reaches the server and the
  other people when the connection is back.

### 2.6 Examples

- **An old repair, first service.** The repair has a row on #52 (Zone 1), no service, an empty zone,
  status Inbound. Add a service on #52, category Tires. Before: none; after: #52, so #52 is a gain.
  The row exists, so none is inserted (D170). The zone to compare with is Zone 1 and the stored zone
  is empty, so Zone 1 is written. #52 has two open reports, one not linked and one linked to another
  repair: the first is linked and stays open, the second is skipped (D179). The Reported column
  shows the first.
- **The same repair, Completed, `event_end` 2026-11-05.** The same service. The two open reports of
  #52 are created on 2026-11-10 and 2026-11-03 and are not linked. Only the second is linked and
  closed (D185); the first stays open and free.
- **A move.** The repair has one service on #52. Edit it to #53 in the same zone: #53 is a gain (a
  row is inserted, its open reports are linked) and #52 is a loss (its row is removed, the open
  reports of #52 linked to this repair lose the link). The zone does not change. Edit it to #60 in
  Zone 2: refused under Bleacher.
- **Delete the last service on #53.** #53 is a loss: its row is removed and its links are removed.
  The zone stays (D172) and the Total follows the server (09b1 D159).
- **A second service on #52** while the first is live: no gain, no loss: nothing happens to the
  junction, the zone or the reports (D182).
- **New repair, two services in two zones.** Add service on #52 (Zone 1) is accepted; Add service on
  #60 (Zone 2) is refused under Bleacher at once (D176). If `Repair from` was empty when both were
  added, and a sub-rental then puts #52 in Zone 2 on the day typed, Save shows the red line (D186).

### 2.7 The page (D176, D186)

- `RepairsPage` gives the writers the app time zone and the `now` of the call, and builds
  `checkServiceZone` for `editingFor` (with the repair's id) and for the New repair window (with no
  repair). The service handlers are given only to the roles that write (09b1 D165).
- Each write is still called as `void …catch(() => {})`: the writers show their own error toasts.

## 3. Types and signatures (locked; changing them needs a new "Approved")

`src/features/repairs/utils/repairLinks.ts` (new, pure; the rules of the zone and of the links):

```ts
import type { ServicesDraft } from "./serviceForm";

/** What the zone of one bleacher on one day is made from (D171, D175, D177). */
export type ZoneFacts = {
  bleacherUuid: string;
  ownZoneUuid: string | null;
  /** Each accepted sub-rental of the bleacher that covers the day: the zone it borrows, or null. */
  coveringZones: readonly (string | null)[];
};
/**
 * No cover: the own zone. Cover: the zone all the covering sub-rentals borrow, and null when they
 * borrow different zones or one of them borrows none. A bleacher with no zone gives null.
 */
export function zoneOnDay(facts: ZoneFacts): string | null;

export type ZoneVerdict =
  | { ok: true; zoneToStore: string | null }
  | { ok: false; bleacherUuid: string; bleacherZoneUuid: string; repairZoneUuid: string };
/**
 * D172, D174 to D177. `storedZoneUuid` is the repair's zone before the write. `liveBleacherUuids`
 * are the bleachers of its live services after the write, one entry per service, in the list's
 * order. `zones` maps a bleacher to its zone on `event_start` (null: none). The zone to compare
 * with is the stored zone, else the first zone among the live bleachers. The first checked bleacher
 * whose zone is not null and differs from it is a refusal. Otherwise `zoneToStore` is the zone to
 * compare with when nothing is stored, and null when a zone is stored or none exists.
 */
export function judgeZones(input: {
  storedZoneUuid: string | null;
  liveBleacherUuids: readonly string[];
  checkedBleacherUuids: readonly string[];
  zones: ReadonlyMap<string, string | null>;
}): ZoneVerdict;

/** "Bleacher #60 is in Zone 2, but this repair is in Zone 1." (with the day: "... on 2026-11-20, ..."). */
export function zoneConflictMessage(input: {
  bleacherNumber: number | null; // null gives "#?"
  bleacherZoneName: string | null; // null gives "another zone"
  repairZoneName: string | null;
  day: string | null;
}): string;

/** Bleachers that gain or lose their live services (D169, D182): distinct, in order of appearance. */
export function gainsAndLosses(
  before: readonly string[],
  after: readonly string[],
): { gained: string[]; lost: string[] };

/**
 * The bleachers a draft's Save checks (D176): those of the added entries and of the stored entries
 * whose bleacher changed; removed entries and unchosen bleachers are left out.
 */
export function checkedBleachersOfDraft(draft: ServicesDraft): string[];
/**
 * The bleachers of the live entries of a draft, in the draft's order, one per entry, without the
 * entry `exceptId`; the context of a draft's check (D176).
 */
export function liveBleachersOfDraft(draft: ServicesDraft, exceptId?: string): string[];

/** The check a draft's service window calls before a service goes into the draft (D176). */
export type ServiceZoneCheck = (input: {
  bleacherUuid: string;
  /** `Repair from` as the window has it; null while it is empty. */
  eventStart: string | null;
  /** The bleachers of the other live services of the draft, in the draft's order. */
  otherLiveBleacherUuids: readonly string[];
}) => Promise<string | null>; // the refusal text, or null

export type OpenReportForLink = {
  id: string;
  bleacherUuid: string;
  createdAt: string; // the stored timestamp
  repairId: string | null; // the repair it is linked to
};
export type LinkPlanInput = {
  repair: { id: string; status: string; eventEnd: string | null; zoneUuid: string | null };
  gained: readonly string[];
  lost: readonly string[];
  /** The repair's junction rows now (after the action's own statements). */
  junction: readonly { id: string; bleacherUuid: string }[];
  /** The open, not deleted reports of the gained and lost bleachers. */
  openReports: readonly OpenReportForLink[];
  zoneToStore: string | null; // from `judgeZones`
  timezone: string;
};
export type LinkPlan = {
  junctionDeleteBleachers: string[]; // lost and in the junction: every row of the pair goes (D169)
  junctionInsertBleachers: string[]; // gained and not in the junction (D170)
  zoneToWrite: string | null; // D172: only with a gain, and only when `repair.zoneUuid` is empty
  unlinkBleachers: string[]; // D180: the lost ones
  linkReportIds: string[]; // D178, D179: not Completed: reports of gained bleachers linked to no repair
  closeReportIds: string[]; // D181, D185: Completed: the same, created no later than `eventEnd`
};
/** The plan of §2.1 step 6. A report linked to any repair (this one included) is never in a list. */
export function planRepairLinks(input: LinkPlanInput): LinkPlan;
```

`src/features/repairs/db/repairLinkWrite.ts` (new; the reads, the statements and the runner):

```ts
import type { CompiledQuery } from "kysely";
import type { ServiceZoneCheck, LinkPlan } from "../utils/repairLinks";

/** Each read is a compiled Kysely query with its own row type, tied with `expect<T>()` outside a
 * transaction and run with `tx.getAll` inside one. None uses `db.fn` (the bound proxy strips it). */
export function buildLiveServiceBleachersQuery(
  repairId: string,
): CompiledQuery<{ bleacherUuid: string | null }>;
export function buildRepairFactsQuery(repairId: string): CompiledQuery<{
  status: string | null;
  eventStart: string | null;
  eventEnd: string | null;
  zoneUuid: string | null;
}>;
export function buildJunctionRowsQuery(
  repairId: string,
): CompiledQuery<{ id: string; bleacherUuid: string | null }>;
export function buildBleacherZonesQuery(bleacherUuids: readonly string[]): CompiledQuery<{
  bleacherUuid: string;
  bleacherNumber: number | null;
  zoneUuid: string | null;
}>;
/** Accepted sub-rentals of these bleachers whose days include `day`. */
export function buildCoveringSubrentalsQuery(
  bleacherUuids: readonly string[],
  day: string,
): CompiledQuery<{
  bleacherUuid: string | null;
  zoneUuid: string | null;
}>;
export function buildOpenReportsQuery(bleacherUuids: readonly string[]): CompiledQuery<{
  id: string;
  bleacherUuid: string | null;
  createdAt: string | null;
  repairId: string | null;
}>;
export function buildZoneNamesQuery(
  zoneUuids: readonly string[],
): CompiledQuery<{ id: string; name: string | null }>;

/**
 * The statements of a plan, in the order of D184: the junction rows removed, the junction rows
 * inserted (a new uuid, `created_at` = `now`), the zone, the links removed, the links, the closings
 * (`resolved_at` = `now`, guard `resolved_at IS NULL`). Empty for an empty plan.
 */
export function buildLinkStatements(
  plan: LinkPlan,
  input: { repairId: string; now: string },
): CompiledQuery[];

export type WriteRepairChangesInput = {
  repairId: string;
  /** The action's own statements, already in the order of 09a and 09b1 (D184). */
  statements: readonly CompiledQuery[];
  /** False: the statements are run as one batch with no read (§0, "A write that changes no service"). */
  servicesAffected: boolean;
  checkedBleacherUuids: readonly string[];
  now: string; // one reading of the clock for the whole write
  timezone: string;
  failedMessage: string; // the red toast on a failed local write
};
/**
 * §2.1. Null when written; `{ message }` when the zone check refused and nothing was written. A
 * failed write shows the red toast `failedMessage` with the error text and is thrown again.
 */
export function writeRepairChanges(
  input: WriteRepairChangesInput,
): Promise<{ message: string } | null>;

/**
 * The check of a draft's service window (§2.3): reads the repair's stored zone (none for a new
 * repair, `repairId` null), the zones on `eventStart`, and returns the refusal text or null.
 */
export function findServiceZoneConflict(
  input: { repairId: string | null } & Parameters<ServiceZoneCheck>[0],
): Promise<string | null>;
```

`src/features/repairs/db/serviceWrite.ts` (changed):

```ts
export type CreateServiceInput = {
  id: string;
  repairId: string;
  values: ServiceFormValues;
  now: string;
  timezone: string; // new
};
// createService(input: Omit<CreateServiceInput, "id">): Promise<ServiceFormErrors | null>
//   (unchanged type; the zone refusal comes back as { bleacherUuid: text }).

export type UpdateServiceInput = {
  serviceId: string;
  initial: ServiceFormValues;
  values: ServiceFormValues;
  repairId: string;
  now: string;
  timezone: string; // new
};
// buildUpdateServiceStatement takes Pick<UpdateServiceInput, "serviceId" | "initial" | "values">.

export type DeleteServiceInput = {
  serviceId: string;
  repairId: string;
  now: string;
  timezone: string;
};
/** Was `deleteService(serviceId: string)`. */
export function deleteService(input: DeleteServiceInput): Promise<void>;
```

`src/features/repairs/db/repairWrite.ts` (changed): `CreateRepairInput` and `UpdateRepairInput` each
gain `timezone: string`. `createRepair` and `updateRepair` keep their types and return
`{ services: <text> }` for a zone refusal. They call `writeRepairChanges` when the draft holds
services that change (`servicesAffected`), with `checkedBleacherUuids` from `checkedBleachersOfDraft`
and the failure message `saveFailed`; otherwise they keep running as in 09a and 09b1.

`src/features/repairs/utils/repairForm.ts` (changed): `RepairFormErrors` gains `services?: string`.
`clearedRepairFormErrors(errors, "eventStart")` also removes `services` (D186). `REPAIR_FORM_MESSAGES`
is unchanged (the text comes from `zoneConflictMessage`).

`src/features/repairs/components/RepairForm.tsx` (changed): `firstErrorFieldId` returns
`"repair-services-error"` when `services` is the only error, and keeps the order of the fields
otherwise.

`src/features/repairs/components/RepairWindow.tsx` (changed):

```ts
// RepairEditing gains, and NewRepairWindowProps gains:
//   checkServiceZone: ServiceZoneCheck;  // D176: called before a service goes into the draft
// RepairServicesSectionProps gains:
//   error?: string;                      // the red line above the table (D186); test id repair-services-error
// useRepairDraft: a change of the services draft clears `errors.services`.
// DraftServiceWindows gains `eventStart: string | null` and `checkServiceZone`: Add service and a
// service whose bleacher changed call it and return { bleacherUuid: text } on a refusal.
```

`src/features/repairs/components/RepairsPage.tsx` (changed): gives the writers `timezone` and `now`,
and builds `checkServiceZone` for `editingFor` and for the New repair window. No exported signature
changes.

**Changed from earlier specs** (each is the old rule and what it becomes):

- **Spec 03 D29** ("the bleachers of a repair come from the junction only; spec 09 has to keep the
  junction equal to the bleachers of the services"): the junction is its rows plus the bleachers of
  the repair's live services. It can hold bleachers that have no service. A bleacher leaves it only by
  D169. The column and the filters still read the junction, as before.
- **Spec 09a D125, D126** ("Save never writes `BleacherMaintEvents`", "a repair made by New repair
  has no bleachers, no zone and is not on the Dashboard until 09b"): a Save that adds, moves or
  removes services writes the junction and the zone; a New repair with services has bleachers and a
  zone and is on the Dashboard. A New repair with no services is as before.
- **Spec 09a D127** (the repair links the open reports of its bleachers, written by 09b): written
  here, by D178 to D182.
- **Spec 09a D135** ("New + Completed closes no report"): it closes the reports that D185 selects on
  the bleachers its services give it.
- **Spec 09b1 D148, D149** (D29 does not hold between the commits; the draft holds services only):
  both end; the junction, the zone and the links are written with the services.
- **Spec 09b1 §2.5** ("Not written: `BleacherMaintEvents`, `zone_uuid`, `DamageReports`"): they are
  written, as §2.1 says.
- **Spec 09b1 §3:** `CreateServiceInput` and `UpdateServiceInput` gain the fields above,
  `deleteService` takes an object, `CreateRepairInput` and `UpdateRepairInput` gain `timezone`,
  `RepairFormErrors` gains `services`, and `RepairEditing`, `NewRepairWindowProps` and
  `RepairServicesSectionProps` gain what is listed above. Return types of the writers do not change.
- **Specs 08 and 09a D143, D144:** unchanged (D183).
- **The matrix sentences of 09a and 09b1** that say a service does not change the list of bleachers:
  §5.
- **The tests** that say so: §7 lists them.

## 4. Files

**New (counted, 2):**

- `src/features/repairs/utils/repairLinks.ts`
- `src/features/repairs/db/repairLinkWrite.ts`

**Changed (counted, 6):** `db/serviceWrite.ts` (the three writers go through `writeRepairChanges` when
a service is added, moved or deleted; the new inputs), `db/repairWrite.ts` (`createRepair` and
`updateRepair` go through it when the draft changes services; `timezone`), `utils/repairForm.ts`
(`RepairFormErrors.services`), `components/RepairForm.tsx` (`firstErrorFieldId`),
`components/RepairWindow.tsx` (the red line, `checkServiceZone`, the draft's check),
`components/RepairsPage.tsx` (the time zone, `now`, `checkServiceZone`).

**Changed, not counted:** `src/features/userAccess/permissionPageData.ts` (§5) and its test.

**Tests (not counted):** `utils/repairLinks.test.ts` and `db/repairLinkWrite.test.ts` (new);
`db/serviceWrite.test.ts`, `db/repairWrite.test.ts`, `utils/repairForm.test.ts`,
`components/RepairForm.test.tsx`, `components/RepairWindow.test.tsx` and
`permissionPageData.test.ts` (changed). **E2E (written, not run, D187):**
`e2e/repairsLinks.admin.spec.ts` (new), a scenario each in `e2e/repairsAccess.am.spec.ts`,
`e2e/repairsAccess.viewer.spec.ts` and `e2e/repairsAccess.maintainer.spec.ts`, and
`e2e/helpers/repairsFixtures.ts` (open reports, a sub-rental, more bleachers).

**8 counted files**, below the cap of 10; one logic (what a service does to its repair).

No migration, no `database.types.ts`, no `AppSchema.ts` change (every table and column exists), no
sync rule, no new package.

## 5. The permissions matrix (`permissionPageData.ts`, same commit)

**Checked, the rule is the page's, not the database's.** No role gains data and no level changes
(D188). The writes are the administrator's and the maintainer's, as every other write on the page
(09b1 D165). The database would let an account manager write the junction, the zone and the reports
too; the page does not offer it. The one new thing a role can do through the page is that a service of
an administrator or a maintainer links and, on a Completed repair, closes damage reports, which both
roles may already do on the Damage Reports page.

**Edits in the row "Repairs & Maintenance":**

- The description: its last two sentences, "A repair's own list of bleachers and its files are still
  edited from the Dashboard: a service names a bleacher, but that does not change the repair's list
  of bleachers yet.", become "A service also keeps the repair's list of bleachers and its zone: the
  first service on a bleacher adds the bleacher to the repair, removing the last one takes it off,
  the zone is set from the first bleacher that has one, and a bleacher in another zone is refused.
  The first service on a bleacher also links the bleacher's open damage reports to the repair; on a
  Completed repair it links and closes the ones reported before the repair ended. The Dashboard form
  still edits a repair's bleachers on its own, and a repair's files are still edited from the
  Dashboard."
- The role notes. The administrator's last sentence, "On the Repairs page adds, edits, deletes and
  restores repairs, and adds, edits and deletes their services, but not yet their bleachers or
  files.", becomes "On the Repairs page adds, edits, deletes and restores repairs, and adds, edits
  and deletes their services, which also set the repair's bleachers, zone and damage report links,
  but not yet their files." The maintainer's last sentence, "Uses the Repairs page to look repairs
  up, add them, edit their details, status and services, delete and restore them, and the Dashboard
  for their bleachers and files.", becomes "Uses the Repairs page to look repairs up, add them,
  edit their details, status and services (which also set the repair's bleachers, zone and damage
  report links), delete and restore them, and the Dashboard for their files." The account manager's
  and the viewer's notes are unchanged.

**Edits in the row "Repair Costs & Vendors":**

- The description: one sentence is added at the end: "A service also decides the repair's bleachers
  and zone, which the table shows, and a Completed repair closes the damage reports of its bleachers
  that were reported before it ended." The role notes and the levels do not change.

`permissionPageData.test.ts` gets cases for the two changed descriptions, the changed notes of the
administrator and the maintainer, and the unchanged levels of both rows.

## 6. Behaviour scenarios (Playwright, written and not run, D187)

The fixture of `e2e/helpers/repairsFixtures.ts` gains, through the service role and removed in its
teardown (exposed as `seeded.links`, which is null when the database has fewer than two zones, and
the scenarios then skip themselves): fresh bleachers, six in the zone of bleacher A and one with no
zone, so that each scenario has its own bleacher, repair and reports (a service on a bleacher that
already has live services is not a gain and links nothing); open damage reports on those bleachers
(one created before the Completed repair's `event_end`, one after) and one open report already linked
to another repair; an accepted sub-rental that borrows the other zone for the day typed in S39. The
scenarios read the junction, the zone and the reports with the service role, as the fixture does, and
poll, because the page writes locally and the connector uploads. The scenarios are written for the
files named in §4 and are not run (the user's rule); the report marks E2E as **written, not run**.

- **S34 (admin): a New repair with a service has bleachers and a zone.** New repair, the two days,
  Add service on bleacher A, Add repair. The row shows chip `#A` and the zone of A; one junction row
  exists; the open reports of A are linked and the Reported day shows.
- **S35 (admin): the first service on an old repair.** An open repair with a row on bleacher A and no
  services. Add service on A from its open row. No second row; the zone is written; the open report
  that was linked to another repair is skipped and the free one is linked.
- **S36 (admin): move and delete.** Edit a service to a bleacher of the same zone: the chip changes,
  the links follow. Edit it to a bleacher of the other zone: the text under Bleacher, nothing
  changes. Delete the last service: the chip goes, the zone stays.
- **S37 (admin): a Completed repair.** Add service on a fresh bleacher to a Completed repair that has
  a junction row and no services: the report created before `event_end` is linked and closed, the
  later one stays open and free.
- **S38 (admin): the draft's check.** New repair: Add service on A, then on a bleacher of the other
  zone: refused under Bleacher at once.
- **S39 (admin): the line at Save.** New repair with two services added while `Repair from` is empty,
  then the day typed so that a sub-rental puts one bleacher in the other zone: Save shows the red line
  above the table and writes nothing.
- **S40 (account manager), S41 (viewer): read only.** A repair made by S34 shows its bleacher and zone;
  there is no Add service.
- **S42 (maintainer): the same flow as S34**, shorter: Add service on A shows chip `#A` and the zone.

## 7. Tests (Vitest, written first)

All run in the node environment; tests are written first and seen failing (red) before the code.

- **`utils/repairLinks.test.ts`.**
  - `zoneOnDay`: no cover gives the own zone; no own zone gives null; one cover gives its zone over
    the own one; two covers of the same zone give it; two covers of different zones give null; a
    cover that borrows no zone gives null.
  - `judgeZones`: a stored zone is the one compared with; with nothing stored it is the first zone
    among the live bleachers; a checked bleacher in another zone is a refusal with the three uuids;
    a bleacher with no zone is never a conflict; an unchecked bleacher in another zone is not one;
    `zoneToStore` is the zone compared with when nothing was stored, a no-zone bleacher first and
    a zoned one second give the second's zone, and a stored zone or no zone at all give null; two
    checked bleachers of different zones with nothing stored refuse the second.
  - `zoneConflictMessage`: the number and `#?`, the names and "another zone", with and without a day.
  - `gainsAndLosses`: nothing; the first service of a bleacher; a second service on it; a move; the
    last service deleted; a bleacher removed and added again in one write (no change); distinct
    results in order of appearance.
  - `checkedBleachersOfDraft`: an added entry; a stored entry whose bleacher changed; a stored entry
    with the same bleacher, a removed entry and an entry with no bleacher are left out.
  - `liveBleachersOfDraft`: removed entries and entries with no bleacher are left out, the order is
    the draft's, `exceptId` leaves one entry out.
  - `planRepairLinks`: rows of the pair are removed only for a lost bleacher that has a row; a row
    is inserted only for a gained bleacher that has none (no second row, D170); the zone is written
    only with a gain, only when none is stored and only when `zoneToStore` is not null; the lost
    bleachers are unlinked; for a repair that is not Completed every open report of a gained bleacher
    that is linked to no repair is linked, and a report linked to another repair and one linked to
    this repair are in no list; for a Completed repair the reports created no later than `eventEnd`
    (compared as a day in the zone, so `2026-11-06T02:00:00Z` is `2026-11-05` in Toronto) are in the
    close list and the others in no list; no `eventEnd` gives an empty close list; a loss and a gain
    in one plan.
- **`db/repairLinkWrite.test.ts`** (the harness of `repairStatusWrite.test.ts`: the app's Kysely
  compiled for SQLite, run on an in-memory `node:sqlite` shaped like the local database, with
  `createFakePowerSyncDb`).
  - The queries: services that are deleted are left out; the repair facts; the junction rows; the
    own zones and numbers; accepted sub-rentals only, with the days inclusive; open reports only
    (a closed and a deleted one are left out); zone names.
  - `buildLinkStatements`: the order of D184; the guards `resolved_at IS NULL` and "linked to no
    repair" or "linked to this repair"; an empty plan gives `[]`.
  - `writeRepairChanges` run on SQLite: the first service on an old repair (the row exists: no
    second row; the zone is written; a free report is linked, one linked elsewhere is not); a New
    repair's statements (rows, zone, links); a move (a gain and a loss); the last service deleted
    (the row removed, the links removed, the zone kept); a Completed repair (only the report created
    before `event_end` is linked and closed, with the same `resolved_at` as `now`); a zone refusal
    (the message comes back and **nothing** was written, the service included); `servicesAffected`
    false (one batch, no read); a failed write (the red toast with the message and the error text,
    thrown again).
  - `findServiceZoneConflict`: a new repair (no stored zone) with the other live bleachers in
    another zone; a stored zone that differs; no day (own zones only); null when compatible.
- **`db/serviceWrite.test.ts`** (changed, with `writeRepairChanges` mocked): `createService` passes
  the insert, the checked bleacher, `servicesAffected` true, `now`, `timezone` and the message, and
  returns `{ bleacherUuid }` for a refusal; `updateService` with an unchanged bleacher runs the
  plain batch and with a changed one runs `writeRepairChanges` with the new bleacher checked;
  `deleteService` runs it with nothing checked; the old cases keep passing.
- **`db/repairWrite.test.ts`** (changed, the same mock): `createRepair` with services runs it with
  the repair statement first and the services after, and the checked bleachers of the draft, and
  returns `{ services }` for a refusal; without services it runs the plain batch; `updateRepair` with
  a services change runs it with the fields, the status and the services statements in that order; a
  fields-only Save runs the plain batch; nothing changed writes nothing.
- **`utils/repairForm.test.ts`** (changed): a change of `eventStart` clears `services`; a change of
  any other field keeps it; the same object comes back when nothing is cleared.
- **`components/RepairForm.test.tsx`** (changed): `firstErrorFieldId` gives `repair-services-error`
  when `services` is the only error and the first field otherwise.
- **`components/RepairWindow.test.tsx`** (changed): `RepairServicesSection` draws the line with the
  test id `repair-services-error` only when `error` is given.
- **`permissionPageData.test.ts`:** the changed descriptions and notes of §5 and the unchanged levels.
- **A mutation check** (the habit of specs 03 to 09b1): three rules are broken on purpose and the
  tests must fail: (1) a bleacher that lost its last live service keeps its junction rows (D169);
  (2) a report linked to another repair is linked anyway (D179); (3) a service in another zone is not
  refused (D176). The files are restored by their hash afterwards.

## 8. Edge cases and errors

- **Clerk and auth.** Every write is local and makes no network call, so a Clerk error does not
  reach it. The role comes from `useTeamPermissions`, as for the repair; while it is not known no
  button is drawn.
- **Offline** (D120, extended): the junction, the zone, the links and the closings are written
  locally and shown at once; the server, the other people, the Dashboard and the phones learn about
  them when the connection is back.
- **Deploy order.** The migration `20261117120000` and the sync rules of spec 02 must be on the
  server before any user writes a service (09b1 §8); `BleacherMaintEvents`, `DamageReports` and
  `SubrentalEvents` already sync. A write to a table or a column the server does not have fails
  with a code that is not in the connector's discard list, so it is retried without end and the
  upload queue of that user waits; nothing is lost, but nothing reaches the server.
- **The server refuses.** For an administrator and a maintainer the database rules cannot refuse a
  junction, service or report write. A foreign key that fails (a bleacher deleted for good) or an
  amount outside the `integer` range is class 22 or 23: the connector discards that operation and
  the rest of its transaction, with its general toast. Because the services come first (D184), the
  server then holds at most a bleacher, a zone or a link without a service, which the page allows.
  The device shows the server's state after the next sync.
- **Two devices.** Each upload sends the columns it changed. A link written on one device and a
  different link written on another for the same report: the later upload wins; the guard
  `resolved_at IS NULL` is part of the local statement only. Two devices that insert a row for the
  same bleacher make a duplicate pair (D170).
- **A draft and other people.** The reads of §2.1 happen at Save, not when the window opened. A
  service that someone added meanwhile is in "before" and "after" alike and is not touched; a
  bleacher whose last service someone deleted meanwhile is not a loss of this Save.
- **A report created by a driver after the first service** is not linked (D182); `Reported` finds it
  only by category, which is empty, so it is not found. It is linked when its bleacher's live
  services go to none and come back.
- **A report linked to a deleted repair** (D179, D183) stays with it: no other repair takes it. It is
  closed by hand on the Damage Reports page, or by restoring the repair and completing it.
- **The Damage Reports page** shows "Linked to: Maintenance / Repair" for a linked open report, and its
  modal still offers "Create Maintenance to Resolve" for it. The modal links the report to the new
  repair and closes it, so the repair that had it loses it from Reported without a message (D173).
- **The Dashboard form's Save** (D173) writes `cost_cents` from its own field, so a repair that has
  services can have its Total set over the sum of its services (a Total that is stale because the
  form was opened earlier, or typed by hand), and the trigger runs again only when a service changes.
  It also removes every junction row of the repair and inserts the form's list, so a bleacher
  removed in the form leaves its services behind it, with no row; and a row added by a service after
  the form was opened is gone after its Save. Spec 11 removes the form.
- **A repair edited into a new day** keeps its zone (D172). A sub-rental accepted after the zone was
  written does not move it (maintenance-01 §7).
- **A Completed old repair** (D185): a service added to record an invoice does not close the reports
  that came after `event_end`.
- **A status change and a first service in one Save:** the status statements run first (spec 08), then
  the services, then the links; the guard keeps a report from being closed twice.
- **A bleacher without a number** is named `#?` in the refusal; a zone without a name is "another
  zone".
- **Two accepted sub-rentals of one bleacher on one day** with different zones give no zone (D177);
  the schema does not forbid the overlap and none exists locally.
- **The Total** is not changed here (09b1 D159); a repair made with services has no `cost_cents` until
  the server has added them up.

## 9. Not in this spec

- **The files** (upload, delete, the draft's files in New repair): spec 09b3.
- **The Dashboard form and the "Create Maintenance to Resolve" modal** (D173): they keep their own way
  of writing the junction and the reports; spec 11 deals with the form, and nobody is assigned the
  modal.
- **A migration** (a unique index on the junction pair, D170) and **a change of the sync rules**.
- **Recomputing or clearing the zone** when the days change or the services go (D172), and a choice of
  zone by hand.
- **Linking reports by category** (D178): `DamageReportCategories` is empty; this waits for the driver
  app.
- **Linking a report that a driver creates later** (D182), and **freeing a report that belongs to a
  deleted repair** (D179, D183).
- **A backfill** of the zone or of links for old repairs: they get them when a service is added.
- **A success message, an offline hint, an undo.**
- **A browser check** (the Browser pane cannot run PowerSync) and **running the Playwright scenarios**.
- **The permissions spec 10** (the gates in general, the role specs and the last check of the matrix).

## 10. Definition of done

- `npm run tc` and `npx vitest run`, each with the real output and the exit code (Node 24 first in
  `PATH`).
- `npx prettier --check` on the files this spec touches only (the repo-wide `npm run lint` is red at
  baseline); the spec's Markdown is also checked for an inline code span that breaks a line.
- Playwright E2E: **written (S34 to S42) and not run**; the report says so.
- The browser check is skipped; the report lists what nobody has seen: the red line and the text
  under Bleacher in a real window, the check of a draft's service window, the Bleachers and Zone
  columns after a service is saved, the Reported day after a link, the bars on the Dashboard, a
  Completed repair closing reports, and the first real upload of a junction row, a zone and a report
  update.
- The matrix rows of §5 are edited in the same commit.
- The Ukrainian artifact of this spec is updated with the status and the result.
- The final report with real output: TS compilation, Vitest, E2E (written, not run). The deploy
  order is repeated: the migration and the sync rules (`../br_powersync` 692b21c, not pushed) on the
  server before the first write.

## 11. Result (2026-11-23)

- **Done as specified.** A service now keeps the repair's junction, its zone and the links of its open
  damage reports in step, in one local transaction: Add service, Edit (a moved bleacher) and Delete of a
  service, and the services draft of New repair and of Edit; a service in another zone is refused (under
  Bleacher, or as the red line above the table at Save); the matrix rows. 8 counted files (2 new:
  `utils/repairLinks.ts`, `db/repairLinkWrite.ts`; 6 changed: `serviceWrite.ts`, `repairWrite.ts`,
  `repairForm.ts`, `RepairForm.tsx`, `RepairWindow.tsx`, `RepairsPage.tsx`) plus the matrix, the tests
  and the e2e files. No migration, no sync change, no change to the list query, to `useRepairList` or to
  `AppSchema.ts`.
- **Tests first.** Red run before any code: 8 files failed. Two suites could not import their module
  (`repairLinks.test.ts`, `repairLinkWrite.test.ts`) and 20 tests failed in six changed files
  (`repairWrite.test.ts` 6, `serviceWrite.test.ts` 7, `permissionPageData.test.ts` 4,
  `repairForm.test.ts`, `RepairForm.test.tsx` and `RepairWindow.test.tsx` 1 each). Then green.
- **Checks (real output).** `npm run tc` exit 0. `npx vitest run` exit 0: 576 files, 8686 tests (before
  this spec 574 files and 8599 tests: +2 files, +87 tests). `prettier --check` clean on the 17 source and
  test files and the 6 e2e files this spec touches (the repo-wide check is red at baseline), and no
  inline code span of the spec breaks a line.
- **Mutation check.** Three rules were broken on purpose and the tests failed: the junction rows of a lost
  bleacher kept (D169, 4 failing tests), a report linked to another repair linked anyway (D179, 1), a
  service in another zone not refused (D176, 7). The file was restored and checked by hash.
- **E2E:** written (S34 to S42) and not run (D187; the user's rule). They are in
  `e2e/repairsLinks.admin.spec.ts` (S34 to S39), one scenario in each of the three access specs (S40 to
  S42), the helper `e2e/helpers/linksFlow.ts` and the fixture. **Browser check:** not done (the Browser
  pane cannot run PowerSync). Nobody has seen: the red line and the text under Bleacher in a real window,
  the check of a draft's service window, the Bleachers and Zone columns after a service is saved, the
  Reported day after a link, the bars on the Dashboard, a Completed repair closing reports, the selectors
  of the e2e scenarios (written from the markup), and the first real upload of a junction row, a zone and
  a report update.
- **Extras against the spec text** (no behaviour of the spec changed):
  - `writeRepairChanges` keeps the `servicesAffected: false` path (one batch, no read), and it is tested,
    but no caller uses it: the writers keep their own plain batch for a write that changes no service.
  - `buildCreateServiceStatement` and `buildUpdateServiceStatement` take a narrower input (`Pick` of
    `CreateServiceInput` and `UpdateServiceInput`): they need neither the repair's time zone nor `now`
    for the update.
  - `RepairWindowContentProps` also has `servicesError`, which the Edit mode uses to draw the red line
    through the content; the New repair window gives it to `RepairServicesSection` directly.
  - The row types of the reads are exported (`RawLiveServiceRow` and the others in `repairLinkWrite.ts`)
    and every read has an `ORDER BY`, so that a result is the same on every run.
  - The statements carry guards the plan already respects: the zone update has `zone_uuid IS NULL`, and
    the link and the closing have `maintenance_event_uuid IS NULL`, so a report linked elsewhere is
    protected twice. The mutation of D179 therefore fails one test at the plan level only.
  - The e2e fixture creates fresh bleachers for each scenario instead of using bleacher A, because a
    service on a bleacher that already has live services is not a gain; §6 says so.
- **Not done.** Nothing is committed. The headers of specs 04 to 09b1 still say "uncommitted" and the
  plan still lists spec 09 as one spec (fix in a docs commit if told). Five commits are not pushed:
  56f00da2, b9abca86, bd586ad6, 2d0f5931 and 60c73fbc. `seed.sql`, `supabase/.temp/cli-latest` and
  `scripts/seed_add_on_conflict.py` stay out of every commit.
