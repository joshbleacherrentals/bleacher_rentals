# Repairs 09b3: The files of a repair (add, delete, and the draft in New repair and Edit)

Status: **APPROVED and IMPLEMENTED 2026-11-23**, uncommitted (0 open decisions; D189 to D206 were
taken by the user in six question batches on 2026-11-23; the results are in §11; the Playwright
scenarios are written and not run (D206) and the browser check was not done). Build order: **09b3 of 11** (the plan's spec 09 is split: 09a
is done and committed as 2d0f5931, 09b1 as 60c73fbc and 09b2 as f3a49a90; 09b is cut into three
specs, D148, and 09b3 is the files). Needs: [repairs-01-design.md](repairs-01-design.md),
[repairs-02-sync-rules.md](repairs-02-sync-rules.md),
[repairs-03-list-query.md](repairs-03-list-query.md), [repairs-04-table.md](repairs-04-table.md),
[repairs-05-toolbar.md](repairs-05-toolbar.md),
[repairs-06-expanded-row.md](repairs-06-expanded-row.md),
[repairs-07-repair-window.md](repairs-07-repair-window.md),
[repairs-08-status.md](repairs-08-status.md),
[repairs-09a-repair-writes.md](repairs-09a-repair-writes.md),
[repairs-09b1-services.md](repairs-09b1-services.md) and
[repairs-09b2-bleachers-zone-reports.md](repairs-09b2-bleachers-zone-reports.md) (all done and
committed: 04 is 5280565b, 05 9567144a, 06 56f00da2, 07 b9abca86, 08 bd586ad6, 09a 2d0f5931, 09b1
60c73fbc, 09b2 f3a49a90; the branch is one commit ahead of its upstream, which is 09b2). Needed by:
spec 10 and spec 11. Plan: [repairs-plan.md](repairs-plan.md). Branch: `q4-sprint4-maintenance`.

Scope: **an administrator and a maintainer add files to a repair and delete them in the repair
window, and the files of New repair and of Edit are a draft written at Save.** In the view mode of
the window a file is uploaded the moment it is picked and deleted the moment its dialog is
confirmed. In Edit and in New repair the picked files stay in the window's memory, a stored file
that is removed is only marked, and Save writes the repair, its services and then the files. A file
is written straight to Supabase (its object to Storage, its row to `MaintenancePhotos`), not to
the local database: D99 of spec 07 stays, the table is not synced, so a file needs a connection and,
for a repair that is still in the upload queue, a wait until the repair is on the server (D193). It
changes clauses of spec 07 (D99, §2.5, §9), of spec 09a (§2.2), of spec 09b1 (D149, §2.6, §3) and
of spec 09b2 (§9); §3 lists every one, and the "Approved" of this spec approves them, together
with the sentences of the permissions matrix (§5). No migration, no sync change, no `AppSchema.ts`
change, no change to the list query or to the locked types of specs 03 and 05. The Dashboard form
and the "Create Maintenance to Resolve" modal keep their own Files flows (09b2 D173).

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

**Decisions of spec 09b2 (done, user, 2026-11-23; seven question batches).**

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

**Decisions of this spec (user, 2026-11-23; six question batches).**

- **D189 (the cut):** 09b3 is one spec: adding a file, deleting a file and the draft of files in
  New repair and in Edit. They change the same component and the same Save, so they are not cut
  apart.
- **D190 (where the buttons are):** in the repair window: in its view mode, in Edit and in New
  repair (D149). Not in the open row of the table and not in the service window.
- **D191 (what is written at once and what waits):** in the view mode a file is uploaded the
  moment it is picked, and a stored file is deleted the moment its dialog is confirmed (the way of
  the services, 09b1 D161). In Edit and in New repair the picked files stay in the window's memory
  and a stored file that is removed is only marked; Save writes them. Cancel, Discard and the
  cross drop the draft, and "Discard changes?" counts the files (this extends 09a D129 and 09b1
  D161).
- **D192 (when a file goes to Storage):** when Save is pressed (Edit, New repair) or when the file
  is picked (view mode), never earlier. Cancel and Discard therefore leave nothing in Storage.
- **D193 (a repair that is not on the server yet):** a file row points at its repair by a foreign
  key, and a repair made on this device reaches the server after the moment of Save (the
  connector uploads one operation at a time). Before the first upload of a write the writer asks
  Supabase for the repair by its id, again every 0.5 s, for at most 10 s, and goes on when the
  repair answers. An old repair answers at the first request, so nothing waits for it. The wait is
  for the repair, not for the whole upload queue, so a stuck change of another table does not
  block the files. It applies to Save in New repair and in Edit and to Add file in the view mode;
  a deletion does not wait.
- **D194 (the files do not arrive at Save):** the repair and its services are already saved
  locally and are not undone. The window leaves as after any Save (New repair closes, Edit goes
  back to the view mode), a red toast says that the repair was saved and what was not done, and
  the files that were in memory are lost; they are added again from the view mode. This holds for
  a lost connection, an error of Storage or of the table, and a wait that ended after 10 s. In New
  repair and in Edit the order is the same: the local write first, then the network.
- **D195 (several files, one fails):** a file that is stored stays stored and the rest are still
  tried. One red toast names the files that were not added, by the name they have on the disk. The
  same in the view mode.
- **D196 (the order of a deletion):** the row first, then the object in Storage. When the object
  cannot be removed after its row has gone, the file is gone from the list, an object that nothing
  points to stays in the bucket, and the person sees no message (the list is true). When the row
  cannot be deleted, the file stays and a red toast says so.
- **D197 (which files):** the type is checked by the MIME type the browser gives, as the old Files
  tab does, against the 13 types of the bucket (jpeg, jpg, png, heic, heif, webp, pdf, doc, docx,
  xls, xlsx, txt and csv, each as its MIME type), and the size is at most 10 MB. A file that fails
  a check gets a line in a red toast and does not join; the others do. A browser that gives no
  MIME type for a file (some do for HEIC) gets that file refused.
- **D198 (several at a time):** the file picker takes several files at once, each checked on its
  own.
- **D199 (nothing else is limited):** two files alike are allowed (each is named by its order),
  and a repair has no limit on the number of files.
- **D200 (a file in the draft):** it shows the name it has on the disk and its size, a remove
  button and no open button. Removing it takes it out of the draft at once, with no dialog. After
  Save only the stored name is left: files are named "Photo 1", "PDF 1" by their order (spec 07
  D103), so the name on the disk is not kept.
- **D201 (when the buttons are drawn):** only for an administrator and a maintainer (09a D124,
  09b1 D165), only for a repair that is not deleted, and whatever its status (as 09b1 D164). For a
  repair that exists, Add file is drawn only when its list of files has loaded: not while it says
  "Loading..." and not when it could not be read. In New repair it is always drawn. An account
  manager sees the list and the open buttons, a viewer sees no Files section (spec 07 D102), and
  a deleted repair has no button for anyone.
- **D202 (the dialog of a stored file):** a stored file is removed through a dialog everywhere,
  in the view mode and in Edit. Title "Are you absolutely sure?". In the view mode the text is
  "This removes Photo 2 from the repair. It cannot be undone in the app."; in Edit it says that
  the file is removed when the repair is saved. Cancel and Continue. A file that is only in the
  draft has no dialog (D200). After a removal the names shift at once: removing "Photo 1" makes
  the next photo "Photo 1", because names are by order (spec 07 D103).
- **D203 (no check of the connection):** nothing asks whether the browser is online before a Save
  with files or an Add file. Without a connection a Save with files does what D194 says after its
  wait (a New repair waits the 10 s first), and Add file in the view mode shows a red toast.
- **D204 (the order inside Save):** the new files first (after the wait of D193), then the
  deletions.
- **D205 (the matrix):** the levels of both rows do not change; the sentences and the notes do
  (§5).
- **D206 (e2e):** Playwright scenarios are written and not run: the full set for the
  administrator and one scenario each for the account manager and the maintainer (S43 to S50, §6).
  The viewer's S33 already says there is no Files section.

**Carried over, not asked again.** D148 (09b3 is the files) and D149 (in New repair the files join
the same draft as the services); D124 and D165 (an administrator and a maintainer write; an
account manager and a viewer only read, though the database would let an account manager write);
D102 (a viewer sees no Files section); D99 to D104 (the list is read straight from the table, the
names, the open button, no size); D173 (the Dashboard form and the modal stay as they are); the
style of 09a and 09b1 (no green toast of success, a red toast with the error text for a failed
write, "Discard changes?" on the cross, Esc and a click outside when something changed, Cancel
drops at once).

**What follows from the design and from earlier decisions (no new decision).** Each item names its
source, so a reviewer can check it. The last item is wording only; it is listed so it can be
corrected, and no behaviour hangs on it.

- **Words.** A _stored file_ is a row of `MaintenancePhotos` of this repair with its object in
  Storage. A _draft file_ is a picked file in the window's memory. The _name_ of a stored file is
  "Photo 1", "PDF 2" by its type and order (spec 07 D103).
- **The wait comes before any upload** of a write (D193), so a wait that ends badly leaves Storage
  untouched. A request of the wait that fails (no network, a refused request) counts as "not yet",
  like an empty answer, so the wait of a Save without a connection lasts the 10 s (D203).
- **Deletions run even when the wait failed** (D204): a stored file belongs to a repair that is on
  the server already.
- **An add that fails between the object and its row** removes the object it just made, best
  effort, so an add never leaves an object without a row (the leftover of D196 is only for a
  deletion).
- **Edit with only files changed** writes nothing locally (09b1 §2.6: "nothing changed" is a
  return without writes) and runs the files. **A Save refused by validation** (the days, the
  duplicate invoice number, a zone conflict, 09a and 09b2) runs no network part and keeps the
  draft.
- **After the files** of a Save or of the view mode, whether they went well or not, the list of
  files is read again, so the list shows what the server holds.
- **A viewer makes no request** (spec 07 D102); an account manager reads and has no button (D201).
- **Another person's changes** to the files are not pushed to an open window: the list is read
  when the section opens and after each write of this window.
- **Names in a toast.** A draft file is named by its name on the disk; a stored file by the name
  it had in the list when it was removed.
- **A pick in the view mode** is one operation: the picked files are checked, the good ones are
  written one after another, and the toast of D195 names the failures. Add file reads
  "Uploading..." and is disabled while it runs; the buttons of the list are disabled too.
- **Closing the window** (the cross, Esc, a click outside) while an upload of the view mode runs
  does not stop it; its toast comes when it ends.
- **The Dashboard form and the modal** (09b2 D173) write files by their own code, and this spec
  does not touch them. Their files appear in the list at its next read.
- **Wording chosen by me** (presentation only): the lines of the toasts, the text of the dialog in
  Edit, "Add file", "Uploading...", the label "Remove", and the test ids.

## 1. What the code has today (researched 2026-11-23)

- **The table and its policies.** `MaintenancePhotos` has `id` (uuid, default), `maintenance_event_uuid`
  (foreign key to `MaintenanceEvents`, `ON DELETE CASCADE`), `photo_path` and `created_at` (default
  `now()`). It has no name, no size, no author and no `deleted`, so a delete is a real delete, and
  it has no trigger. Four row-level policies (select, insert, update, delete) give it to an
  administrator, an account manager and a maintainer; a viewer gets an empty list without an
  error (spec 07 D102). It is not in `AppSchema.ts` and not in the sync rules: it is not synced.
- **Storage.** The bucket `maintenance-photos` is public, limited to 10 485 760 bytes, and allows 13
  MIME types (jpeg, jpg, png, heic, heif, webp, pdf, doc, docx, xls, xlsx, txt, csv). Its four
  policies check only the bucket, not the role and not the repair. An object is stored at
  `<repair id>/<uuid>.<extension>` with `upsert: false`.
- **The local data** (2026-11-23): 76 rows on 56 repairs (30 pdf, 45 images, 1 docx), 76 objects in
  the bucket, no row without an object and no object without a row, 7 files at most on one repair,
  4.4 MB the largest.
- **The read** (spec 07 §2.5). `useRepairFiles` in `hooks/useRepairDetails.ts` reads
  `MaintenancePhotos` through `useClerkSupabaseClient` and React Query with the key
  `["repair-files", repairId, sessionId]` and waits for the Clerk session; it returns the state and
  the rows named by `buildRepairFileRows` (`utils/repairWindow.ts`). `components/RepairFiles.tsx`
  draws them (`RepairFilesContent`, a card of rows, each with a link and an open button) and is
  mounted by `RepairWindow` as the `files` node, only when `canReadRepairFiles` is true. The same
  node is drawn in Edit, read-only; the New repair window has no Files section (09b1 D149 says the
  files join its draft in this spec).
- **The window and its writers.** `RepairWindow.tsx` has `useRepairDraft` (the fields, the
  services draft, the errors, `saving`, `dirty`), `RepairEditBody` (Edit), `NewRepairWindow`,
  the handler `RepairEditing.onSave` (it takes the initial values, the values and the services) and
  the handler `NewRepairWindowProps.onCreate` (the values and the services). `RepairsPage.tsx`
  builds them: `updateRepair` and `createRepair` from `db/repairWrite.ts` write one local
  transaction (09b2: through `writeRepairChanges`). `createRepair` makes the id of the new repair
  inside itself and returns only the errors, so the page does not know the id.
- **The old flows** (not changed here, 09b2 D173). `MaintenanceFilesTab`
  (`src/features/maintenanceEvents/components/tabs/FilesTab.tsx`, the Dashboard form) checks `file.type`
  against the 13 types and 10 MB, uploads the object, then inserts the row; it deletes the object
  first and the row after, so a failure between them leaves a row with no object; after a change it
  invalidates its query. `DamageReportResolveMaintenanceModal` uploads its files after
  `createMaintenanceEvent`, which writes straight to Supabase, so its repair is on the server
  already. Both talk to Supabase directly.
- **How an upload of the local database works** (`src/lib/powersync/BackendConnector.ts`). The
  operations of one local transaction go up one by one; only an error of class 22 or 23 or
  `42501` discards the operation, and any other error is retried without end. So a repair made by
  New repair is on the server some time after Save: at once when the device is online and the queue
  is short, much later when it is offline, or never while the migration `20261117120000` and the sync
  rules (`../br_powersync` 692b21c) are not on the server (09b1 §1, 09b2 §8).
- **A helper that looks alike and is not reused.** `waitForEmptyUploadQueue`
  (`src/features/quotesAndBookings/utils/requestInvoiceCheck.ts`) polls
  `powerSyncDb.getUploadQueueStats()` every 500 ms for at most 10 s. It waits for the whole queue
  (D193 asks for the repair only), but its shape (an injected check and an injected `sleep`) is the
  shape `waitForRepairOnServer` takes.
- **Toasts.** `createErrorToast` and `createErrorToastNoThrow` (`components/toasts/ErrorToast.tsx`);
  `repairWrite.ts` has its own `showErrorToast` for the repair writers.
- **The matrix.** Two rows say the files cannot be edited: "Repairs & Maintenance" ("a repair's files
  are still edited from the Dashboard", "but not yet their files", "and the Dashboard for their
  files") and "Repair Costs & Vendors" ("the files cannot be edited yet"). §5 gives the new text.
- **Tests that exist.** `RepairFiles.test.tsx`, `RepairWindow.test.tsx`, `repairWindow.test.ts`,
  `repairWrite.test.ts`, `permissionPageData.test.ts`, and the e2e helper `readRepairWindow` with its
  `canSeeFiles` option (S32, S33), whose fixture seeds `MaintenancePhotos` rows.

## 2. The behaviour

### 2.1 Who gets what, and where (D190, D201)

- `RepairsPage` has `canManage` (`canManageDamageAndMaintenance`, an administrator or a maintainer).
  For every other role nothing changes from spec 07: an account manager sees the list and can open
  the files, a viewer sees no Files section.
- For a writer the Files section of the repair window has three forms:
  - **View mode:** each stored file has a remove button, and under the list there is Add file (when
    the list has loaded). A pick uploads at once, a removal deletes at once (§2.5).
  - **Edit:** the same buttons, but they change the draft (§2.2).
  - **New repair:** a Files section after the Services block: "No files." or the draft rows, and
    Add file. Always drawn.
- **Not drawn:** a button of files in the open row of the table, in the service window, in the window
  of a deleted repair or in the Show Deleted view (D190, D201); and, as in spec 07, a drop zone and
  the size of a stored file (the database does not hold it).
- The status of the repair does not matter (D201).

### 2.2 The Files section in each mode (D191, D200 to D202)

- **A stored row** (spec 07 §2.5, unchanged): a document icon, the name as a link, "Added 2026-09-18",
  and the open button. For a writer a 32 px icon button follows it, a bin, with the label "Delete
  Photo 1" (`data-testid="repair-file-delete"`).
- **A draft row** (`data-testid="repair-file-draft"`), after the stored rows, in the order of the
  picking: the document icon, the name on the disk as plain text (not a link), the size in 13 px grey
  (the place of "Added ..."), and a 32 px bin with the label "Remove IMG_0412.jpg"
  (`data-testid="repair-file-draft-remove"`). No open button (D200).
- **The text.** "No files." only when there is no stored row and no draft row. "Loading..." and
  "Files could not be loaded. They need a connection." are spec 07's, and the section has no Add file
  while either shows (D201); a draft that was made before an error stays in the draft.
- **Add file** (`data-testid="repair-file-add"`): under the list, the outlined button of Add service
  (a plus and the text "Add file"). It opens the system picker through a hidden file input with
  `multiple` and with `accept` set to the 13 MIME types (`data-testid="repair-file-input"`). The
  input is emptied after each pick, so the same file can be picked again.
- **Edit and New repair keep a draft** (`FilesDraft`, §3) in the window's memory next to the
  fields and the services. A stored file that is removed leaves the list at once and is kept in the
  draft as removed; the names of the rest are made again from the remaining rows (D202). A draft file
  that is removed leaves the draft. Cancel, Discard and the cross drop it; the window is dirty when
  the fields, the services or the files differ (D191).
- **While the window saves** (`saving`) every file button is disabled, like the fields.

### 2.3 Picking files (D197 to D199)

1. Each picked file is checked on its own: the type first (`file.type` must be one of the 13 MIME
   types; an empty type is refused), then the size (more than 10 485 760 bytes is refused, exactly
   that many is accepted).
2. The refused files give one red toast: the title "Some files were not added." and a line for each,
   "IMG_0412.zip: this type of file is not allowed." or "scan.pdf: larger than 10 MB.".
3. The accepted files join the draft in the order picked (Edit, New repair), or are written at once
   (view mode, §2.5). Nothing else is checked: two files alike are two files and the number is not
   limited (D199).

### 2.4 The Save (D191 to D196, D203, D204)

Save of New repair and of Edit is the one of 09a, 09b1 and 09b2 with a network part after it:

1. **Validation** (09a §2.4: the days, the duplicate invoice number; 09b2: a zone conflict). A
   refusal ends the Save: nothing is written, no network is touched and the draft, files included,
   stays.
2. **The local transaction** of 09a, 09b1 and 09b2, unchanged. When it fails the writer shows its red
   toast, the window stays in Edit and no network is touched. When nothing changed (the files are the
   only change of an Edit) there is no local write.
3. **The wait** (D193), only when the draft has files to add: `waitForRepairOnServer` asks Supabase
   for the repair by its id, at once and then every 0.5 s, and ends when it answers or after 10 s. A
   request that fails counts as "not yet". When it ends without an answer every file to add is
   "not added" with the text "The repair has not reached the server yet.", and step 4 is skipped.
4. **The new files** (D195), one after another in the order picked: the object is uploaded to
   `<repair id>/<new uuid>.<extension>` with `upsert: false`, then the row is inserted
   (`maintenance_event_uuid` and `photo_path`; the id and the time come from the database). A file
   whose upload or insert fails is "not added" with the error text, the object it may have made is
   removed (best effort), and the next file is tried.
5. **The deletions** (D196, D204), one after another: the row is deleted, then its object. A row that
   cannot be deleted is "not removed" with the error text and its object is left alone. An object that
   cannot be removed after its row has gone is ignored (the console gets the error).
6. **The list is read again** (the key `["repair-files", <repair id>]` is invalidated) and, when
   anything failed, **one red toast** shows (§3 `filesFailureLines`): a title that says the repair was
   saved and that some files could not be added, removed or both; a line "Not added: a.jpg, b.pdf"
   with the names on the disk; a line "Not removed: Photo 2" with the names the files had when they
   were removed; and the text of the first failure.
7. **The window leaves** as after a Save that went well (D194): New repair closes, Edit goes back to
   the view mode, whether the files went or not. The files that failed are lost with the draft.

The extension (step 4) is the text after the last dot of the file's name, in lower case, when it is
made of letters and digits; otherwise it comes from the MIME type (jpg for `image/jpeg` and
`image/jpg`, png, heic, heif, webp, pdf, doc, docx, xls, xlsx, txt, csv).

The Save button reads "Saving..." for the whole time, the wait included, so a New repair with files
and no connection holds the window for the 10 s of the wait (D203).

### 2.5 The view mode (D191, D193, D195, D196)

- **Add file.** A pick is checked (§2.3), then the accepted files are written as steps 3 and 4 of §2.4
  say: the wait (an old repair answers at once), then each file. Add file reads "Uploading..." and the
  buttons of the list are disabled while it runs. When it ends the list is read again and, when a file
  failed, the red toast shows with the title "Some files could not be added.", the line "Not added: ..."
  and the first error text. A pick with no connection ends in that toast.
- **Delete a file.** The bin opens the dialog of §2.6; Continue deletes the row and then the object (step
  5). The dialog stays open with Continue reading "Deleting..." until it is done, then closes and the
  list is read again. When the row cannot be deleted the file stays and the red toast "Failed to delete
  the file." shows with the error text.
- **Nothing is shown for a success** (09a D140): the list is the answer.
- A change of the list by another person shows when the list is read again (§0, "what follows").

### 2.6 The dialog of a stored file (D202)

- Built as the other delete dialogs of the window (`AlertDialog`, Cancel and a red Continue,
  `data-testid="repair-file-delete-dialog"`). Title "Are you absolutely sure?".
- **View mode:** "This removes Photo 2 from the repair. It cannot be undone in the app."
- **Edit:** "Photo 2 will be removed from the repair when you save." Continue marks the file removed
  in the draft; Cancel and Discard drop the mark.
- A draft file has no dialog (D200): its bin takes it out of the draft at once.

### 2.7 What a person sees

- No green toast anywhere (09a D140). A red toast shows for a refused file (§2.3), a failed Save of
  files (§2.4 step 6) and a failed Add file or delete of the view mode (§2.5).
- After a Save the view mode shows the stored files with their names by order ("Photo 1", "PDF 1");
  the names on the disk are gone (D200).
- Offline, the list says "Files could not be loaded. They need a connection." (spec 07), and the
  buttons follow D201.

### 2.8 The page

`RepairsPage` gives the window what it needs and nothing more:

- It builds one `RepairFilesClient` from `useClerkSupabaseClient()` and has `useQueryClient()`.
- `onSave(initial, values, services, files)` of `RepairEditing`: `updateRepair` as before; when it
  returns errors, return them; otherwise `saveFiles(repair.id, files)` and return null.
- `onCreate(values, services, files)` of the New repair window: make the id (`crypto.randomUUID()`),
  call `createRepair` with it; when it returns errors, return them; otherwise `saveFiles(id, files)`
  and return null.
- `saveFiles` does nothing when the draft has no change; otherwise it runs `saveRepairFiles`
  (§2.4 steps 3 to 5), invalidates `["repair-files", repairId]` and shows the toast of step 6.
- The view mode does its own writes inside `RepairFiles` (it has the Clerk client and the query
  client itself), so the page gives it nothing but `canWrite`, which `RepairWindow` computes
  (`editing` is given and the repair is not deleted).

### 2.9 Examples

- **Edit.** A repair has "Photo 1" and "PDF 1". The maintainer picks `IMG_0412.jpg` (2.4 MB) and
  removes "Photo 1": the dialog says the file goes when the repair is saved; the list reads
  "PDF 1" and `IMG_0412.jpg` with "2.4 MB". Save: nothing changed locally, the repair answers the first
  request of the wait, the image is uploaded and its row inserted, the old row and object are deleted,
  the list is read again, and the window is in the view mode: "PDF 1", "Photo 1".
- **New repair with no connection.** An administrator fills the days, adds a service and two photos,
  and presses Add repair. The repair and the service are saved locally; the button reads "Saving..."
  for 10 s; the window closes and a red toast says: "The repair was saved, but some files could not be
  added." "Not added: a.jpg, b.jpg" "The repair has not reached the server yet."
- **View mode.** The administrator picks `big.pdf` (12 MB) and `ok.png`. A toast says "big.pdf: larger
  than 10 MB."; `ok.png` is uploaded; the list gets "Photo 2".

## 3. Types and signatures (locked; changing them needs a new "Approved")

`src/features/repairs/utils/repairFiles.ts` (new, pure; the rules of the files and the words):

```ts
import type { RawRepairFileRow, RepairFileRow } from "./repairWindow";

/** The public bucket of the files (spec 07 D99; the old Files tab uses it too). */
export const REPAIR_FILE_BUCKET = "maintenance-photos";
/** The bucket's limit: 10 MB, counted as 10 x 1024 x 1024 bytes (D197). */
export const REPAIR_FILE_MAX_BYTES = 10_485_760;
/** The 13 MIME types of the bucket (D197). */
export const REPAIR_FILE_MIME_TYPES: readonly string[];

/** A file picked and not yet written (D191). `key` is a new uuid, for React and for removal. */
export type DraftFile = { key: string; file: File };
/** The files part of the draft of a window: picked files, and stored files marked removed. */
export type FilesDraft = { added: DraftFile[]; removed: RepairFileRow[] };
export const EMPTY_FILES_DRAFT: FilesDraft;
/** True when a file is added or a stored file is removed. */
export function isFilesDraftChanged(draft: FilesDraft): boolean;

export type RefusedFile = { name: string; reason: "type" | "size" };
/** D197: the type by `file.type` (an empty type is refused), then the size; the order is kept. */
export function checkPickedFiles(files: readonly File[]): {
  accepted: File[];
  refused: RefusedFile[];
};
/** One line for each refused file (§2.3): "IMG_0412.zip: this type of file is not allowed.". */
export function refusedFilesLines(refused: readonly RefusedFile[]): string[];

export function addDraftFiles(
  draft: FilesDraft,
  files: readonly File[],
  makeKey: () => string,
): FilesDraft;
export function removeDraftFile(draft: FilesDraft, key: string): FilesDraft;
/** Marks a stored file removed; a second call for the same id changes nothing. */
export function removeStoredFile(draft: FilesDraft, row: RepairFileRow): FilesDraft;
/** The raw rows that are not marked removed; `buildRepairFileRows` then names them again (D202). */
export function storedRowsAfterRemovals(
  raw: readonly RawRepairFileRow[],
  draft: FilesDraft,
): RawRepairFileRow[];

/** The extension of the object's path (§2.4). */
export function fileExtension(file: { name: string; type: string }): string;
/** `<repair id>/<object id>.<extension>`. */
export function repairFilePath(
  repairId: string,
  objectId: string,
  file: { name: string; type: string },
): string;
/** "12 B", "340 KB", "2.4 MB" (D200). */
export function formatFileSize(bytes: number): string;

export type DeleteFileMode = "now" | "onSave";
/** The title and the text of the dialog of a stored file (D202). */
export function deleteFileDialogText(
  name: string,
  mode: DeleteFileMode,
): { title: string; description: string };

/** Wording chosen by me; a reviewer can correct it. */
export const REPAIR_FILE_MESSAGES: {
  readonly refusedTitle: string; // "Some files were not added."
  readonly notAllowedType: string; // "this type of file is not allowed."
  readonly tooLarge: string; // "larger than 10 MB."
  readonly savedNotAdded: string; // "The repair was saved, but some files could not be added."
  readonly savedNotRemoved: string; // "The repair was saved, but some files could not be removed."
  readonly savedNotUpdated: string; // "... could not be added or removed."
  readonly viewNotAdded: string; // "Some files could not be added."
  readonly viewNotRemoved: string; // "Failed to delete the file."
  readonly notOnServer: string; // "The repair has not reached the server yet."
};

export type FileFailure = { name: string; message: string };
export type SaveFilesResult = { notAdded: FileFailure[]; notRemoved: FileFailure[] };
/**
 * The lines of the red toast of a failed write (§2.4 step 6, §2.5), or null when nothing failed.
 * "save": the title says the repair was saved. "view": the titles of the view mode.
 */
export function filesFailureLines(
  result: SaveFilesResult,
  context: "save" | "view",
): string[] | null;
```

`src/features/repairs/db/repairFileWrite.ts` (new; the network part, with no React):

```ts
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../../../../database.types";
import type { DraftFile, SaveFilesResult } from "../utils/repairFiles";
import type { RepairFileRow } from "../utils/repairWindow";

/** What the writer needs from Supabase, so that a test can pass a fake (§7). */
export type RepairFilesClient = {
  /** Whether `MaintenanceEvents` has a row with this id; throws when the request fails. */
  repairExists: (repairId: string) => Promise<boolean>;
  /** Storage `upload(path, file, { upsert: false })`; throws on an error. */
  uploadObject: (path: string, file: File) => Promise<void>;
  /** Storage `remove([path])`; throws on an error. */
  removeObject: (path: string) => Promise<void>;
  /** `insert` into `MaintenancePhotos`; throws on an error. */
  insertRow: (repairId: string, path: string) => Promise<void>;
  /** `delete` from `MaintenancePhotos` by id; throws on an error. */
  deleteRow: (id: string) => Promise<void>;
};
export function makeRepairFilesClient(supabase: SupabaseClient<Database>): RepairFilesClient;

/**
 * D193: true as soon as `exists` answers true; a request that throws counts as "not yet"; false when
 * `maxMs` has passed without a yes. The check and the clock are passed in, like
 * `waitForEmptyUploadQueue`. The defaults are 500 ms and 10 000 ms.
 */
export async function waitForRepairOnServer(input: {
  exists: () => Promise<boolean>;
  sleep: (ms: number) => Promise<void>;
  intervalMs?: number;
  maxMs?: number;
}): Promise<boolean>;

/**
 * §2.4 steps 3 to 5, in the order of D204: the wait when there are files to add, the new files one
 * after another (D195), then the deletions (D196). Never throws: every failure is in the result.
 */
export async function saveRepairFiles(input: {
  client: RepairFilesClient;
  repairId: string;
  added: readonly DraftFile[];
  removed: readonly RepairFileRow[];
  makeObjectId?: () => string; // default crypto.randomUUID
  sleep?: (ms: number) => Promise<void>; // default setTimeout
}): Promise<SaveFilesResult>;
```

`src/features/repairs/components/RepairFiles.tsx` (changed):

```ts
export type RepairFilesControls = {
  /** Add file is drawn (D201): the list has loaded, or this is New repair. */
  canAdd: boolean;
  /** A write runs (a Save, an upload, a deletion): every button is disabled; Add file says so. */
  busy: boolean;
  /** The draft files, in the order picked (Edit, New repair); empty in the view mode. */
  added: readonly DraftFile[];
  onPick: (files: File[]) => void;
  onRemoveDraft: (key: string) => void;
  /** Opens the dialog of D202 for a stored file. */
  onRemoveStored: (row: RepairFileRow) => void;
};
export type RepairFilesContentProps = {
  state: "loading" | "error" | "ready";
  files: RepairFileRow[];
  fileUrl: (path: string) => string;
  /** Given to a writer for a repair that is not deleted (D201); absent: spec 07's read-only list. */
  controls?: RepairFilesControls;
};
export function RepairFilesContent(props: RepairFilesContentProps): JSX.Element;

/** View mode: reads the list and writes at once (D191). Mounted for a role that may read (D102). */
export function RepairFiles(props: { repairId: string; canWrite: boolean }): JSX.Element;
/** Edit: the stored list minus the removed ones, plus the draft (D191, D202). */
export function RepairFilesEdit(props: {
  repairId: string;
  draft: FilesDraft;
  onChange: Dispatch<SetStateAction<FilesDraft>>;
  disabled: boolean;
}): JSX.Element;
/** New repair: no stored list (09b1 D149), only the draft. */
export function RepairFilesNew(props: {
  draft: FilesDraft;
  onChange: Dispatch<SetStateAction<FilesDraft>>;
  disabled: boolean;
}): JSX.Element;
```

`src/features/repairs/hooks/useRepairDetails.ts` (changed): `useRepairFiles(repairId, timezone)` returns
`{ state, files, raw }`, where `raw` is the rows as read, so that a window can name the rows that
remain after a removal.

`src/features/repairs/components/RepairWindow.tsx` (changed):

```ts
export type RepairEditing = {
  // ...as in 09b2, except:
  onSave: (
    initial: RepairFormValues,
    values: RepairFormValues,
    services: ServicesDraft,
    files: FilesDraft,
  ) => Promise<RepairFormErrors | null>;
};
export type NewRepairWindowProps = {
  // ...as in 09b2, except:
  onCreate: (
    values: RepairFormValues,
    services: ServicesDraft,
    files: FilesDraft,
  ) => Promise<RepairFormErrors | null>;
};
```

`RepairEditBody` loses its `files: ReactNode` prop and draws `RepairFilesEdit` itself; the internal
`useRepairDraft` gains the `files` state and counts it in `dirty`; `RepairWindow` mounts
`<RepairFiles repairId canWrite />` in the view mode; `NewRepairWindow` draws `RepairFilesNew` after
the Services block.

`src/features/repairs/db/repairWrite.ts` (changed): `createRepair` takes an optional `id` of the
repair (`Omit<CreateRepairInput, "id"> & { id?: string }`); without it, it makes one as before. The
return type and every other rule of it do not change.

**Changed from earlier specs** (each is the old rule and what it becomes):

- **Spec 07 D99** ("the list is read straight from the table, not from the local database; no sync
  change, no `AppSchema.ts` change; it needs a network"): stays. The same table is now also written
  straight, so a write needs a network too (§2.4, D193).
- **Spec 07 §2.5** ("Not drawn (spec 09): the delete button of a file, the drop zone, the size"):
  the remove button and Add file are drawn for a writer (D201). A drop zone and the size of a stored
  file are still not drawn; a draft file shows its size (D200).
- **Spec 07 §9** (the upload and the deletion of a file are spec 09): they are this spec.
- **Spec 07 §3:** `useRepairFiles` returns `raw` too, and `RepairFilesContentProps` gains `controls`.
- **Spec 09a §2.2** ("the Services table and the Files section stay read-only" in Edit, and the
  draft is the fields): the Files section is editable in Edit and in the draft (D191).
- **Spec 09a D129 and spec 09b1 D161** ("Discard changes?" counts the fields and the services): it
  counts the files too (D191).
- **Spec 09b1 D149 and §2.6** ("the files join the same draft in 09b3", "Not in the draft: ... the
  files"): they join it. The statements of §2.6 are unchanged; the network part of §2.4 here runs
  after them.
- **Specs 09a and 09b1 §3:** `RepairEditing.onSave` and `NewRepairWindowProps.onCreate` gain a
  `files` argument of the type `FilesDraft`, and `createRepair` takes an optional `id`. Their
  return types do not change.
- **Spec 09b2 §9** ("the files: spec 09b3"): done here; D173 holds (§0).
- **The matrix sentences** that say the files cannot be edited, or are edited from the Dashboard
  (§5).
- **The tests** that say so: §7 lists them.

## 4. Files

**New (counted, 2):**

- `src/features/repairs/utils/repairFiles.ts`
- `src/features/repairs/db/repairFileWrite.ts`

**Changed (counted, 5):** `components/RepairFiles.tsx` (the controls, the draft rows, the dialog, the
view mode's own writes, `RepairFilesEdit`, `RepairFilesNew`), `components/RepairWindow.tsx` (the
files draft, the New repair section, the two signatures), `components/RepairsPage.tsx` (the client,
`saveFiles`, the two wrappers), `hooks/useRepairDetails.ts` (`raw`), `db/repairWrite.ts` (the `id`).

**Changed, not counted:** `src/features/userAccess/permissionPageData.ts` (§5) and its test.

**Tests (not counted):** `utils/repairFiles.test.ts` and `db/repairFileWrite.test.ts` (new);
`components/RepairFiles.test.tsx`, `db/repairWrite.test.ts` and `permissionPageData.test.ts`
(changed). **E2E (written, not run, D206):** `e2e/repairsFiles.admin.spec.ts` and
`e2e/helpers/filesFlow.ts` (new), a scenario each in `e2e/repairsAccess.am.spec.ts` and
`e2e/repairsAccess.maintainer.spec.ts`, and `e2e/helpers/repairsFixtures.ts` (a repair with no files,
the objects of a scenario removed at teardown).

**7 counted files**, below the cap of 10; one logic (the files of a repair).

No migration, no `database.types.ts`, no `AppSchema.ts` change (the table is not synced and exists),
no sync rule, no new package.

## 5. The permissions matrix (`permissionPageData.ts`, same commit)

**Checked, the rule is the page's, not the database's.** No role gains data and no level changes
(D205). The writes are the administrator's and the maintainer's, as every other write on the page
(09b1 D165). The database would let an account manager add and delete files too; the page does not
offer it. The viewer still does not see the Files section (D102).

**Edits in the row "Repairs & Maintenance":**

- The description. After "...on a Completed repair it links and closes the ones reported before the
  repair ended." the sentence "They also add files to a repair and delete them, in its window." is
  inserted, and the last sentence "The Dashboard form still edits a repair's bleachers on its own, and
  a repair's files are still edited from the Dashboard." becomes "The Dashboard form still edits a
  repair's bleachers and its files on its own."
- The note of the administrator: "...which also set the repair's bleachers, zone and damage report
  links, but not yet their files." becomes "...which also set the repair's bleachers, zone and damage
  report links, and adds and deletes their files."
- The note of the account manager: "...change its status, or change its services." becomes "...change
  its status, change its services, or change its files."
- The note of the maintainer: "...delete and restore them, and the Dashboard for their files."
  becomes "...delete and restore them, and add and delete their files; the Dashboard form can still
  change them too."
- The viewer, the developer, the driver and the accountant: no edit.

**Edits in the row "Repair Costs & Vendors":**

- The description: "The total cannot be typed in, and the files cannot be edited yet." becomes "The
  total cannot be typed in. An administrator and a maintainer also add files to a repair and delete
  them, in the repair window." The last sentence of the description stays as 09b2 left it.
- The notes of the administrator and of the maintainer each end with "Adds files to a repair and
  deletes them in the repair window."
- The note of the account manager ends with "The files can be opened, not added or deleted."
- The note of the viewer: no edit (it does not see the files).

`permissionPageData.test.ts` gets the new sentences (§7); the levels asserted by the earlier
specs stay.

## 6. Behaviour scenarios (Playwright, written and not run, D206)

The fixture of `e2e/helpers/repairsFixtures.ts` already seeds repairs with `MaintenancePhotos` rows
(S32). It gains, through the service role and removed in its teardown: a repair with no files, a
small real PNG used as a file to pick, a file just over 10 MB, a `.zip` file, and the removal of
every object and row a scenario makes (`e2e/helpers/filesFlow.ts` picks files with `setInputFiles`
on the hidden input and reads the table and the bucket with the service role). The scenarios poll,
because a New repair reaches the server after the connector uploads it. They are written for the
files named in §4 and are not run (the user's rule); the report marks E2E as **written, not run**.

- **S43 (admin): Add file in the view mode.** Open a repair that has one photo. Pick two PNGs at once:
  Add file reads "Uploading...", then the list reads "Photo 1", "Photo 2", "Photo 3"; two rows and two
  objects exist; no green toast; the stored rows have the open links.
- **S44 (admin): delete in the view mode.** The bin of "Photo 1" opens the dialog with "This removes
  Photo 1 from the repair. It cannot be undone in the app."; Cancel changes nothing; Continue deletes
  the row and the object and the next photo is now "Photo 1". At the end Show Deleted and the window
  of a deleted repair: no Add file, no bin.
- **S45 (admin): Edit saves a draft.** Edit; pick a PNG and remove a stored file through the dialog
  ("...when you save."). The draft row shows the name on the disk and its size, has no open link and
  a bin without a dialog; the stored file left the list and the names shifted. Save: the window is in
  the view mode, the new object and row exist, the removed row and object are gone.
- **S46 (admin): Cancel and Discard leave Storage alone.** Edit, pick a file, Cancel: the bucket has no
  new object and the list is as before. Edit again, pick a file, press the cross: "Discard changes?"
  appears; Discard: the bucket has no new object.
- **S47 (admin): New repair with a file.** New repair, the two days, a service, a PNG. Add repair: the
  window closes, the repair shows in the list, and (polling) a row of the file exists for the new repair
  with its object.
- **S48 (admin): refused files.** Pick the big file, the `.zip` and a good PNG: a red toast names the
  first two with their reasons, the PNG is in the draft (in Edit) or uploaded (in the view mode).
- **S49 (account manager): reads, cannot write.** The repair window lists the files with the open links
  and has no Add file and no bin, in the view mode.
- **S50 (maintainer): Add file.** Add file in the view mode of a repair that has no files: the list
  reads "Photo 1".

## 7. Tests (Vitest, written first)

All run in the node environment; tests are written first and seen failing (red) before the code.
Nothing here needs a browser; the picking of real files, Storage and the dialogs are in §6.

- **`utils/repairFiles.test.ts`.**
  - `checkPickedFiles`: each of the 13 MIME types is accepted; an empty type and `application/zip` are
    refused as "type"; a size of exactly 10 485 760 bytes is accepted and one byte more is refused as
    "size"; a wrong type that is also too large is "type"; the order is kept; a mixed pick is split into
    accepted and refused.
  - `refusedFilesLines`: one line per file with the right text for each reason.
  - The draft: `addDraftFiles` keeps the order and makes a key for each; `removeDraftFile` takes one out
    by key; `removeStoredFile` marks a row once and a second call changes nothing;
    `isFilesDraftChanged` is false for the empty draft and for a file added and then removed, and true
    for an added file and for a removed stored one.
  - `storedRowsAfterRemovals`: the removed ids are left out, and `buildRepairFileRows` of what remains
    names the next photo "Photo 1" after "Photo 1" is removed (D202).
  - `fileExtension` and `repairFilePath`: lower case; "report.v2.PDF" gives `pdf`; a name with no dot or
    with a tail that is not letters and digits takes the MIME type's extension; the path is
    `<repair id>/<object id>.<extension>`.
  - `formatFileSize`: 12 B, 1023 B, 1 KB at 1024, 340 KB, 2.4 MB, 10 MB.
  - `deleteFileDialogText`: the title, and the text of each mode (D202).
  - `filesFailureLines`: null when nothing failed; the three titles of "save" (not added, not removed,
    both) and the two of "view"; the "Not added:" line with the names on the disk, the "Not removed:"
    line, and the first failure's text.
- **`db/repairFileWrite.test.ts`** (a fake `RepairFilesClient` that records its calls, and a fake
  `sleep` that records the waits).
  - `waitForRepairOnServer`: true at the first answer with no sleep; true after three "no" answers with
    three sleeps of 500 ms; false after 10 000 ms of "no" (21 requests); a request that throws counts as
    "not yet" and the wait goes on.
  - `saveRepairFiles`: the wait comes before the first upload; a repair that never answers makes every
    added file "not added" with the text of "not on the server", with no upload and no insert; the
    deletions still run; a file is uploaded and then its row inserted, in the order picked, and the
    path has the repair's id and the file's extension; an upload that fails leaves the others tried and
    is in `notAdded` with the error text; an insert that fails after its upload removes that object;
    a deletion deletes the row before the object; a row that cannot be deleted is in `notRemoved` and
    its object is not touched; an object that cannot be removed after its row has gone is not in either
    list; with nothing to add the wait is not run; additions run before deletions (D204); it never
    throws.
- **`components/RepairFiles.test.tsx`** (changed): without `controls` the section is spec 07's, with
  no button and no input; with `controls` every stored row has a bin with its label; Add file and the
  input (`multiple`, the `accept` list) are drawn only when `canAdd`; a draft row shows the name on the
  disk and the size, has no link and has its own bin; "No files." shows only with neither a stored
  row nor a draft row; `busy` disables the buttons and Add file reads "Uploading...".
- **`db/repairWrite.test.ts`** (changed): `createRepair` with an `id` inserts that id, and without one
  inserts a generated id (the harness of the file).
- **`permissionPageData.test.ts`** (changed): the new sentences of both rows (§5), the old ones are
  gone, and the levels are as before.

## 8. Edge cases and errors

- **Clerk and auth.** The client carries the Clerk token (`useClerkSupabaseClient`). The list waits
  for the session (spec 07); a write made with a lost session fails like any other error: a toast
  (view mode) or D194 (Save). The role comes from `useTeamPermissions`; while it is not known no
  button is drawn.
- **Offline.** The list says it needs a connection and has no Add file (D201). A Save with files
  holds the window for the 10 s of the wait and then does D194; a pick in the view mode ends in the
  toast (D203). Nothing is queued: files are not written to the local database.
- **A repair still in the upload queue.** A New repair, or any repair created on this device a short
  time ago, may not be on the server. The wait (D193) covers a short delay; a long one (a long
  offline spell, or the migration and the sync rules not on the server) ends in D194 or in the toast.
  The repair itself is not lost.
- **The two requests of a file can half-fail.** An upload that succeeds and an insert that fails
  removes the object (§0). A delete whose row goes and whose object stays leaves an object that nothing
  points to (D196); it takes space and shows nowhere.
- **Names move.** The names of the stored files are by order, so a deletion by another person, or in
  this window's draft, renames the rest. A toast names a stored file by the name it had when it was
  removed.
- **A repair deleted while Edit is open** (by another person): the Save is the same as before for the
  fields, and the files are written to the repair as it is on the server; nothing checks `deleted`.
- **A file with no extension or an odd name** gets its extension from its MIME type (§2.4) and a stored
  name by type ("Photo 1"). A `heic` photo is a Photo and opens in a new tab; the browser may offer a
  download (spec 07).
- **A file that Storage refuses** (a size or a type the bucket's own rule rejects although the client
  accepted it): "not added" with Storage's text.
- **Several windows or tabs** write on their own; the second to read sees both. Two people adding at
  the same moment give two rows.
- **Esc, the cross or a click outside during a view-mode upload:** the window may close; the upload
  goes on and its toast comes when it ends. During a Save the controls are disabled, and the
  existing rules of 09a about closing a window that is saving are not changed here.
- **A double click on Add file** or on Continue: the second does nothing while the first runs.
- **The same file picked twice:** two files, two rows, two objects (D199).
- **A New repair with files and no service:** allowed, as a New repair with no services (09b1 D150);
  the repair has no bleachers, so the files are all it has.
- **E2E needs the sync rules of spec 02** (the services and the reports reach the test user); the files
  come from Supabase and need nothing more.

## 9. Not in this spec

- **The Dashboard form's Files tab and the modal's files** (09b2 D173): they keep their code and
  their checks; spec 11 deals with the form, and nobody is assigned the modal.
- **Syncing `MaintenancePhotos`** to the device, the original name, the size, the author or a type of
  a stored file (the table holds none of them), a rename of a file, and a `deleted` flag with a
  Restore: a delete is final in the app.
- **A viewer or an account manager writing files**, and a viewer reading them (it needs a change of
  the database rule).
- **A drop zone, a preview or a lightbox** for a photo, a download button, a progress bar, and a
  retry of files that did not arrive (D194).
- **A cleanup of objects that nothing points to** (D196), and a check of the connection before a
  write (D203).
- **A limit on the number of files, a duplicate check, and a check of the type by the extension**
  (D197, D199).
- **A migration, a change of the sync rules, a change of the Storage policies or of the bucket.**
- **A success message, an offline hint, an undo.**
- **A browser check** (the Browser pane cannot run PowerSync) and **running the Playwright
  scenarios**.
- **The permissions spec 10** (the gates in general, the role specs and the last check of the matrix)
  and **the Dashboard spec 11**.

## 10. Definition of done

- `npm run tc` and `npx vitest run`, each with the real output and the exit code (Node 24 first in
  `PATH`).
- `npx prettier --check` on the files this spec touches only (the repo-wide `npm run lint` is red at
  baseline); the spec's Markdown is also checked for an inline code span that breaks a line.
- Playwright E2E: **written (S43 to S50) and not run**; the report says so.
- The browser check is skipped; the report lists what nobody has seen: a real pick of several files,
  the real Storage answers (the size, the MIME type, the policies), the wait against a repair that is
  still in the queue, the "Uploading..." state, the dialog opened inside the repair window, the draft
  rows and the Add file button in the window's grid, the toast texts, and a Save with files without a
  connection.
- A mutation check of three rules (the wait before the upload, the row before the object on a delete,
  and the type check by MIME) with the files restored by hash, as in 09a to 09b2.
- The matrix rows of §5 are edited in the same commit.
- The Ukrainian artifact of this spec is updated with the status and the result.
- The final report with real output: TS compilation, Vitest, E2E (written, not run). The deploy
  order is repeated: the migration `20261117120000` and the sync rules (`../br_powersync` 692b21c,
  not pushed) on the server before the first write; this spec adds nothing to the server.

## 11. Result (2026-11-23)

- **Done as specified.** An administrator and a maintainer add files to a repair and delete them in
  the repair window: in the view mode a pick is uploaded and a confirmed deletion is made at once;
  in Edit and in New repair the picked files and the removed stored files are a draft that Save
  writes after the local transaction; the page waits for the repair to be on the server before the
  first upload; the matrix rows. 7 counted files (2 new: `utils/repairFiles.ts`,
  `db/repairFileWrite.ts`; 5 changed: `RepairFiles.tsx`, `RepairWindow.tsx`, `RepairsPage.tsx`,
  `useRepairDetails.ts`, `repairWrite.ts`) plus the matrix, the tests and the e2e files. No migration,
  no sync change, no change to the list query or to `AppSchema.ts`.
- **Tests first.** Red run before any code: 5 files failed (the two new suites could not import their
  modules, and 18 tests failed in `RepairFiles.test.tsx`, `repairWrite.test.ts` and
  `permissionPageData.test.ts`); then green. `tc` exit 0, `vitest` exit 0 (578 files and 8757 tests,
  +2 files and +71 tests over the 576 and 8686 of 09b2), Prettier clean on the 18 source, test and e2e
  files and on this spec. Mutation check of three rules caught: the wait before the first upload
  removed (2 failing tests), the row and the object swapped on a deletion (2), and the type check by
  MIME removed (3); the two files were restored and their hashes compared.
- **E2E** S43 to S50 are written (a fork wrote them) and **not run** (D206): `e2e/repairsFiles.admin.spec.ts`
  and `e2e/helpers/filesFlow.ts` (new), S49 in `repairsAccess.am.spec.ts`, S50 in
  `repairsAccess.maintainer.spec.ts`, and additions to `helpers/repairsFixtures.ts` (two fresh
  bleachers, one repair for each scenario with real objects in the bucket, a deleted repair, a PNG, a
  file of 10 MB and one byte, a `.zip`, and a teardown that removes the objects before the rows). The
  scenarios take a few choices of their own: the toast lines are literals from §2.3, the cross is
  found by the role "Close", and the new bleachers use `base + 110` and `base + 111` (a smallint
  holds no more).
- **Extras against the spec text** (none changes a locked signature of §3):
  - `fileExtension` gives `bin` when the name has no usable extension and the type is not in the list
    (a file that failed the check never gets there).
  - `formatFileSize` rounds a KB and writes 1023.5 KB and more as MB; a whole MB drops the ".0".
  - `components/RepairFiles.tsx` also exports `DeleteFileDialog` (the dialog of §2.6; the view mode keeps
    it open with "Deleting..." until the work is done and closes it after, also when the deletion
    failed) and keeps the helpers `publicUrlOf` and `checkAndReport` private.
  - `RepairFilesContent` draws the stored rows only in the "ready" state, as in spec 07, and the draft
    rows in every state (§2.2).
  - `useRepairFiles` returns `raw` as a memoised array, so a window can use it as a dependency.
  - `makeRepairFilesClient` has three tests of its own (a chainable stand-in for supabase-js).
  - In Edit the section is always `RepairFilesEdit`: only a writer is in Edit, and a writer reads the
    files.
- **What nobody has seen** (the user's rule: the Browser pane cannot run PowerSync, and there is no
  real Storage in the tests): a real pick of several files, the real answers of Storage (the size, the
  MIME type, the policies), the wait against a repair that is still in the upload queue, the
  "Uploading..." state, the dialog opened inside the repair window (an `AlertDialog` over the Radix
  `Dialog`, whose layering and focus are unverified), the draft rows and the Add file button in the
  window's grid, the toast texts, and a Save with files without a connection (the 10 s hold).
- **Not done.** Nothing is committed (`seed.sql`, `supabase/.temp/cli-latest` and
  `scripts/seed_add_on_conflict.py` stay out of every commit). The headers of specs 04 to 09b1 still say
  "uncommitted", and the plan still leads spec 09 as one spec (a docs commit, only if the user says).
  Deploy order: the migration `20261117120000` and the sync rules (`../br_powersync` 692b21c, not
  pushed) must be on the server before the first write; this spec adds nothing to the server.
