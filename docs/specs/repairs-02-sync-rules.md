# Repairs 02: web sync rules for the data of the Repairs page

Status: **APPROVED and IMPLEMENTED 2026-11-18**, the change in `../br_powersync` is committed
there as 692b21c on the user's word, not pushed (0 open decisions; the results are in §8). Build order: **02 of 11**. Needs: [repairs-01-design.md](repairs-01-design.md) (approved) and the migration of
[maintenance-01-database-schema.md](maintenance-01-database-schema.md). Needed by: 03 and the specs
after it. Plan: [repairs-plan.md](repairs-plan.md). Branch: `q4-sprint4-maintenance`, in this
repository and in `../br_powersync` (the user created it there and it is checked out).
Scope: **one file in the sibling repository, `../br_powersync/config/sync_rules.yaml`.** No
migration, no app code, no change to the permissions matrix. This repository gets only this spec.

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

**Decisions of this spec (user, 2026-11-18).**

- **D21:** the viewer gets `Vendors` in full on the web, all columns (`Vendors.*`), so the Vendor
  column and the vendor's address work for them.
- **D22:** the viewer gets `DamageReportCategories` on the web, so Reported works for them.
- **D23:** the change is made on the branch `q4-sprint4-maintenance` of `../br_powersync`, which
  the user created and which is checked out there. Nothing is committed there until the user
  says so.
- **D24:** the permissions matrix `permissionPageData.ts` is not changed by specs 02 and 03. The
  first spec with a screen for the data (04) adds the rows, as maintenance-01 §3 did. The plan §2
  says so.

**What the code has today (sync, researched 2026-11-18).**

- **The file.** `../br_powersync/config/sync_rules.yaml` has one web stream, `web`, with
  `auto_subscribe: true` and one `SELECT` per table and role. The role is checked in the join:
  viewer `JOIN "Users" ON "Users"."is_viewer" = true`, admin `"Users"."is_admin" = true`,
  maintainer `JOIN "Maintainers"` (active), account manager `JOIN "AccountManagers"` (active),
  accountant `JOIN "Accountants"` (active). Every line ends with the web-app check, the Clerk user
  and the inactive-status predicate.
- **Lines today (line numbers of 2026-11-18).**
  - `MaintenanceEvents`: viewer 55, maintainer 143, account manager 339, admin 433.
  - `DamageReports`: viewer 44, maintainer 140, account manager 327, admin 419.
  - `Vendors`: account manager 343, admin 442, accountant 196. None for viewer or maintainer.
  - No role carries `MaintenanceLineItems`, `DamageCategories`, `DamageReportCategories` or
    `MaintenanceBudgets`.
  - `BleacherMaintEvents`, `Bleachers`, `Zones` and `Addresses` already reach all four roles that
    see the Repairs page.
- **Read rights (migration 20261117120000).**
  - `MaintenanceLineItems`: admin, account_manager, viewer, maintainer.
  - `DamageCategories`: drivers, admin, account_manager, viewer, maintainer.
  - `DamageReportCategories`: drivers, admin, account_manager, maintainer.
  - `Vendors`: admin, account_manager, accountant, maintainer.
- **Streams and rights are separate.** The sync service reads the database itself, so a stream can
  carry a table that the row level security would not let that role read directly. The viewer's
  stream already carries `DamageReports`, although the policy of `DamageReports` has no viewer.
  The web app reads its data from the local database, so the policies only gate direct reads and
  writes.
- **Rules learned from earlier changes to this file.**
  - A table must not be listed with a column list when another query of the same client syncs it
    with `*`: the rows overwrite each other.
  - A join to the row the query returns makes one bucket per row. A join that hangs off the signed-in
    user only stays one shared bucket.
  - The service does not watch the file; it is restarted to load a change.
- **The mobile stream** is not touched by this series.
- **Tests.** The file has no test. The check is to compile it with the service's own library
  (§3). No container of the service was running when this spec was written.

## 1. What this spec decides

**From the user's words (not options):** D21, D22 and D23 above, and that the streams carry what
the Repairs page reads: the repairs and their services, the vendors, the damage categories and the
categories of the damage reports.

**Follows from decisions already taken (not options):**

- **Who gets which new table.** Each follows the read rights above, plus D21 and D22.
  - **admin:** `MaintenanceLineItems`, `DamageCategories`, `DamageReportCategories`.
  - **account manager:** `MaintenanceLineItems`, `DamageCategories`, `DamageReportCategories`.
  - **viewer:** `MaintenanceLineItems`, `DamageCategories`, `DamageReportCategories`, `Vendors`.
  - **maintainer:** `MaintenanceLineItems`, `DamageCategories`, `DamageReportCategories`,
    `Vendors` (maintenance-01 D19 gave the maintainer the right to read vendors).
  - **accountant, developer, driver (web):** nothing new.
- **How a line is written.** Each new line is the role's existing `MaintenanceEvents` line with
  the table name replaced, `SELECT "<Table>".*` with `*` and no column list, placed directly under
  that role's `MaintenanceEvents` line, with one comment line that names this spec. The viewer's
  and the maintainer's `Vendors` lines are written the same way, with the role's own join.
- **No migration.** The viewer has no policy on `Vendors` or `DamageReportCategories`, and the
  page does not need one, because it reads the local database. A direct Supabase read of those
  tables by a viewer stays refused.
- **The matrix:** not changed (D24).

## 2. The change

Fourteen new lines in `../br_powersync/config/sync_rules.yaml`.

- **admin:** three, under its `MaintenanceEvents` line (`MaintenanceLineItems`, `DamageCategories`,
  `DamageReportCategories`).
- **account manager:** the same three, under its `MaintenanceEvents` line.
- **viewer:** the same three and `Vendors`, under its `MaintenanceEvents` line.
- **maintainer:** the same three and `Vendors`, under its `MaintenanceEvents` line.

Each line keeps the existing role join and the three trailing conditions
(`connection.parameter('app') = 'web'`, the Clerk user, the inactive-status predicate). The rest
of the file is not touched.

## 3. Checks

- **Compile.** Load the file with the service's own library (`SqlSyncRules.fromYaml` with the
  default schema `public` and `throwOnError: false`, inside the service's container) and expect no
  errors. If no container is running, start the service from `../br_powersync` first, or report
  the step as not run.
- **Buckets.** List the web data sources that have bucket parameters, before and after the change.
  The count must not grow. A new line that joins to the row it returns would make one bucket per
  row.
- **Tables per role.** Read the web queries before and after and list the tables each role gets.
  The only differences are the fourteen lines of §2.
- **No column lists.** None of the fourteen lines has a column list.
- **Not covered.** That the rows arrive on a device is not checked here: the tables are empty
  until a repair has services, and no screen reads them yet. The first screens that show them are
  specs 03 and 04.

## 4. Edge cases

- **A user with two roles** (for example account manager and viewer) gets one table from two
  queries. Both use `*`, so the rows are identical and nothing overwrites.
- **Inactive users** are excluded by the predicate that every line keeps.
- **What the viewer's browser holds.** With D21 the viewer's local database holds whole vendor
  rows: EIN, HST, QuickBooks id and contacts. The pages show none of these to a viewer; they are
  in the browser's local storage.
- **Deploy order.** The migration of maintenance-01 first, because the service needs the tables
  to exist; then the rules, with a restart of the service; then the app. The user deploys.
- **Data size.** The services of all repairs and the categories go to four roles. Both are small
  next to the other tables of those streams.

## 5. Not in this spec

- **The mobile stream:** `DamageReportCategories` on phones, and the `Bleachers` column list
  without `asset_value_cents`. They wait for the driver app change and for the spec that stores
  the first asset value (maintenance-01 §8).
- **`asset_value_cents` on the web:** the existing `Bleachers.*` streams carry it to every role
  that reads `Bleachers`. Limiting it to some roles is not decided (maintenance-01 §8).
- **`MaintenanceBudgets`:** the Repairs page does not read it.
- **The repair's files and photos:** spec 07.
- **`Users` rows for authors:** the repair window shows only the date of creation (D5).
- **Row level security** and the **permissions matrix** (D24).

## 6. Files

- `../br_powersync/config/sync_rules.yaml` (changed; committed there as 692b21c, not pushed).
- This spec, and its Ukrainian copy as an artifact (not committed).

## 7. Definition of done

- The compile check and the bucket count before and after, each with the real output (or the step
  named as not run, with the reason).
- The list of tables per role before and after, showing only the fourteen lines.
- `npx prettier --check` on this spec.
- `npm run tc`, `npm run test` and Playwright in this repository: SKIPPED, because nothing but this
  spec changes here.
- The change in `../br_powersync` stayed uncommitted until the user said to commit it; it was
  committed there as 692b21c (2026-11-18), not pushed.

## 8. Result (2026-11-18)

- **Implemented:** fourteen queries (and one comment line above each role's block, 18 added lines
  in all) in `../br_powersync/config/sync_rules.yaml`, on the branch `q4-sprint4-maintenance`.
  Committed there afterwards as 692b21c on the user's word (2026-11-18), not pushed.
- **Compile.** Run in the container `br_powersync-powersync-1` (OrbStack, image
  `journeyapps/powersync-service:1.20.5`) with `SqlSyncRules.fromYaml`, on copies of the file
  before and after the change: 0 errors in both, 25 data sources in both.
- **Buckets.** Web data sources with bucket parameters: 2 before (`web|0`, `web|7`) and 2 after.
  All sources with parameters: 15 before and 15 after.
- **Tables per role (text read of the web queries).** Account manager +3, admin +3, viewer +4,
  maintainer +4; accountant and developer unchanged; nothing removed. The number of web queries
  with a column list is the same before and after.
- **Compiled web tables.** The union grew from 96 to 99: `DamageCategories`,
  `DamageReportCategories` and `MaintenanceLineItems`. `Vendors` was already in it for other
  roles.
- **Not done.** The running local service was not restarted, so it still serves the old rules
  until the user restarts it. That rows arrive on a device is not checked (§3). The files copied
  into the container's `/tmp` for the check were removed afterwards.
- **This repository.** No code changed, so `npm run tc` and `npm run test` were not run again;
  the run before the commit c82093c9 was green (tc exit 0; 542 test files, 7873 tests).
