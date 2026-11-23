# Repairs 11: The Dashboard uses the repair window (the old form and its store are deleted)

Status: **APPROVED and IMPLEMENTED 2026-11-23**, uncommitted (0 open decisions; D214 to D235 were
taken by the user in seven question batches on 2026-11-23; the results are in §11; the Playwright
scenarios are written and not run (D228) and the browser check is the user's (D232)). Build order: **11 of 11**; there is no spec 10, its work is
merged here (D207). Needs: [repairs-01-design.md](repairs-01-design.md),
[repairs-02-sync-rules.md](repairs-02-sync-rules.md),
[repairs-03-list-query.md](repairs-03-list-query.md), [repairs-04-table.md](repairs-04-table.md),
[repairs-05-toolbar.md](repairs-05-toolbar.md),
[repairs-06-expanded-row.md](repairs-06-expanded-row.md),
[repairs-07-repair-window.md](repairs-07-repair-window.md),
[repairs-08-status.md](repairs-08-status.md),
[repairs-09a-repair-writes.md](repairs-09a-repair-writes.md),
[repairs-09b1-services.md](repairs-09b1-services.md),
[repairs-09b2-bleachers-zone-reports.md](repairs-09b2-bleachers-zone-reports.md) and
[repairs-09b3-files.md](repairs-09b3-files.md) (all done and committed: 09a is 2d0f5931, 09b1
60c73fbc, 09b2 f3a49a90, 09b3 af25e389; the plan's correction of 2026-11-23 is 8cf8536a, one commit
ahead of its upstream). Needed by: nothing, this is the last spec. Plan: [repairs-plan.md](repairs-plan.md).
Branch: `q4-sprint4-maintenance`.

Scope: **the maintenance flow of the Dashboard moves to the repair window, and the old form is
deleted.** A click on the bar of a repair opens the repair window; "+ Create → Maintenance Event"
opens the New repair window empty; the maintenance icon of a cell opens it with the bleacher and the
days of the cell; the button "Create Maintenance to Resolve" of a damage report opens it with the
bleacher of the report. The form (`MaintenanceEventForm`, its panel, its two tabs), its store, its
three writers, the modal of the Damage Reports page and the selection mode that the form gave the
grid are deleted. The windows move out of `RepairsPage` into a host that the Repairs page, the
Dashboard and the Damage Reports page each mount once, with the stack of windows in a store. The
spec carries out plan D20 and ends D173; it replaces D208 (D215, D219), because an account manager
now only reads a repair on the Dashboard too. It changes clauses of spec 06 and 07 (where the
windows are drawn), of 09a (`NewRepairWindowProps`), of 09b1 (`NewServiceWindowProps`) and of 09b3
(§9: the form's Files tab is deleted); §3 lists every one, and the "Approved" of this spec approves
them, together with the sentences of the permissions matrix (§5). No migration, no sync change, no
`AppSchema.ts` change, no change to the list query or to the locked types of specs 03 and 05. It is
**one logic, so it is not cut: 21 counted files and 11 deleted**, above the cap of 10 (§4).

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

**Decisions of spec 09b3 (done, user, 2026-11-23; six question batches).**

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

**Decisions of this spec (user, 2026-11-23; seven question batches).**

- **D214 (a click on a bar):** a click on the bar of a repair on the Dashboard opens the repair
  window of spec 07 over the Dashboard: the view mode for everyone who opens the Dashboard, and
  Edit, Delete, the status menu, the services and the files only for an administrator and a
  maintainer (09a D124, 09b1 D165, 09b3 D201). It opens no form and it does not go to the Repairs
  page.
- **D215 (the account manager reads):** an account manager only reads a repair, on the Dashboard
  as on the Repairs page. They lose what the old form gave them: adding, editing and deleting a
  repair from the Dashboard. The database still lets them write (D224).
- **D216 (the icon of a cell):** the maintenance icon of a cell opens the New repair window with
  the bleacher of the cell and the days filled: `Repair from` is the clicked day and `Repair to`
  is seven days later, cut by the accepted sub-rentals of the bleacher the way the old icon cut
  it (§2.4).
- **D217 (the modal of the Damage Reports page):** "Create Maintenance to Resolve" is rewritten as
  the window: its button opens the New repair window with the bleacher of the report. The modal
  and its own create code are deleted.
- **D218 (who has the icon):** the maintenance icon of a cell is drawn for an administrator and a
  maintainer. An account manager loses it; a viewer never had it.
- **D219 (the matrix row of the account manager):** its level in "Repairs & Maintenance" becomes
  `read`, and its text says that an account manager reads repairs on both pages. This replaces
  D208 (text only, level `custom`), whose premise ("no right changes") is gone with D215.
- **D220 (the owner):** the Owner field of the old form is dropped and nothing replaces it:
  nobody can change the owner of a repair any more. The sentence of the matrix about reassigning
  maintenance events is removed.
- **D221 (the days):** the days of the window are free on the Dashboard as on the Repairs page:
  no bounds from sub-rentals (the old form had them). Only the prefill of the icon of a cell is
  cut (D216).
- **D222 (a report asks for a service):** the New repair window that was opened from a damage
  report does not save without at least one service.
- **D223 (what a report fills):** only the bleacher of the report. The days, the vendor and the
  rest stay empty.
- **D224 (the database):** it is not changed. It still lets an account manager write repairs,
  services, the junction, files and reports, though no screen offers it. No migration.
- **D225 (the grid):** while a window is open the grid does nothing. The selection mode of the old
  form (pinning its bleachers, adding a bleacher by a click on its row, highlighting the chosen
  repair) is deleted with the form.
- **D226 (the damage strips):** the rule of `computeDamageOverlayRanges` does not change.
- **D227 (the scroll buttons):** the buttons "scroll the Dashboard to this date" of the old form
  are not carried over.
- **D228 (e2e):** Playwright scenarios are written and not run (S51 and on, §6). The Dashboard
  grid is a PixiJS canvas with no click hook, so the scenarios drive what is DOM: the "+ Create"
  menu, the Damage Reports page and the windows.
- **D229 (how the bleacher enters the window):** for the icon of a cell and for a report, the
  service form of New repair opens at once over the window with that bleacher chosen. Closing it
  leaves the window with no service.
- **D230 (the report after Add repair):** the report is linked and stays open until the repair is
  Completed (09b2 D178 to D185).
- **D231 (the icon on every cell):** a maintainer sees the icon on every cell, whoever wrote the
  note in it.
- **D232 (the browser):** the user makes the browser check. The report lists what nobody has seen.
- **D233 (any service):** the window of D222 accepts any service, also one of another bleacher;
  then the report is not linked (09b2 D178).
- **D234 (the card of the report):** after Add repair from a report the card of the report closes
  with the window, and the list updates, as the old modal did.
- **D235 (the button on a linked report):** "Create Maintenance to Resolve" is not drawn for a
  report that is already linked to a repair.

**Carried over, not asked again.** D20 (the form is replaced by the New repair window and
deleted: this spec does it) and D173 (the form and the modal waited for this spec); D18 (no
Owner, no Address, the name fixed); D95 and D96 (the windows are React memory only, not in the
address, and they stack); D110, D124, D165 and D201 (an administrator and a maintainer write);
D102 (a viewer sees no Files section); D207 (spec 10 is merged here); D209 (the Storage policies
stay); D210 (a maintainer gets "+ Create" with the one item "Maintenance Event"); D211 (no tests
that the closed roles cannot open `/repairs`); the style of 09a to 09b3 (no green toast of
success, a red toast with the error text for a failed write, "Discard changes?" on the cross, Esc
and a click outside when something changed, Cancel drops at once).

**What follows from the design and from earlier decisions (no new decision).** Each item names its
source, so a reviewer can check it. The last item is wording only; it is listed so it can be
corrected, and no behaviour hangs on it.

- **Words.** The _store_ is `useRepairWindowsStore`, which holds the stack of windows. The _host_
  is `RepairWindowsHost`, which draws the stack. A _preset_ is what a New repair window starts
  with (D216, D223, D229).
- **The "+ Create" menu by role** (D210, D215): "Maintenance Event" for an administrator and a
  maintainer, "Sub-Rental Request" for an administrator and an account manager (as today). An
  administrator sees both, an account manager one, a maintainer one, a viewer none, so the button
  is not drawn for a viewer. A person with several roles gets the items of all of them.
- **The icons of a cell.** "Work Tracker" and "Create Sub-Rental" stay as they are (admin and
  account manager). "Maintenance" follows D218 and D231: the role decides, not the right to edit
  the note of the cell.
- **The checks of the old icon for an account manager go** (own zone, subrented out on that day,
  the constraint that cut the date pickers) with D215. An administrator and a maintainer never
  had them and get none.
- **Writes are local now.** The old form wrote straight to Supabase and needed a connection; the
  window writes to the local database like the rest of the page, so a repair can be added offline.
  The old green toasts "Maintenance event created / updated / deleted" go (09a style).
- **Only live repairs on the Dashboard.** A repair deleted from its window leaves the stack at
  once, as on the Repairs page without Show Deleted (spec 06 §2.5).
- **A repair with no bleacher has no bar** on the Dashboard (09a, 09b2): a bar appears with the
  first service.
- **The strips of damage** keep their rule (D226). Only the comment of `damageOverlayRanges.ts`
  and the names of its tests that say `createMaintenanceEvent` closes every open report are
  corrected, because after 09b2 a report is linked at the first service and closed at Completed.
- **The card of a report is also opened from the cell editor of the Dashboard** ("View Damage
  Report", for every role), so the button of D235 is drawn for an administrator and a maintainer
  there as well, and for nobody else.
- **"Mark as Resolved"** (a report a driver vouched for) is not touched.
- **One host per page.** The Repairs page, the Dashboard and the Damage Reports page each mount
  the host once. A card of a report opened from the cell editor of the Dashboard uses the host
  of the Dashboard.
- **The prefilled window is not dirty:** "Discard changes?" counts changes against the preset, so
  an unchanged window closes with no question.
- **Wording chosen by me** (presentation only): the hint line of the card ("To resolve this
  report, create a repair for it. The report closes when the repair is Completed."), the line
  above the services of a refused save ("Add at least one service."), and the test ids.

**Changed relative to earlier specs.** The "Approved" of this spec approves each of these.

- **Plan §4 D208** (text only, level `custom`) is replaced by D215 and D219: the account manager's
  row is `read`. D210 stays, with its mechanism in §2.3.
- **09b2 D173** (the form and the modal stay) ends: both are deleted.
- **09b3 §9** (the Dashboard form's Files tab and the modal's files stay) ends: both are deleted.
- **Spec 06 and 07** (`RepairsPage` draws the windows and keeps the stack in its state): the stack
  lives in a store and a host draws the windows. The windows stay React memory, not in the
  address (D95).
- **09a** (`NewRepairWindowProps`): gains `preset`. The window checks D222 before `onCreate` and
  calls `preset.onCreated` after it.
- **09b1** (`NewServiceWindowProps`, `DraftServiceWindowState`): gain a bleacher to start with.
- **`WindowEntry`** (spec 07 §3): the kind `new` gains `preset`.
- **Plan D210:** `CreateEventButton` gets its menu by role (§2.3).
- **The matrix** (§5): three rows change and one more row is touched.

## 1. What the code has today (researched 2026-11-23)

- **The form.** `MaintenanceEventForm` (408 lines) has the tabs Core and Files and sits in
  `MaintenanceEventPanel` on the Dashboard page. Core has Event Name, Address, Start Date and End
  Date (each with a "scroll the Dashboard to this date" button and bounds from the accepted
  sub-rentals), Repair Cost and Owner. The form lists a "View Damage Report" link for each bleacher
  and saves with Create, Update and Delete. All of it lives in `useMaintenanceEventStore`.
- **The writers.** `createMaintenanceEvent` and `updateMaintenanceEvent` write straight to
  Supabase (online only): the address, the event with `cost_cents`, and the junction. Create
  also stamps `resolved_at` and the link on every open report of the bleachers, or on one report
  when the modal gives its id. Update deletes the junction rows of the event and inserts them
  again from its own list. `deleteMaintenanceEvent` is a local soft delete and has one caller,
  the form.
- **Three ways in.** "+ Create → Maintenance Event" (`CreateEventButton`, drawn for an
  administrator and an account manager); the wrench of a cell (`CellEditor`, drawn when the person
  is not a viewer, and a maintainer counts as one there); a click on the bar of a repair
  (`EventBody` calls `loadMaintenanceEventById`, which fills the store).
- **The wrench of a cell.** It opens the form with the bleacher, the clicked day and the day seven
  days later. The end is cut for everyone: to the end of the accepted sub-rental block that holds
  the start, and to the day before the next accepted block. For an account manager only, it first
  refuses a bleacher outside their zones unless the day is inside an accepted sub-rental of their
  zone, and refuses a day the bleacher is subrented out, and it keeps the date pickers inside that
  sub-rental window (`subrentalConstraint`).
- **Rights today.** The form is editable for an administrator, an account manager and a maintainer
  (`canEdit`; for an account manager `canEditOwnedEntity` is given neither the role nor the owner,
  so it answers true), and read-only (a disabled fieldset) for a viewer.
- **The grid listens to the store.** `Dashboard.ts` pins the bleachers of the open form and keeps
  them when a zone filter hides them. `StickyLeftColumnCellRenderer` makes a click on a bleacher
  row add or remove it in the form (with the account manager's checks).
  `MainGridCellRenderer` and `PinnedYCellRenderer` pass `selectedMaintenance` on, so the chosen
  repair is highlighted (`Events.ts` takes it). `loadEventForModal` and `loadSubrentalEventById`
  reset the store when they open an event or a sub-rental.
- **The modal.** `DamageReportResolveMaintenanceModal` (299 lines), opened by "Create Maintenance
  to Resolve" in `DamageReportModal` for an unresolved report, asks for a name, two days, a cost,
  notes and files, then calls `createMaintenanceEvent` for the one bleacher with the id of that
  report, so only that report is closed, at once. `DamageReportModal` is drawn by the Damage
  Reports page (create and edit) and by the cell editor of the Dashboard ("View Damage Report"),
  and it has no role check of its own.
- **The damage strips.** `computeDamageOverlayRanges` draws from the day of a report to the day
  before its linked repair starts. Its comment says that creating a repair stamps `resolved_at` on
  every open report of the bleacher; after 09b2 that happens at the first service and at
  Completed.
- **Where the windows are today.** `RepairsPage` keeps the stack of windows in its state
  (`resolveWindows`, `openWindow`, `closeFrom`), builds the `editing` props and the service props
  for an administrator and a maintainer, writes the files after a Save and draws the windows.
  `NewRepairWindow` starts from `emptyRepairForm()` and has no way to start with a bleacher or
  days. `DraftServiceWindows` opens `NewServiceWindow` with an empty form.
- **The list.** `useRepairList` reads five local queries and returns every repair of the view
  (live or deleted); `useRepairFilterOptions` gives the lists of the selects.
- **Tests and e2e that name the old flow.** `CreateEventButton.test.tsx`, `CellEditor.test.tsx`,
  `loadEventForModal.test.ts`, `dashboardEventReadOnly.admin.spec.ts` (the menu of S10 has two
  items for an administrator, which stays true), `damage-reports.admin.spec.ts` (it looks for the
  button "Create Maintenance to Resolve") and, by name only, `fixedMark.test.ts`.
- **The Dashboard e2e limit.** The grid is a PixiJS canvas with no click hook: a test cannot
  click a bar or a cell. The existing Dashboard specs drive the DOM only.

## 2. The behaviour

### 2.1 Who gets what, and where (D214, D215, D218, D231, D235)

- **A click on a bar.** The repair window opens for an administrator, an account manager, a viewer
  and a maintainer. Its controls (Edit, Delete, the status menu, Add service, Add file) are an
  administrator's and a maintainer's; an account manager and a viewer read. A viewer sees no
  Files section (D102), an account manager sees the files and the open buttons.
- **"+ Create".** "Maintenance Event" for an administrator and a maintainer; "Sub-Rental Request"
  for an administrator and an account manager. Nothing for a viewer.
- **The icons of a cell.** "Maintenance" for an administrator and a maintainer, on every cell.
  "Work Tracker" and "Create Sub-Rental" for an administrator and an account manager, as today.
- **The card of a damage report.** "Create Maintenance to Resolve" for an administrator and a
  maintainer, for a report that is not resolved and is not linked to a repair.
- **Roles together.** A person with several roles gets what any of them gets.

### 2.2 A click on a bar (D214, D225)

The maintenance branch of `EventBody` opens `{ kind: "repair", repairId }` in the store. The
sub-rental and event branches stay. The repair window is the one of spec 07 with everything
09a to 09b3 added; it opens over the Dashboard and closes with the cross or Esc. The grid draws
nothing for it. A repair that is deleted from the window, or by someone else, leaves the stack
at once. While the rows are loading the host draws nothing for it; the window appears when its
repair is in the rows.

### 2.3 "+ Create" (D210, D215)

`createMenuFor(roles)` answers which items are drawn: `maintenance` for an administrator or a
maintainer, `subrental` for an administrator or an account manager. The button is drawn when one is
true. "Maintenance Event" closes the menu and opens `{ kind: "new" }`: an empty New repair window,
the same as the New repair button of the Repairs page. The branch of `CreateEventButton` that
draws the controls of an open maintenance form (the red MAINTENANCE bar with minimize and close) is
deleted. The text of the item stays "Maintenance Event".

### 2.4 The icon of a cell (D216, D218, D229, D231)

`handleCreateMaintenance` keeps its first check: with no day or no bleacher it shows the red toast
it shows today. Otherwise it computes the days with `cellRepairDates(date, blocks)`, where `blocks`
are the accepted sub-rental blocks of the original row of that bleacher (the row that is not a
sub-rental row), opens

```
{ kind: "new", preset: { eventStart, eventEnd, bleacherUuid } }
```

and closes the cell editor. `cellRepairDates` works in calendar days, with no time zone:

1. `eventStart` is the clicked day; `eventEnd` is seven days later.
2. If a block holds `eventStart` (its start is not after it and its end is not before it),
   `eventEnd` is no later than the end of that block.
3. If a block starts after `eventStart`, `eventEnd` is no later than the day before the first such
   block starts.
4. `eventEnd` is never before `eventStart`.

The checks for an account manager (own zone, subrented out, `subrentalConstraint`) are deleted.

### 2.5 The card of a damage report (D217, D222, D223, D230, D233 to D235)

- **The button.** "Create Maintenance to Resolve" keeps its text and its place, and is drawn by
  `canCreateRepairForReport(report, canManage)`: a manager, a report with no `resolved_at` and no
  `maintenance_event_uuid`. The hint line above it becomes "To resolve this report, create a repair
  for it. The report closes when the repair is Completed."
- **A click** opens
  `{ kind: "new", preset: { bleacherUuid: report.bleacher_uuid, requireService: true, onCreated } }`
  in the store. `onCreated` does what `onResolved` did: it closes the card of the report, resets
  its form and calls `onSaved`, which refreshes the list.
- **Add repair** is refused with the red line "Add at least one service." above the table of
  services when the window has no service (D222). Any service is enough, also one of another
  bleacher (D233).
- **What the report becomes.** The write is the one of 09a and 09b: the repair, its services, then
  the junction, the zone and the links. By 09b2 the open reports of the bleacher of the first
  service are linked to the repair and stay open until it is Completed (D230); the report of the
  card is among them when the service is on its bleacher and it is not linked elsewhere (it is
  not, by D235). A service on another bleacher leaves the report as it was (D233).
- **Deleted.** `DamageReportResolveMaintenanceModal` with its name, its two days, its cost, its
  notes and its files.

### 2.6 The New repair window with a preset (D216, D221, D223, D229)

- **Start.** `presetRepairForm(preset)` gives `emptyRepairForm()` with `eventStart` and `eventEnd`
  of the preset. "Discard changes?" counts changes against that form (§0), so an unchanged window
  closes with no question. The days stay free: the window sets no minimum or maximum (D221).
- **The service form.** When the preset has `bleacherUuid`, the window starts with the New service
  window open over it and that bleacher chosen in its select (D229). It is the draft service form
  of 09b1: Bleacher and Severity are required, the zone check of 09b2 D176 runs when Add is
  pressed, and Cancel closes it and leaves the window with no service.
- **A save.** `requiredServiceError(preset, services)` runs before `onCreate`; a message goes back
  as `RepairFormErrors.services` and shows in the line above the table of services (09b2 D186). When
  `onCreate` succeeds the window calls `preset.onCreated` and then closes.
- **No preset.** The window is the one of 09a, with the empty form and no service form.

### 2.7 The store and the host

- **The store.** `useRepairWindowsStore` holds `stack: WindowEntry[]` with `open(entry)`,
  `close(index)` and `reset()`, which call `openWindow` and `closeFrom` of spec 07. It is plain
  memory, not the address. The grid's `EventBody`, the cell editor, `CreateEventButton` and the
  card of a report all call `useRepairWindowsStore.getState().open(...)`.
- **The host.** `RepairWindowsHost` draws nothing while the stack is empty. With a window in the
  stack it reads the rows (`useRepairList` for the live repairs, and `useRepairFilterOptions`) and
  draws the windows with the same props `RepairsPage` gives them today: `editing` and the status
  menu for a manager, the service windows, the New service window, the damage report window and
  the New repair window. The Repairs page passes its own `rows` (it may show deleted repairs), so
  it does not read the list twice. When the host unmounts it calls `reset()`, so a window does not
  come back on another page.
- **`RepairsPage`.** It keeps its table, its URL state and which rows are open. The stack and the
  drawing of windows move out of it; its table callbacks call `open` of the store.
- **`startStatusChange(repair, to)`** is exported by the host's file and is what the status menu
  of the table and of the window both call (it is `changeStatus` of the page today).

### 2.8 The grid without the form (D225)

- **`Dashboard.ts`:** the subscription to the maintenance store, the maintenance part of the
  always-visible bleachers, and of "a form is open" are removed. The event form and the sub-rental
  form keep theirs.
- **`StickyLeftColumnCellRenderer.ts`:** `isMaintenanceFormExpanded`, its subscription, the
  maintenance branch of the row click (and the account manager's checks in it) and the use of
  `resolveSubrentalConstraint` are removed.
- **`MainGridCellRenderer.ts`, `PinnedYCellRenderer.ts`, `Events.ts`:** `selectedMaintenance` is
  removed from the options and from the highlighting.
- **`EventBody.ts`:** the maintenance branch opens the window (§2.2); `resolveSubrentalConstraint`
  is removed.
- **`loadEventForModal.ts`, `loadSubrentalEventById.ts`:** the reset of the maintenance store is
  removed.
- **`CellEditor.tsx`, `CreateEventButton.tsx`:** §2.3 and §2.4.

### 2.9 What a person sees

- **Administrator:** a click on a bar shows the repair window, not a form; "+ Create" has both
  items; the wrench opens New repair with the bleacher and the days; no Owner, no Address, no typed
  cost, no scroll buttons; every write is local.
- **Maintainer:** "+ Create" with "Maintenance Event"; the wrench on every cell; a bar opens the
  window with Edit.
- **Account manager:** "+ Create" with "Sub-Rental Request" only; no wrench; a bar opens the window
  to read; the card of a report has no button.
- **Viewer:** no "+ Create"; no wrench (as before); a bar opens the window to read, with no Files
  section.

### 2.10 Examples

- **A wrench with a sub-rental near.** An administrator clicks the wrench on the cell of
  2026-12-02 of bleacher 52, which has an accepted sub-rental starting 2026-12-06. The New repair
  window opens with Repair from 2026-12-02 and Repair to 2026-12-05, and over it the service form
  with bleacher 52 chosen. Cancel on the service form leaves the window with no service; closing the
  window asks nothing, because only the preset is in it.
- **A repair from a report.** An administrator opens the card of an unresolved, unlinked report of
  bleacher 40 on the Damage Reports page and presses "Create Maintenance to Resolve". The window
  opens with the service form for bleacher 40. They press Cancel on the form, fill the two days and
  press Add repair: the red line "Add at least one service." shows. They add a service for
  bleacher 40 and press Add repair: the window and the card close, the list refreshes, the report
  is linked to the new repair and still open, and it closes when that repair is Completed.
- **A maintainer's menu.** A maintainer opens "+ Create": one item, "Maintenance Event". It opens
  an empty New repair window over the Dashboard.

## 3. Types and signatures (locked; changing them needs a new "Approved")

**`utils/newRepairPreset.ts` (new).**

```ts
import type { RepairFormValues } from "./repairForm";
import type { ServicesDraft } from "./serviceForm";

/** What a New repair window starts with (D216, D222, D223, D229, D234). */
export type NewRepairPreset = {
  /** `YYYY-MM-DD`; absent means empty. */
  eventStart?: string;
  eventEnd?: string;
  /** The bleacher chosen in the service form that opens at once. */
  bleacherUuid?: string;
  /** Add repair is refused with no service. */
  requireService?: boolean;
  /** Called once after the repair is added, before the window closes. */
  onCreated?: () => void;
};

/** An accepted sub-rental block of a bleacher; the first ten characters are its day. */
export type SubrentalBlockDays = { eventStart: string; eventEnd: string };

/** The days of the icon of a cell (§2.4). */
export function cellRepairDates(
  date: string,
  blocks: readonly SubrentalBlockDays[],
): { eventStart: string; eventEnd: string };

/** `emptyRepairForm()` with the days of the preset. */
export function presetRepairForm(preset: NewRepairPreset | undefined): RepairFormValues;

export const REQUIRE_SERVICE_MESSAGE = "Add at least one service.";

/** The message of D222, or null: no preset, no `requireService`, or at least one service. */
export function requiredServiceError(
  preset: NewRepairPreset | undefined,
  services: ServicesDraft,
): string | null;
```

**`state/useRepairWindowsStore.ts` (new).**

```ts
export type RepairWindowsStore = {
  stack: WindowEntry[];
  open: (entry: WindowEntry) => void; // openWindow(stack, entry)
  close: (index: number) => void; // closeFrom(stack, index)
  reset: () => void;
};
export const useRepairWindowsStore: UseBoundStore<StoreApi<RepairWindowsStore>>;
```

**`components/RepairWindowsHost.tsx` (new).**

```ts
export type RepairWindowsHostProps = {
  /** The rows the page already holds; without them the host reads the live repairs itself. */
  rows?: readonly RepairListRow[];
};
export function RepairWindowsHost(props: RepairWindowsHostProps): JSX.Element | null;
/** One clock reading is the moment of the change (spec 08 D112, D116); the writer shows its own toast. */
export function startStatusChange(repair: RepairListRow, to: RepairStatus): void;
```

**`utils/repairDetails.ts` (changed).**

```ts
export type WindowEntry =
  | { kind: "repair"; repairId: string }
  | { kind: "service"; repairId: string; serviceId: string }
  | { kind: "reports"; reported: ReportedReport[] }
  | { kind: "new"; preset?: NewRepairPreset }
  | { kind: "newService"; repairId: string };

export type ResolvedWindow =
  // ...the others as they are...
  { kind: "new"; index: number; preset?: NewRepairPreset };
```

`sameWindow` still treats two `new` entries as the same window.

**`components/RepairWindow.tsx` (changed).**

```ts
export type NewRepairWindowProps = {
  // ...as in 09a to 09b3...
  preset?: NewRepairPreset;
};

export type DraftServiceWindowState =
  | null
  | { kind: "new"; bleacherUuid?: string }
  | { kind: "view"; id: string };

/** What the window starts with (§2.6): the form and the service window. */
export function newRepairStart(preset: NewRepairPreset | undefined): {
  initial: RepairFormValues;
  serviceWindow: DraftServiceWindowState;
};
```

`NewRepairWindow` starts from `newRepairStart(preset)`, runs `requiredServiceError` before `onCreate`,
and calls `preset?.onCreated?.()` after a successful `onCreate`.

**`components/ServiceWindow.tsx` (changed).**

```ts
export type NewServiceWindowProps = {
  // ...as in 09b1...
  /** The bleacher chosen when the form opens (§2.6). */
  initialBleacherUuid?: string;
};
```

**`eventConfiguration/components/CreateEventButton.tsx` (changed).**

```ts
export type CreateMenuShow = { maintenance: boolean; subrental: boolean };
export function createMenuFor(roles: {
  isAdmin: boolean;
  isAccountManager: boolean;
  isMaintainer: boolean;
}): CreateMenuShow;
export const CreateMenuItems: (props: {
  show: CreateMenuShow;
  onMaintenance: () => void;
  onSubrental: () => void;
}) => JSX.Element;
```

**`app/damage-reports/_lib/fixedMark.ts` (changed).**

```ts
/** D235: a manager, a report not resolved and not linked to a repair. */
export function canCreateRepairForReport(
  report: { resolved_at: string | null; maintenance_event_uuid: string | null },
  canManage: boolean,
): boolean;
```

**Deleted exports and files:** §4.

## 4. Files

**New (counted, 3):**

- `src/features/repairs/utils/newRepairPreset.ts`
- `src/features/repairs/state/useRepairWindowsStore.ts`
- `src/features/repairs/components/RepairWindowsHost.tsx`

**Changed (counted, 18):**

- Repairs (4): `components/RepairsPage.tsx` (the stack and the windows move out),
  `components/RepairWindow.tsx` (`preset`, `newRepairStart`), `components/ServiceWindow.tsx`
  (`initialBleacherUuid`), `utils/repairDetails.ts` (`WindowEntry`).
- Dashboard and its form's neighbours (10): `eventConfiguration/components/CreateEventButton.tsx`,
  `dashboard/components/CellEditor.tsx`, `dashboard/ui/event/EventBody.ts`,
  `dashboard/Dashboard.ts`, `dashboard/cellRenderers/MainGridCellRenderer.ts`,
  `dashboard/cellRenderers/PinnedYCellRenderer.ts`,
  `dashboard/cellRenderers/StickyLeftColumnCellRenderer.ts`, `dashboard/util/Events.ts`,
  `dashboard/db/client/loadSubrentalEventById.ts`,
  `eventConfiguration/functions/loadEventForModal.ts`.
- App (4): `app/dashboard/page.tsx` (the panel goes, the host is mounted),
  `app/damage-reports/page.tsx` (the host is mounted),
  `app/damage-reports/DamageReportModal.tsx` (the button, its gate, the hint, the host call),
  `app/damage-reports/_lib/fixedMark.ts` (`canCreateRepairForReport`).

**Deleted (11):**

- `src/features/maintenanceEvents/components/MaintenanceEventPanel.tsx`,
  `components/MaintenanceEventForm.tsx`, `components/tabs/CoreTab.tsx`,
  `components/tabs/FilesTab.tsx`
- `src/features/maintenanceEvents/db/createMaintenanceEvent.ts`,
  `db/updateMaintenanceEvent.ts`, `db/deleteMaintenanceEvent.ts`
- `src/features/maintenanceEvents/state/useMaintenanceEventStore.ts` (the directory is empty and
  goes)
- `src/features/dashboard/db/client/loadMaintenanceEventById.ts`
- `src/app/damage-reports/DamageReportResolveMaintenanceModal.tsx`
- `src/features/dashboard/util/subrentalDateBounds.ts` (its only caller was `CoreTab.tsx`)

Any test of a deleted file is deleted with it. `resolveSubrentalConstraint` (in `EventBody.ts`) is
removed with its two callers.

**Changed, not counted:** `src/features/userAccess/permissionPageData.ts` (§5) and its test, and
the comment of `src/features/dashboard/util/damageOverlayRanges.ts` (a comment only, D226).

**Tests (not counted):** `utils/newRepairPreset.test.ts` and `state/useRepairWindowsStore.test.ts`
(new); `utils/repairDetails.test.ts`, `components/RepairWindow.test.tsx`,
`components/ServiceWindow.test.tsx`, `CreateEventButton.test.tsx`, `CellEditor.test.tsx`,
`loadEventForModal.test.ts`, `_lib/fixedMark.test.ts`, `damageOverlayRanges.test.ts` (names only)
and `permissionPageData.test.ts` (changed). **E2E (written, not run, D228):**
`src/features/repairs/e2e/dashboardRepairs.admin.spec.ts` (new), a scenario each in
`repairsAccess.am.spec.ts`, `repairsAccess.viewer.spec.ts` and `repairsAccess.maintainer.spec.ts`,
and additions to `e2e/helpers/repairsFixtures.ts` (an open, unlinked damage report on a fresh
bleacher and a linked one).

**21 counted files** (3 new, 18 changed), above the cap of 10, and 11 deleted. They are one logic:
the maintenance flow of the Dashboard moves to the repair window, and what it replaced goes. Cutting
it would leave the form half deleted or the window half used, so it is not cut (the user's rule of
2026-11-11, "one logic is not split"); the real count is stated here for the "Approved".

No migration, no `database.types.ts`, no `AppSchema.ts` change, no sync rule, no new package.

## 5. The permissions matrix (`permissionPageData.ts`, same commit)

**Checked, this spec changes what a role can do.** An account manager loses the writing of repairs
on the Dashboard (D215), a maintainer gains "+ Create" and the wrench (D210, D218), nobody can
reassign an owner (D220), and a manager gains the button of a damage report with a changed meaning
(D217).

**Edits in the row "Repairs & Maintenance":**

- The description. The last sentence "The Dashboard form still edits a repair's bleachers and its
  files on its own." becomes "On the Dashboard the same window opens from the bar of a repair, from
  \"+ Create\" and from the maintenance icon of a cell: an administrator and a maintainer add and
  change repairs there, and everyone else who opens the Dashboard only reads them."
- The level and the note of the account manager. `custom(...)` becomes `read(...)` with the note
  "Can view every repair and its services, on the Repairs page and on the Dashboard, whoever
  created it, but cannot add, edit, delete or restore one, change its status, its services or its
  files."
- The note of the administrator: the sentence "Can reassign maintenance events between account
  managers." is removed (D220).
- The note of the maintainer: "...and add and delete their files; the Dashboard form can still
  change them too." becomes "...and add and delete their files. Also adds a repair from the
  Dashboard, with \"+ Create\" and with the maintenance icon of a cell."
- The viewer, the developer, the driver and the accountant: no edit.

**Edits in the row "Repair Costs & Vendors":**

- The description: after "A button at the end of each row opens the repair in a window of its
  own, ..." a sentence is added: "The same window opens from the bar of a repair on the Dashboard."
- The notes: no edit.

**Edits in the row "Dashboard Cells":**

- The account manager's note: "...and work trackers, maintenance events and sub-rentals from a
  cell, ..." becomes "...and work trackers and sub-rentals from a cell, ...".
- The maintainer's note: "They cannot create events, work trackers, maintenance or sub-rentals
  from a cell." becomes "They can create a repair from a cell with the maintenance icon, but not
  events, work trackers or sub-rentals."

**Edits in the row "Damage Reports":**

- The note of the administrator ends with "Can create a repair from an open report; the report
  closes when the repair is Completed."
- The note of the maintainer ends with the same sentence.
- The note of the account manager ends with "Cannot create a repair from a report."
- The viewer, the developer, the driver and the accountant: no edit.

`permissionPageData.test.ts` gets the new sentences and the level of the account manager (§7); the
levels asserted by the earlier specs stay, except that the account manager's level in
"Repairs & Maintenance" is now `read`.

## 6. Behaviour scenarios (Playwright, written and not run, D228)

The Dashboard grid is a PixiJS canvas with no click hook, so a scenario cannot click a bar or a
cell. They drive the DOM: the "+ Create" menu, the Damage Reports page and the windows. A bar and a
wrench are covered by unit tests and by the browser check of the user (D232). The scenarios are
written for the files named in §4 and are not run (the user's rule); the report marks E2E as
**written, not run**. The fixture adds, through the service role, an open unlinked report on a fresh
bleacher and a linked one, and removes them in its teardown. Numbers continue the series: S51 and on.

- **S51 (admin): "+ Create" and an empty window.** On `/dashboard` the menu has two items. "Maintenance
  Event" opens the New repair window, empty, with no service form over it.
- **S52 (admin): a repair from a report.** On the Damage Reports page the card of an open unlinked
  report has "Create Maintenance to Resolve". It opens the New repair window with the service form
  over it, Bleacher chosen as the bleacher of the report. Cancel on the form, the two days, Add repair:
  the red line "Add at least one service." shows. Add a service for that bleacher and Add repair:
  both windows close, the list refreshes and (polling) the report has the new repair's id in
  `maintenance_event_uuid` and is not resolved.
- **S53 (admin): no button on a linked report.** The card of the linked report has no
  "Create Maintenance to Resolve".
- **S54 (maintainer): the menu has one item.** On `/dashboard` "+ Create" holds only "Maintenance
  Event" and it opens the empty window.
- **S55 (account manager): the menu has the other item.** "+ Create" holds only "Sub-Rental
  Request". On the Damage Reports page the card of an open unlinked report has no
  "Create Maintenance to Resolve".
- **S56 (viewer): no "+ Create".** `/dashboard` has no such button.

`damage-reports.admin.spec.ts` looks for "Create Maintenance to Resolve" on a report; its fixture
is checked, and if that report is linked the scenario is changed to an unlinked one.

## 7. Tests (Vitest, written first)

All run in the node environment; tests are written first and seen failing (red) before the code.
The windows are drawn in a portal that `renderToStaticMarkup` cannot render, so their content and
their pure start (`newRepairStart`) are tested, not the dialog. The grid is PixiJS and has no
unit test; its change is covered by the type check, and the bar and the wrench by §6 and the
browser check.

- **`utils/newRepairPreset.test.ts`.**
  - `cellRepairDates`: with no block, the end is seven days after the start; across a month and a
    year (`2026-12-28` gives `2027-01-04`) and over a leap day; a block that holds the start cuts the
    end at its end; a block that starts inside the seven days cuts the end the day before it;
    a block that starts the day after the start makes the end equal the start; the earliest of
    several later blocks counts; a block that ended before the start changes nothing; a block that
    holds the start and a later block: the smaller end wins; blocks given as ISO timestamps use their
    first ten characters; an end is never before the start.
  - `presetRepairForm`: no preset gives `emptyRepairForm()`; a preset puts its two days in and
    leaves the rest as the empty form; a preset with only a bleacher leaves the days empty.
  - `requiredServiceError`: null with no preset, with `requireService` false and with a service;
    `REQUIRE_SERVICE_MESSAGE` with `requireService` and an empty draft; a service of any bleacher
    counts (D233).
- **`state/useRepairWindowsStore.test.ts`.** `open` pushes; opening the window that is on top
  changes nothing; `close(index)` removes that window and the ones above; `reset` empties; a `new`
  entry keeps its preset, including the `onCreated` function.
- **`utils/repairDetails.test.ts`** (changed): `resolveWindows` passes the preset of a `new` entry
  on, and a `new` entry needs no row.
- **`components/RepairWindow.test.tsx`** (changed): `newRepairStart` with no preset gives the empty
  form and no service window; with a bleacher it gives `{ kind: "new", bleacherUuid }`; with days
  only, the days and no service window.
- **`components/ServiceWindow.test.tsx`** (changed): the content of a New service window with
  `initialBleacherUuid` has that bleacher chosen and Severity empty; without it the form is empty.
- **`CreateEventButton.test.tsx`** (changed): `createMenuFor` for an administrator (both), an
  account manager (sub-rental only), a maintainer (maintenance only), a viewer (none), and for a
  person with two roles (the union); `CreateMenuItems` draws only the shown items; the button is
  drawn for a maintainer and not for a viewer. The old test of the open maintenance form's controls
  is removed.
- **`CellEditor.test.tsx`** (changed): the Maintenance icon for an administrator and a
  maintainer, not for an account manager or a viewer; "Work Tracker" and "Create Sub-Rental" for an
  administrator and an account manager, not for a maintainer.
- **`loadEventForModal.test.ts`** (changed): the store mock of the maintenance form is gone and the
  tests still pass.
- **`_lib/fixedMark.test.ts`** (changed): `canCreateRepairForReport` is true only for a manager with
  an unresolved, unlinked report, and false for a non-manager, a resolved report and a linked report.
- **`damageOverlayRanges.test.ts`** (changed): names only (D226); the numbers do not change.
- **`permissionPageData.test.ts`** (changed): the new sentences of the four rows (§5), the old ones
  are gone, the level of the account manager in "Repairs & Maintenance" is `read`, and the other
  levels are as before.

## 8. Edge cases and errors

- **Clerk and auth.** Roles come from `useTeamPermissions`; while they are not known no menu item
  and no icon is drawn (`canManage` is false). A window opened by a click is the same as on the
  Repairs page, and its writes show their own red toasts.
- **Offline.** The windows write to the local database, so they work offline, except the files
  (spec 09b3). The old form needed a connection; the window does not.
- **The rows are not loaded yet.** A click on a bar before the host's rows have loaded shows the
  window when they arrive, and nothing in between. The New repair window does not wait for rows.
- **A repair that is deleted** while its window is open leaves the stack (spec 06 §2.5).
- **A bar of a repair with several bleachers** is on the row of each bleacher; every one opens the
  same window.
- **A cell of a sub-rental row.** The bleacher is the same; `blocks` come from the original row of
  that bleacher, as today.
- **A double click on the wrench or on a bar:** the second `open` is ignored (the same window is on
  top), and the cell editor closes with the first.
- **A bleacher that the service form does not list** (a deleted bleacher): the select shows empty
  and the person chooses (09b1 D153).
- **A preset day that is already past or inside another repair's days:** the window does not check
  it; the zone check of 09b2 runs when a service is added.
- **A report that gets linked elsewhere while its card is open:** the button was drawn at the
  moment of the render; a repair made from it follows 09b2 D179 and does not take that report.
- **Two hosts at once** would draw every window twice. Each page mounts one, and the card of a
  report in the cell editor of the Dashboard does not mount another.
- **An account manager who still has the Dashboard open from before the release:** the old form
  is gone with the new code; nothing of it stays in the browser's memory after a reload.
- **The old form's address on 33 repairs** (spec 07 D100) is not shown and cannot be changed any
  more (D18, D220).

## 9. Not in this spec

- **An Owner field, an Address field, a typed cost, and the scroll buttons** in the window (D18,
  D220, D227).
- **Bounds on the days from sub-rentals** in the window, on either page (D221).
- **A highlight of the open repair on the grid, a pinned bleacher, a bleacher added by a click on
  its row** (D225).
- **A change of the damage strips' rule** (D226), and a rule that closes only the report the
  button was pressed on (D230).
- **A migration:** closing the database to an account manager (D224), and the Storage policies
  (D209).
- **Tests that developer, driver and accountant cannot open `/repairs`** (D211).
- **A write for an account manager** on either page (D215).
- **The other Dashboard forms:** the event form and the sub-rental form keep their code and their
  selection modes.
- **A success message, an undo, a retry of a failed write.**
- **A browser check by Claude** (D232: the user makes it) and **running the Playwright
  scenarios**.
- **The headers of the specs 04 to 09b3** (plan D213).

## 10. Definition of done

- `npm run tc` and `npx vitest run`, each with the real output and the exit code (Node 24 first in
  `PATH`).
- `npx prettier --check` on the files this spec touches only (the repo-wide `npm run lint` is red at
  baseline); the spec's Markdown is also checked for an inline code span that breaks a line.
- Playwright E2E: **written (S51 to S56) and not run**; the report says so.
- The browser check is made by the user (D232); the report lists what nobody has seen: the click on
  a bar and the window over the canvas, the wrench with a real sub-rental near, the prefilled window
  and the service form opening over it, the `AlertDialog` and the `Dialog` stacked over the card of
  a report, the host on the three pages, the menu of each role, and the disappearance of the old
  selection mode.
- A mutation check of three rules (the end of `cellRepairDates` cut by the next block, the item
  of `createMenuFor` for a maintainer, and `requiredServiceError`) with the files restored by hash,
  as in 09a to 09b3.
- The matrix rows of §5 are edited in the same commit.
- The Ukrainian artifact of this spec is updated with the status and the result.
- A search of the source finds no import of a deleted file and no `useMaintenanceEventStore`.
- The final report with real output: TS compilation, Vitest, E2E (written, not run). The deploy
  order is repeated: the migration `20261117120000` and the sync rules (`../br_powersync` 692b21c,
  not pushed) on the server before the first write; this spec adds nothing to the server.

## 11. Result (2026-11-23)

- **Done as specified.** The maintenance flow of the Dashboard uses the repair window and the old
  form is gone. A click on the bar of a repair opens the repair window over the Dashboard; "+ Create"
  has its items by role (`createMenuFor`) and "Maintenance Event" opens an empty New
  repair window; the maintenance icon of a cell, for an administrator and a maintainer on every
  cell, opens New repair with the bleacher and the days of `cellRepairDates`, and the service form
  over it; "Create Maintenance to Resolve" opens New repair with the bleacher of the report,
  requires a service, and closes the card when the repair is added; the windows are drawn by
  `RepairWindowsHost` from `useRepairWindowsStore`, mounted on the Repairs page, the Dashboard and
  the Damage Reports page. 21 counted files (3 new: `utils/newRepairPreset.ts`,
  `state/useRepairWindowsStore.ts`, `components/RepairWindowsHost.tsx`; 18 changed, as listed in
  §4) and 11 deleted, plus the comment of `damageOverlayRanges.ts`, the matrix rows, the tests and
  the e2e files. No migration, no sync change, no change to the list query or to `AppSchema.ts`.
- **Tests first.** Red run before any code: 9 files failed (two new suites could not import their
  modules, and 30 tests failed in `repairDetails.test.ts`, `RepairWindow.test.tsx`,
  `ServiceWindow.test.tsx`, `CreateEventButton.test.tsx`, `CellEditor.test.tsx`,
  `fixedMark.test.ts` and `permissionPageData.test.ts`); then green. `tc` exit 0, `vitest` exit 0
  (580 files and 8810 tests, +2 files and +53 tests over the 578 and 8757 of 09b3), Prettier clean
  on the 34 source and test files, on the 7 e2e files and on this spec. Mutation check of three
  rules caught: the next block no longer cuts the end in `cellRepairDates` (5 failing tests), a
  maintainer loses the maintenance item in `createMenuFor` (3), and `requiredServiceError` no
  longer requires a service (2); the two files were restored and their hashes compared.
- **E2E** S51 to S56 are written (an agent wrote them) and **not run** (D228):
  `e2e/dashboardRepairs.admin.spec.ts` (S51 to S53) and `e2e/helpers/dashboardFlow.ts` (new), S54
  in `repairsAccess.maintainer.spec.ts`, S55 (two tests) in `repairsAccess.am.spec.ts`, S56 in
  `repairsAccess.viewer.spec.ts`, and `repairsFixtures.ts` (`seedRepairs` returns `dashboard`: two
  fresh bleachers with no zone, `base + 120` and `base + 121`, one with an open report no repair
  has, one with an open repair and an open report linked to it; each report has its own note and
  one uploaded photo, because the Damage Reports page hides a report whose photos are not all
  uploaded; the existing cleanup removes them). Choices the scenarios made: the Dashboard viewport
  is 1280 by 900 as the other Dashboard specs, a timeout of 300 s and a wait of up to 120 s for "+
  Create", and the Rows toggle as the sign that the toolbar has loaded. S56 is an absence check
  and can pass before the roles arrive, as the Dashboard specs of the other roles can. I also
  changed the helper `openFirstOpenDamageReportCard` of
  `manageTeam/e2e/helpers/damageReportsPage.ts` to skip a card that says "Linked to:", because
  `damage-reports.admin.spec.ts` expects "Create Maintenance to Resolve" on the first open card
  and a linked report no longer has it (D235).
- **Extras against the spec text** (none changes a locked signature of §3):
  - `ServiceWindow.tsx` also exports `newServiceStart(bleacherUuid?)`, the pure start of the New
    service form, so D229 is tested without the dialog (the spec tests "the content with
    `initialBleacherUuid`"; the dialog cannot be rendered on the server).
  - `RepairWindowsHost` draws the New repair window only for a manager (`canManage`), whoever put
    the entry in the store. It is split into `RepairWindowsOwnRows` (the host that reads the live
    repairs while a window is open) and `RepairWindowsView` (the drawing); `RepairsPage` passes
    its own `rows`.
  - `EventBody.handleLoadEvent` handles a maintenance bar before it asks for the Supabase client,
    because the repair window needs none.
  - The resolve block of the report card draws the hint and "Create Maintenance to Resolve"
    together (`showCreateRepair`), and draws no block at all when neither that button nor "Mark as
    Resolved" is offered.
  - In `StickyLeftColumnCellRenderer.ts` the subscription to the event store keeps `anyExpanded`
    as `s.isFormExpanded` alone (it never counted the sub-rental form). `Events.ts` also loses the
    preview span and the exclusion that the open form used.
  - Two comments still name the deleted code: `canEditOwnedEntity.ts` ("MaintenanceEventForm") and
    `repairStatusWrite.ts` ("as `createMaintenanceEvent` does"). They are comments outside the
    counted files and are left.
  - The 11 deletions were made with `git rm`, so they are staged; everything else is not.
- **Fixes after the browser check of the user (2026-11-23).** Two things came back from the first
  look at the Dashboard and the Damage Reports page. (1) The layers. The card of a report is
  `z-[1100]` and the cell editor `z-[1000]`, while every dialog of the project, the repair windows
  included, is `z-50`, so a window opened from the card was drawn under it. Now every dialog of
  the feature (the four windows, the damage report window and their five confirmation dialogs) has
  its content and its overlay at `z-[1150]` (`REPAIR_LAYER_CLASS` of the new
  `utils/repairLayer.ts`), over the card and under the photo lightbox of the card (`z-[1200]`);
  the menus that open inside a window (the two `SearchableSelect`s of the forms and the status
  menu) are `z-[1300]`. `DialogContent` and `AlertDialogContent` of `components/ui` gained an
  optional `overlayClassName`, and `SearchableSelect` an optional `popoverClassName`; a test reads
  the source of the feature and fails when a dialog or a menu of it has no layer. (2) A maintainer
  saw the whole Dashboard grey. The grey is the flag "no access to this bleacher", which was true
  only for an administrator and for an account manager in their own zones. `canAccessBleacherRow`
  (new, in `userAccess/logic`) now gives every bleacher to a maintainer too, on the normal rows
  and on the sub-rental rows, and `useDashboardPowerSync.ts` uses it. Nothing else changes:
  booking, editing and the icons of a cell keep their own gates, a maintainer still cannot book,
  and nobody gains or loses a right, so the matrix is not edited. A viewer's rows are grey by the
  same rule and are not changed here. These fixes add 11 files to the count of §4 (2 new,
  `utils/repairLayer.ts` and `userAccess/logic/canAccessBleacherRow.ts`; 9 changed,
  `ui/dialog.tsx`, `ui/alert-dialog.tsx`, `SearchableSelect.tsx`, `useDashboardPowerSync.ts`,
  `RepairFiles.tsx`, `DamageReportWindow.tsx`, `RepairStatusMenu.tsx`, `RepairForm.tsx` and
  `ServiceForm.tsx`; `RepairWindow.tsx` and `ServiceWindow.tsx` were already counted) and two test
  files. Tests first: both new suites failed to import, then green; `tc` exit 0, `vitest` exit 0
  (582 files and 8823 tests, +2 files and +13 tests), Prettier clean on the touched files;
  mutation check: a maintainer no longer let in (2 failing tests) and a service dialog without its
  layer (1), the files restored by hash. I have not seen either fix in a browser.
- **What nobody has seen** (the user makes the browser check, D232; there is no click hook on the
  canvas in the tests): the click on a bar and the window over the canvas, the wrench with a real
  sub-rental near, the prefilled window with the service form opening over it, the `AlertDialog`
  and the `Dialog` stacked over the card of a report, the host on the three pages, the "+ Create"
  menu of each role, the disappearance of the old selection mode (pinned bleachers, a click on a
  row), and a New repair window opened from the card of a report over the Damage Reports page.
- **Not done.** Nothing is committed (`seed.sql`, `supabase/.temp/cli-latest` and
  `scripts/seed_add_on_conflict.py` stay out of every commit). Deploy order: the migration
  `20261117120000` and the sync rules (`../br_powersync` 692b21c, not pushed) must be on the
  server before the first write; this spec adds nothing to the server.
