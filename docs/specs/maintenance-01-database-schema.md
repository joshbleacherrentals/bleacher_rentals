# Maintenance 01: database schema for repairs, invoices and line items

Status: **APPROVED and IMPLEMENTED 2026-11-17, uncommitted** (no open decisions; what differs
from the text below is in §11).
One spec, one logic, one commit. Branch: `q4-sprint4-maintenance`.
Scope: the database only (migration, client schema, types, SQL tests). No page, no form, no
sync rules. Those come in later specs (§8).

## 0. The feature in brief

**The request.** At the 2026-11-13 stand-up (Josh, Sam, Max) it was decided that Sam's Google
spreadsheet moves into the app: the maintenance log, the service vendors, the bleacher
inventory and the dashboard. The first step is the database. The user asked for a schema plan
before any page is built.

**The database is shared.** The web app and the driver app (`../br_driver`) read and write one
Supabase database. The PowerSync sync rules live in the sibling repo `../br_powersync`. Old
builds of the driver app stay in use, so everything new on an existing table is nullable or has
a default.

**Decisions taken by the user (2026-11-16 and 2026-11-17).**

- **D1:** `Vendors` is extended. No new vendor table.
- **D2:** one row of `MaintenanceEvents` is one repair and one invoice. The repair columns
  (vendor, invoice number, status, completion date, currency, zone) go on this table.
- **D3:** the services of an invoice are line items in a new table `MaintenanceLineItems`.
  One line is one damage category on one bleacher, with its own severity, labour, parts, tax
  and freight. The list will show one row per invoice with the total, and a click opens the
  lines.
- **D4:** the invoice has one number, stored as text. The number is unique within a vendor.
- **D5:** the currency is a column of the invoice (`CAD` or `USD`). It is not on `Zones`,
  because a zone can hold regions of both countries. Nothing is converted: CAD and USD totals
  are shown side by side.
- **D6:** the column is `not null default 'USD'`. Every existing event becomes USD. A later
  form pre-fills the currency from the vendor's country (`Vendors.address_uuid`, then
  `Addresses.country`) and lets the user change it.
- **D7:** one invoice has one zone. It is stored in `MaintenanceEvents.zone_uuid` and is taken
  at `event_start`: the bleacher's own zone, or the borrowing zone when an accepted sub-rental
  covers `event_start`. This spec adds the column. The form that fills it is a later spec.
- **D8:** `cost_cents` stays the full invoice total. It is not changed and not ignored. A
  database trigger keeps it equal to the sum of the invoice's lines.
- **D9:** the repair status is an enum: `inbound`, `triaged`, `waiting_repair`, `in_repair`,
  `confirm_repair`, `completed`. The first status is `inbound`, and it is the default.
- **D10:** at migration time an existing event whose `event_end` is before today becomes
  `completed`. The other existing events keep the default `inbound`.
- **D11:** bleachers get `model_number` and `asset_value_cents`. The value is in USD for every
  bleacher, so there is no currency column. The value must not reach the drivers' phones.
- **D12:** vendors get `address_uuid` (city, state or province and country come from
  `Addresses`, so there are no such columns on `Vendors`), phone, contact name, contact email,
  four service flags, a status and notes. The contact is in these columns.
- **D13:** damage categories are a table, not an enum, so Sam can add and switch them off. Nine
  start values: Tires, Wiring, Jacks, Hydraulics, Welding, Batteries, Seating, Hauling,
  Unassigned.
- **D14:** a damage report can have several categories: new table `DamageReportCategories`.
  It keeps the column `report_resolved_at`. Whether the phones show the categories of other
  drivers' open reports, and any change of the sync rules for it, is decided when the driver
  app itself is changed. A repeated insert of the same pair is a silent no-op.
- **D15:** a yearly budget is a table `MaintenanceBudgets`, one row per year and currency.
- **D16:** the driver's hourly maintenance rate is not part of this spec.
- **D17:** staff rights on the new tables follow the existing rights on repairs and damage
  reports (§3).
- **D18:** damage categories and budgets are written by admin and maintainer.
- **D19:** maintainer joins admin, account_manager and accountant on `Vendors`: read, add and
  edit. Delete stays with admin and account_manager. Today a maintainer cannot see vendors
  at all, and no web stream syncs `Vendors` to a maintainer. The Maintenance module needs
  them for the repair form and the vendors tab. Viewer is not added.

## 1. What exists today

- **`MaintenanceEvents`:** `address_uuid`, `cost_cents` (integer), `created_at`,
  `created_by_user_uuid`, `deleted`, `event_end` (date), `event_name`, `event_start` (date),
  `id`, `notes`. It has no bleacher and no zone column.
- **`BleacherMaintEvents`:** the junction `bleacher_uuid` and `maintenance_event_uuid`. One
  repair can cover several bleachers.
- **`DamageReports`:** already has `maintenance_event_uuid`.
- **Driver scorecard:** a trigger on `MaintenanceEvents` (insert, update, delete) sums
  `cost_cents` into the stat `maintenance_cost_per_year`. A recomputed `cost_cents` therefore
  reaches the scorecard like any other update.
- **Rights on repairs** (migration `20260923140000`): read admin, account_manager, viewer,
  maintainer; create, edit, delete admin, account_manager, maintainer. The rule "an account
  manager edits only their own" was dropped at the database level and stays in the interface.
- **Rights on damage reports:** read, create, edit, delete admin, account_manager, maintainer.
  Drivers have their own policies.
- **`Addresses.country`:** an ISO-2 code (`US`, `CA`), empty for old addresses and for
  addresses not entered through the Google autocomplete.
- **Upload errors on the web:** `BackendConnector.ts` discards a write that fails with a fatal
  code (`23505`, `42501`, `23514` among them) and shows the toast "A change could not be saved
  and has been discarded."
- **Local database:** in step with the repo (184 migrations applied, 184 files, checked
  2026-11-17), so `npm run gtl` is safe to run after the migration.

## 2. Database

One migration: `supabase/migrations/20261117120000_maintenance_schema.sql`.

### 2.1 Enums

- **`maintenance_severity`:** `minor`, `major`, `routine`.
- **`repair_status`:** `inbound`, `triaged`, `waiting_repair`, `in_repair`, `confirm_repair`,
  `completed`.
- **`vendor_status`:** `verified`, `caution`, `under_review`, `prospect`, `do_not_use`.

The existing enum `public.currency` (`USD`, `CAD`) is reused.

### 2.2 New tables

**`DamageCategories`**

- `id` uuid, primary key, default `gen_random_uuid()`.
- `created_at` timestamptz, default `now()`.
- `name` text, not null, unique.
- `is_active` boolean, not null, default true.
- The nine start rows are inserted by the migration.

**`DamageReportCategories`**

- `id`, `created_at` as above.
- `damage_report_uuid` uuid, not null, foreign key to `DamageReports`, on delete cascade.
- `damage_category_uuid` uuid, not null, foreign key to `DamageCategories`.
- `report_resolved_at` timestamptz, nullable. A copy of `DamageReports.resolved_at`, kept by
  triggers (§2.4), in the same way as on `DamageReportAcknowledgements`.
- Unique index on (`damage_report_uuid`, `damage_category_uuid`).

**`MaintenanceLineItems`**

- `id`, `created_at` as above.
- `maintenance_event_uuid` uuid, not null, foreign key to `MaintenanceEvents`.
- `bleacher_uuid` uuid, not null, foreign key to `Bleachers`.
- `damage_category_uuid` uuid, nullable, foreign key to `DamageCategories`.
- `severity` `maintenance_severity`, not null.
- `description` text, nullable.
- `labor_cents`, `parts_cents`, `tax_cents`, `freight_cents` integer, not null, default 0,
  each checked to be at least 0.
- `deleted` boolean, not null, default false.
- There is no zone, no currency and no author on a line. They are on the invoice, and the
  invoice already has `created_by_user_uuid`.
- The total of a line is not stored. It is the sum of the four amounts.

**`MaintenanceBudgets`**

- `id`, `created_at` as above.
- `year` integer, not null.
- `currency` `public.currency`, not null.
- `amount_cents` integer, not null, checked to be at least 0.
- Unique on (`year`, `currency`).

### 2.3 New columns on existing tables

**`MaintenanceEvents`**

- `vendor_uuid` uuid, nullable, foreign key to `Vendors`.
- `invoice_number` text, nullable. Unique within a vendor (index in §2.5).
- `status` `repair_status`, not null, default `inbound`.
- `completed_at` timestamptz, nullable.
- `currency` `public.currency`, not null, default `USD`.
- `zone_uuid` uuid, nullable, foreign key to `Zones`.
- `cost_cents` is unchanged in type. §2.4 keeps it equal to the sum of the lines.
- The migration sets `status = 'completed'` where `event_end < current_date`.

**`Bleachers`**

- `model_number` text, nullable.
- `asset_value_cents` integer, nullable, checked to be at least 0. USD.

**`Vendors`**

- `address_uuid` uuid, nullable, foreign key to `Addresses`.
- `phone`, `contact_name`, `contact_email`, `notes` text, nullable.
- `does_trailer_repair`, `does_aluminum_welding`, `does_mobile_repair`, `is_parts_supplier`
  boolean, not null, default false.
- `status` `vendor_status`, nullable. Empty for the vendors that exist today.

**Not changed:** `Zones`, `Drivers`, `DamageReports`.

### 2.4 Triggers

- **Invoice total.** After insert, update or delete on `MaintenanceLineItems`, the function
  sets `MaintenanceEvents.cost_cents` to the sum of labour, parts, tax and freight of the lines
  of that invoice where `deleted = false`. When a line moves to another invoice, both invoices
  are recomputed. An invoice that never had lines is not touched. An invoice whose lines are
  all deleted gets 0.
- **Repeated category.** Before insert on `DamageReportCategories`, a pair that already exists
  is dropped silently (the trigger returns null). A unique violation would stall the driver's
  upload queue.
- **Mirror.** Before insert (or update of `damage_report_uuid`) on `DamageReportCategories`,
  `report_resolved_at` is copied from the report. After `DamageReports.resolved_at` changes,
  the copies are rewritten. This is the pattern of migration `20260910140000`.

All three functions are `security definer` with `search_path = public`.

### 2.5 Indexes

- Unique partial index on `MaintenanceEvents` (`vendor_uuid`, `invoice_number`) where
  `invoice_number` is not null and `vendor_uuid` is not null and `deleted = false`. Events
  without a number or a vendor, and deleted events, do not count.
- Indexes on `MaintenanceLineItems`: `maintenance_event_uuid`, `bleacher_uuid`,
  `damage_category_uuid`.
- Indexes on `MaintenanceEvents.vendor_uuid` and `MaintenanceEvents.zone_uuid`.
- Index on `Vendors.address_uuid`.
- Index on `DamageReportCategories.damage_category_uuid`.

## 3. Rights (row level security)

Roles are the ones in `get_user_roles()`. Every new table has row level security on.

**`DamageCategories`**

- **Read:** drivers, admin, account_manager, viewer, maintainer.
- **Add and edit:** admin, maintainer. There is no delete policy. A category is switched off
  with `is_active`.

**`DamageReportCategories`** (the same staff as `DamageReports`)

- **Read:** drivers, admin, account_manager, maintainer.
- **Add:** a driver, on a report they created. Staff: admin, account_manager, maintainer.
- **Edit and delete:** admin, account_manager, maintainer. A driver cannot change or withdraw
  a category once it is saved.

**`MaintenanceLineItems`** (the same as `MaintenanceEvents`)

- **Read:** admin, account_manager, viewer, maintainer.
- **Add, edit, delete:** admin, account_manager, maintainer.

**`MaintenanceBudgets`**

- **Read:** admin, account_manager, viewer, maintainer.
- **Add and edit:** admin, maintainer. There is no delete policy.

**`Vendors`** (existing table, rights extended by D19)

- **Read, add, edit:** admin, account_manager, accountant, and now maintainer.
- **Delete:** admin, account_manager, as today.
- The migration changes the three existing policies (`rbac_select`, `rbac_insert`,
  `rbac_update`) to include maintainer, as migration `20260923140000` did for repairs. The new
  columns fall under these policies.

**Existing tables.** `MaintenanceEvents`, `Bleachers` and `Zones` keep their policies, and the
new columns fall under them. Developer and accountant have no access to the new tables. A
driver has no access to line items or budgets.

**Permissions page.** `permissionPageData.ts` is not changed in this spec, because no screen
exposes these rights yet, the maintainer's new access to `Vendors` included. The first spec with
a screen adds the rows, in the same commit as the screen.

## 4. Client (TypeScript)

- **`database.types.ts`:** regenerated with `npm run gtl` after the migration is applied. The
  new enums and tables appear as `Database["public"]["Enums"]` and `["Tables"]`.
- **`src/lib/powersync/AppSchema.ts`:**
  - Four new tables with the column types used elsewhere in the file: text for uuid, text,
    timestamps and enums; integer for cents, booleans (0 or 1) and years. Each satisfies
    `PowerSyncColsFor<"...">`, so the compiler fails if the schema and the types disagree.
  - Indexes on the foreign keys listed in §2.5.
  - The new columns on `MaintenanceEvents`, `Bleachers` and `Vendors`.
  - The tables are added to the `Schema`, and record types are exported:
    `DamageCategoriesRecord`, `DamageReportCategoriesRecord`, `MaintenanceLineItemsRecord`,
    `MaintenanceBudgetsRecord`.
- **Registries:** no other file lists every table (`DamageReportAcknowledgements` appears only in
  `database.types.ts`, `AppSchema.ts` and one feature file), so none is changed.
- **No other code changes.** The current Repairs form keeps working: the new
  `MaintenanceEvents` columns that are not null have defaults.

## 5. Behaviour scenarios (Playwright)

None. There is no page, so there is no user path to test. E2E is SKIPPED for this spec, and the
later screen specs carry the scenarios.

## 6. Tests

**SQL test:** `supabase/tests/maintenance_schema.test.sql`, in the style of the other files in
that folder (everything in a transaction that is rolled back, run through the local database).

- **Enums:** the three enums exist with the listed values.
- **Categories:** the nine start rows exist, and a repeated name is refused.
- **Line item amounts:** a negative amount is refused.
- **Invoice total:** two lines give the sum; a soft-deleted line leaves the sum; a deleted line
  leaves the sum; all lines gone gives 0; a line moved to another invoice recomputes both; an
  invoice that never had lines keeps its own `cost_cents`.
- **Invoice number:** the same number and vendor is refused; the same number for another vendor
  is allowed; a number is reusable after the first event is soft-deleted; two events without a
  number do not clash.
- **Defaults:** a new event is `inbound` and `USD`.
- **Migration step:** run against the real local data in a rollback (dry run): events with a
  past `event_end` become `completed`, and every event is `USD`.
- **Category per report:** a repeated pair leaves one row; the mirror is filled on insert and
  follows the report when it is resolved and reopened.
- **Budgets:** the same year in another currency is allowed; the same year and currency is
  refused; a negative amount is refused.
- **Bleachers:** a negative `asset_value_cents` is refused.
- **Rights:** for each of admin, account_manager, viewer, maintainer, developer, accountant and
  a driver, the read and write outcome on each new table and on `Vendors` matches §3 (same
  technique as `work_tracker_types_admin_only_writes.test.sql`).

**Vitest:** no new test. `npm run tc` is the guard for `AppSchema.ts` against the generated
types, and the existing suites must stay green.

## 7. Edge cases and errors

- **Duplicate invoice number from the web.** The upload fails with `23505`, and the connector
  discards the change and shows the toast. The later form must check the number before saving,
  so the user's work is not lost.
- **Rejected writes.** A write refused by the rights (`42501`) or a check (`23514`) is
  discarded in the same way. These are the existing rules of `BackendConnector.ts`; this spec
  adds no auth logic.
- **Offline (PowerSync).** The total is recomputed on the server. The local `cost_cents` is
  updated when the next sync arrives, so the later screens must add up the local lines.
- **Sub-rent changes later.** A stored `zone_uuid` does not move when a sub-rental is added,
  changed or removed after the invoice is saved.
- **Bleachers from different zones on one invoice.** The database does not detect it. The
  later form refuses it (one invoice, one zone).
- **A vendor without a country.** The currency stays at the default `USD` until the user
  changes it. The form decides how to ask.
- **Old driver builds.** They never write the new tables and ignore the new columns.
  `DamageReports` is not changed.
- **A used category.** It cannot be deleted (no delete policy) and is switched off with
  `is_active`.

## 8. Not in this spec

- **Sync rules in `../br_powersync`:**
  - **Bleachers on phones.** The mobile rule is `SELECT * FROM "Bleachers"`, so it would carry
    `asset_value_cents` to every phone. The value is empty until a form writes it, so this spec
    leaks nothing. Before the first value is stored, the rule must become a column list
    without that column. It is made together with the spec that stores the value.
  - **Web streams** for the new tables and for `Vendors`, per role.
  - **`DamageReportCategories` on phones:** decided when the driver app is changed (D14).
- **Pages and forms:** the repairs list, the invoice window, the vendors tab, the dashboard,
  the damage category settings and the budget form.
- **Filling `zone_uuid` and pre-filling the currency.**
- **The category multiselect in the driver app.**
- **The driver's hourly maintenance rate** (D16).
- **The web roles that read `Bleachers`** receive `asset_value_cents` through the existing
  `Bleachers.*` streams. Limiting it to some roles is not decided.

## 9. Files

- `supabase/migrations/20261117120000_maintenance_schema.sql` (new).
- `supabase/tests/maintenance_schema.test.sql` (new).
- `database.types.ts` (regenerated).
- `src/lib/powersync/AppSchema.ts` (new tables and columns).
- This spec, and its Ukrainian copy as an artifact (not committed).

## 10. Definition of done

- `npm run tc`, `npm run test`, and the SQL test, each with the real output.
- `npx prettier --check` on the touched files only (the repo-wide `npm run lint` is red at
  baseline).
- Playwright E2E: SKIPPED, with the reason in §5.
- The migration applied to the local database and `npm run gtl` run after it.

## 11. What differs from the text above

- **pgTAP.** The local database has no pgTAP, so the SQL test was run with its `plan`, `ok`
  and `finish` lines taken out. The file keeps them for a database that has pgTAP.
- **Migration step on real data.** A dry run in a rolled-back transaction on the 151 local
  events: all 151 became `completed` (all have a past `event_end`) and all are `USD`. No local
  event is current or future, so the case "stays `inbound`" is covered only by the default-status
  test.
- **A refusal hidden by a trigger.** The trigger that drops a repeated category pair runs
  before the policy is checked, so an unauthorised insert of a repeated pair is dropped without
  an error. Nothing is written, so it is harmless. The rights test therefore uses pairs that
  nobody else uses.
- **Local database.** The migration is applied to it (185 migrations), and `npm run gtl`
  regenerated `database.types.ts`. Only the three touched tables, the three enums and the four
  new tables changed.
