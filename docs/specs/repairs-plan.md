# Repairs page: plan

Status: **APPROVED 2026-11-18** together with spec 01 (0 open decisions in the plan; every page
spec asks its own decisions before it is written). Eleven specs: 01 is the design, 02 to 10 are
the page by layers, 11 moves the Dashboard to the new window. Page: `/repairs`. Design:
`docs/design/repairs/`. Branch: `q4-sprint4-maintenance`.

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

**Decisions taken by the user (2026-11-18).**

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

**What the code has today (researched 2026-11-18).**

- **The page.** `src/app/repairs/page.tsx` renders `RepairsPage`
  (`src/features/qualityAssurance/components/RepairsPage.tsx`): a plain table (Event, Start, End,
  Bleachers, Cost, Notes), a Bleacher select kept in `?bleacher_uuid=`, Show Deleted with a
  Restore button, and a click on a row (admin and maintainer) that opens `MaintenanceEventForm`
  in a dialog.
- **The data hook.** `useRepairs` reads `MaintenanceEvents`, `BleacherMaintEvents` and `Bleachers`
  from the local PowerSync database in two steps (the event ids of a bleacher, then the rows).
- **The form.** `MaintenanceEventForm` has the tabs Core (Event Name, Address, Start Date, End
  Date, Repair Cost, Owner) and Files. The same component is used by the Repairs page and by
  `MaintenanceEventPanel` on the Dashboard. Saving needs an event name, both dates and at least
  one bleacher.
- **The sidebar.** Quality Assurance holds Damage Reports, Inspections, Annual Inspections and
  Repairs; Repairs is shown to admin, account_manager, viewer and maintainer
  (`src/components/sidebar/useSidebarItems.ts`).
- **Rights.** `canManageDamageAndMaintenance` (admin or maintainer) decides who sees Edit,
  Delete, Restore and Show Deleted. The database also lets an account manager write. The
  matrix row is "Repairs & Maintenance" in `src/features/userAccess/permissionPageData.ts`.
- **Sync (`../br_powersync/config/sync_rules.yaml`, web streams).** `MaintenanceEvents.*`,
  `BleacherMaintEvents.*` and `Bleachers.*` reach admin, account_manager, viewer and maintainer.
  `Vendors.*` reaches admin, account_manager and accountant only. No stream carries
  `MaintenanceLineItems`, `DamageCategories`, `DamageReportCategories` or `MaintenanceBudgets`.
- **Schema (maintenance-01).** `MaintenanceEvents` has `vendor_uuid`, `invoice_number`, `status`,
  `completed_at`, `currency` and `zone_uuid` besides `event_start`, `event_end`, `cost_cents`,
  `notes`; `Bleachers` has `model_number` and `asset_value_cents`; `Vendors` has the address,
  contact and status columns; the invoice total is kept by a trigger.
- **To reuse.** `DataTable` (`src/components/DataTable.tsx`), `Pagination` and its page-size
  helpers, `Tabs`, `Dialog` and `Badge` in `src/components/ui`, the currency helpers
  `formatTotalsAmounts` and `sumByCurrency` in
  `src/features/quotesAndBookings/utils/eventCurrency`, and the shared 40 px toolbar style of
  `AuditRangeControls`.
- **Tests that exist.** `src/features/manageTeam/e2e/damage-repairs.maintainer.spec.ts` opens
  `/repairs` as a maintainer.
- **Checks of the project (CLAUDE.md).** `npm run tc`, `npm run test`, `npm run lint` (format
  only the touched files: `npm run format` rewrites about 120 unrelated files). Playwright specs
  are written and **not run** (the user's rule); the report marks that step SKIPPED. The seeded
  E2E admin user has no `Users` row locally, so admin specs cannot run there.

## 1. The eleven specs

Each spec is its own logic, its own "Approved" and its own commit. A page spec is written only
after the design is approved, and only after its questions are answered. Under each spec is what
it must settle; these are questions, not decisions.

- **01, the design:** [repairs-01-design.md](repairs-01-design.md). The eleven boards in
  `docs/design/repairs/`. No app code.
- **02, sync rules:** the web streams in `../br_powersync` for the data the page reads.
  - Which role gets `MaintenanceLineItems`, `DamageCategories` and `DamageReportCategories`.
  - `Vendors` for maintainer, and for viewer, who has no read right on `Vendors` today.
  - Deploy order with the migration.
- **03, the list query:** the local queries and hooks: one repair with its services, bleachers,
  vendor, zone, categories, severities, amounts, the Reported date by the rule of D9, the Open
  and Completed split, and the sums per currency. Nothing visible.
  - The exact matching rule of Reported when several reports fit.
- **04, the table:** the 17 columns, the chips, the status pill (not yet a menu), the tabs, the
  strip, the pager and the empty state, replacing the old table. Read-only.
  - Adds its rows in the permissions matrix in the same commit (see §2).
- **05, the toolbar:** search, the four filters, Show Deleted, sorting and the default order, and
  their state in the URL.
  - What Show Deleted looks like with the tabs.
- **06, the expanded row and the service window (view):** the services table, the Reported link,
  the damage report view, the bleacher data.
  - The "Open repair" button of the service window needs spec 07.
- **07, the repair window (view):** every field, the services table, the files, the created
  date. Opened by the row button and by the service window.
- **08, status:** the pill menu, the write, `completed_at`, the move between the tabs.
  - What `completed_at` does when a completed repair is reopened.
  - Updates its row in the permissions matrix in the same commit (see §2).
- **09, writes:** Edit and New repair, services (Edit, Add, Delete), files, Delete and Restore.
  - The fixed event name, the Vendor select, the currency pre-fill, the zone of the repair, the
    one-zone rule, the duplicate invoice number check, the first status.
  - Updates its rows in the permissions matrix in the same commit (see §2).
- **10, permissions:** who sees which buttons, the Playwright specs per role, and a final check
  of the matrix.
- **11, the Dashboard:** the maintenance flow of a Dashboard cell uses the New repair window and
  the old form is deleted.

## 2. Order and one rule to keep

- **Order:** 01, then 02 to 10 in order, then 11. A later spec needs the earlier ones.
- **The permissions matrix.** CLAUDE.md says the matrix `permissionPageData.ts` is updated in
  the same commit as the change that alters what a role can do, and no spec may leave that for
  later. So a spec that puts data on a screen or changes what a role can do carries its rows
  itself: 04 (the first screen that shows vendors and Reported), 08 and 09. A spec that only moves
  data that no screen shows yet (02, 03) carries none, as in maintenance-01 §3 (user, 2026-11-18).
  Spec 10 holds the button gates, the role specs and the last check.

## 3. Out of the series

The Vendors page, the Dashboard & Analytics page, the Assets additions, the sidebar changes for
them, the damage category settings (adding and switching categories off), the budget form, the
driver's hourly maintenance rate, the driver app, the Driver Parts Tracker and the GPS Trackers.
