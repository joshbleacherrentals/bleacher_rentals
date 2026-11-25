# Repairs 03: the list query (local queries, rules and hook)

Status: **APPROVED and IMPLEMENTED 2026-11-18**, uncommitted (0 open decisions; the results
are in §11). Build order: **03 of 11**. Needs:
[repairs-01-design.md](repairs-01-design.md), [repairs-02-sync-rules.md](repairs-02-sync-rules.md)
(both done) and the migration of
[maintenance-01-database-schema.md](maintenance-01-database-schema.md). Needed by: 04 and the specs
after it. Plan: [repairs-plan.md](repairs-plan.md). Branch: `q4-sprint4-maintenance`.
Scope: **new code in a new folder, `src/features/repairs`: five local queries, the rules that
turn them into list rows, and one hook. Nothing is visible.** No page, no UI, no migration, no
sync change, no change to the permissions matrix. The old `useRepairs` and `RepairsPage` stay as
they are until spec 04 replaces them.

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

**Decisions of this spec (user, 2026-11-18).**

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

## 1. What the code has today (researched 2026-11-18)

- **The old hook.** `src/features/qualityAssurance/hooks/useRepairs.ts` reads `MaintenanceEvents`,
  `BleacherMaintEvents` and `Bleachers` in two steps and sorts by `event_start`. It is used only
  by `RepairsPage`. It knows nothing of vendors, services, status or currency.
- **Tables the new hook reads (all local, all in the web streams of admin, account manager,
  viewer and maintainer after spec 02).** `MaintenanceEvents`, `MaintenanceLineItems`,
  `BleacherMaintEvents`, `Bleachers`, `Zones`, `Vendors`, `DamageCategories`, `DamageReports`
  and `DamageReportCategories`. The `AppSchema.ts` columns exist (maintenance-01).
- **Nothing writes the new tables yet.** No code outside `AppSchema.ts` and `database.types.ts`
  reads or writes `MaintenanceLineItems`, `DamageCategories` or `DamageReportCategories`.
- **The local database (Supabase dev, 2026-11-18, counts of the dev data, not production).**
  - **Repairs:** 151, of which 8 are deleted and 143 live. All are `completed`, `USD`, named
    "Maintenance / Repair", with no vendor, no zone and no `completed_at`. 38 repairs (all live)
    have a cost above zero; 111 have `cost_cents` empty and 2 have 0. 132 live repairs have notes.
  - **Junction:** 154 rows for the 151 repairs, 70 bleachers; one repair has four bleachers.
  - **Services:** none. **Report categories:** none. **Damage categories:** the 9 start rows.
  - **Reports:** 260, of which 41 are deleted; 172 carry a link to a repair (all closed, all on a
    bleacher of that repair); 62 are open and without a link; 26 are closed without a link. A
    bleacher has 3 reports on average and at most 10.
  - **Effect of D26 on this data:** 107 of the 143 live repairs find at least one report through
    the link (a report that is deleted is not counted); the other 36 show a dash.
- **Helpers to reuse.** `db` and the typed helpers `useTypedQuery` and `expect`
  (`src/lib/powersync/typedQuery.ts`), `useTimezoneStore` (`src/lib/useTimezoneStore.ts`), luxon.
- **How the project tests a local query.** `src/features/accountantAudit/db/auditTrackers.test.ts`
  builds the module's SQL with the app's `db` behind a bound proxy (see the memory
  note on `db.fn`) and runs the compiled text on an in-memory SQLite shaped like the local
  database. Hooks are not unit-tested in this project (there is no `renderHook`), so the logic
  goes into pure functions.

## 2. The rules

**Words.** `day(x)` is the calendar day `YYYY-MM-DD` of the timestamp `x` in the app time zone
(D37), or nothing when `x` is empty or not a date. "Visible services" of a repair are the
services the query returned for it (D34). `J(E)` is the set of bleachers of the repair `E` in
the junction (D29).

### 2.1 Which repairs

- The hook has two parameters: `showDeleted` and `timezone`.
- Normal view: `deleted = 0`. Show Deleted: `deleted = 1` (D34). The Open and Completed split is
  not a query, it is a pure function over the result (§2.9).

### 2.2 Fields of a row

- **Straight from the repair:** id, event name, start, end, notes, created at, deleted, status,
  currency, invoice number, vendor id.
- **Vendor name:** `Vendors.display_name`; empty when the vendor is not synced or not set.
- **Bleachers:** from the junction, one entry per bleacher, ordered by bleacher number (D29).
  A bleacher whose row is not synced yet has no number.
- **Severities:** the distinct severities of the visible services, in the order major, minor,
  routine (D8, drawn so on the canvas).
- **Categories:** the distinct categories of the visible services, in the order of the services.
  A service without a category adds none.
- **Services:** ordered by `created_at`, then by id. Each carries its own Reported (§2.6).

### 2.3 Money

- **Total** is `cost_cents` (D32). Empty stays empty (a dash in the table, zero in the strip).
- **Labor, Parts, Tax and Freight** are the sums of the visible services (D7). A repair with no
  visible service has all four empty (a dash), which is also what the old repairs show (D30).
- **A service's total** is the sum of its four amounts. It is not stored.
- **Currency** is the repair's `currency`; any value other than `CAD` is read as `USD`, the
  value the column takes when none is given.

### 2.4 Zone

- If `zone_uuid` is set: that zone alone, with its name.
- If not: the distinct zones of the junction bleachers (D33), ordered by name.
- If there is none: an empty list (a dash).

### 2.5 Completed

- Open repair (any status except `completed`): nothing (a dash), whatever `completed_at` holds
  (D10). What `completed_at` does when a completed repair is reopened is decided in spec 08.
- Completed repair: `day(completed_at)` when it is set; otherwise `event_end` (D31); otherwise
  nothing.

### 2.6 Reported

Reports considered are the rows of `DamageReports` with `deleted = 0`. The photo-upload flag is
not looked at. A report whose `created_at` is not a date is not counted.

A report `R` is found for the repair `E` when one of these holds:

- **Link (D26).** `R.maintenance_event_uuid = E.id` and `R.bleacher_uuid` is in `J(E)`.
- **Category (D26).** A visible service `S` of `E` has a category, `R.bleacher_uuid` is the
  bleacher of `S`, `R` has a row in `DamageReportCategories` for the category of `S`, and `R`
  waited for `E` (D27, D28):
  - **either** `R.maintenance_event_uuid = E.id` (closed by this repair; counts always),
  - **or** `R.maintenance_event_uuid` is empty, and `day(R.created_at)` is not after
    `E.event_start`, and `R.resolved_at` is empty or `day(R.resolved_at)` is not before
    `E.event_start`.
  - A report that carries a link to **another** repair never fits by category.
  - A repair with no `event_start` finds by category only the reports linked to it.

Found reports are listed once each (a report that fits by both ways is one), earliest
`created_at` first, ties by id. The row shows the first one's day, links to the first one, and
shows `+N` with N = the number of reports minus one (D38); no report is a dash (D9).

- **Per repair:** every report found for `E`, by link or by any visible service.
- **Per service `S`:** the reports found by link on the bleacher of `S`, and the reports found by
  the category of `S`.

### 2.7 Deleted rows

Only through the queries (D34): the services query takes the repair's `deleted` flag from the
join, and adds `deleted = 0` for the services only in the normal view. A deleted bleacher or
vendor row is not filtered; it is shown as stored.

### 2.8 Order

Rows are returned by `created_at` descending, rows without `created_at` last, ties by id (D36).
Spec 05 sorts on top of this.

### 2.9 Tabs and the strip

- **Open:** every status except `completed`; **Completed:** `completed`. A status the code does
  not know counts as open (D12). The split keeps the order of the rows.
- **Totals for the strip (D13):** for any list of rows, the sum of Total, in cents, per currency,
  with both `CAD` and `USD` always present (a missing Total counts as 0). Nothing is converted.
  The strip itself is spec 04.

## 3. The queries (`src/features/repairs/db/repairListQueries.ts`)

Each is a function returning a compiled Kysely query, built from the app's `db`, with its own
exported row type, and the hook ties it with `expect<T>()`. No `db.fn` is used (it is stripped
by the db proxy).

- **Repairs.** `MaintenanceEvents` as `me`, left join `Vendors` (name) and `Zones` (name of the
  stored zone). Where `me.deleted` is the view's flag.
- **Services.** `MaintenanceLineItems` as `li`, joined to `MaintenanceEvents` for the repair's
  `deleted`; left join `Bleachers` (number) and `DamageCategories` (name). Where the repair's
  `deleted` is the view's flag; in the normal view also `li.deleted = 0`.
- **Junction.** `BleacherMaintEvents`, joined to `MaintenanceEvents` for `deleted`; left join
  `Bleachers` (number, `zone_uuid`) and `Zones` (name).
- **Reports.** `DamageReports` where `deleted = 0`: id, bleacher, `created_at`, `resolved_at`,
  `maintenance_event_uuid`.
- **Report categories.** `DamageReportCategories`: report and category.

## 4. Types (locked; changing them needs a new "Approved")

File `src/features/repairs/utils/repairRows.ts`. The enum types come from
`database.types.ts` (`Database["public"]["Enums"]`).

```ts
export type RepairStatus = Database["public"]["Enums"]["repair_status"];
export type RepairCurrency = Database["public"]["Enums"]["currency"];
export type RepairSeverity = Database["public"]["Enums"]["maintenance_severity"];

/** A damage report found for a repair or a service. */
export type ReportedReport = {
  id: string; // DamageReports.id, the link target
  day: string; // YYYY-MM-DD, created_at in the app time zone
  createdAt: string; // the stored timestamp, for the order
};

export type RepairService = {
  id: string;
  bleacherUuid: string;
  bleacherNumber: number | null;
  damageCategoryUuid: string | null;
  categoryName: string | null;
  severity: RepairSeverity;
  description: string | null;
  laborCents: number;
  partsCents: number;
  taxCents: number;
  freightCents: number;
  totalCents: number; // the sum of the four, not stored
  deleted: boolean;
  createdAt: string | null;
  reported: ReportedReport[]; // earliest first; empty = dash
};

export type RepairListRow = {
  id: string;
  eventName: string | null;
  eventStart: string | null; // YYYY-MM-DD
  eventEnd: string | null; // YYYY-MM-DD
  notes: string | null;
  createdAt: string | null;
  deleted: boolean;
  status: RepairStatus;
  currency: RepairCurrency;
  invoiceNumber: string | null;
  vendorUuid: string | null;
  vendorName: string | null;
  completedOn: string | null; // YYYY-MM-DD; null while the repair is open
  zones: { uuid: string; name: string | null }[];
  bleachers: { uuid: string; number: number | null }[]; // by number
  severities: RepairSeverity[]; // distinct: major, minor, routine
  categories: { uuid: string; name: string | null }[]; // distinct
  services: RepairService[];
  laborCents: number | null; // null when the repair has no visible service
  partsCents: number | null;
  taxCents: number | null;
  freightCents: number | null;
  totalCents: number | null; // MaintenanceEvents.cost_cents
  reported: ReportedReport[]; // earliest first; empty = dash
};

export type RepairTab = "open" | "completed";
export type CurrencyTotals = { USD: number; CAD: number }; // cents
```

## 5. Files and functions

- **`src/features/repairs/db/repairListQueries.ts`** (new): the five builders of §3 and their row
  types.
- **`src/features/repairs/utils/dayInZone.ts`** (new): `dayInZone(value, timezone)`, the day of a
  timestamp in a zone, nothing for an empty or unreadable value. It repeats the one-line rule of
  `bookedAtDay` on purpose: that helper belongs to the quote page's booked date.
- **`src/features/repairs/utils/repairRows.ts`** (new): the types of §4 and
  `buildRepairRows(raw, timezone)`, a pure function that applies §2.2 to §2.8 to the results of
  the five queries and returns the rows in the starting order.
- **`src/features/repairs/utils/repairTabs.ts`** (new): `splitByTab(rows)` and
  `totalsByCurrency(rows)` (§2.9).
- **`src/features/repairs/hooks/useRepairList.ts`** (new):
  `useRepairList({ showDeleted, timezone }) => { rows: RepairListRow[]; isLoading: boolean }`.
  It runs the five queries through `useTypedQuery`, waits until all five have loaded, and
  passes the results to `buildRepairRows` inside a `useMemo`. `isLoading` is true until then.
- **Unchanged:** `useRepairs.ts` and `RepairsPage.tsx` in `qualityAssurance`; `AppSchema.ts`;
  `permissionPageData.ts` (D24).

That is five source files. Tests do not count, and there is no file outside the new folder.

## 6. Behaviour scenarios (Playwright)

None. Nothing is visible, so there is no user path. The first scenarios come with spec 04.

## 7. Tests (Vitest, written first)

- **`repairListQueries.test.ts`** (SQLite harness through the bound proxy of the Audit tests).
  - Normal view: deleted repairs are not returned; deleted services are not returned.
  - Show Deleted: only deleted repairs; all their services, deleted or not (D34).
  - The repairs query returns the vendor name and the name of the stored zone, and still returns a
    repair with no vendor and no zone.
  - The junction query returns the bleacher number and the bleacher's zone, and not the rows of
    a repair outside the view.
  - The reports query leaves deleted reports out and has no photo-upload condition.
  - No query uses `db.fn`.
- **`repairRows.test.ts`** (plain objects in, rows out).
  - A repair with three services: chips are distinct and ordered; Labor, Parts, Tax, Freight are
    the sums; Total is `cost_cents`, not the sum of the services (D32).
  - An old repair with no services: bleachers from the junction, the four sums empty, categories
    and severities empty, Total from `cost_cents`, `cost_cents` empty gives an empty Total (D30).
  - Completed: set `completed_at` gives its day in the zone; empty gives `event_end` (D31); an
    open repair gives nothing even when `completed_at` is set.
  - Zone: stored zone alone; no stored zone gives the distinct zones of the junction bleachers;
    nothing gives an empty list (D33).
  - Reported by link only (the old repairs); by category only; by both (counted once).
  - Reported, what does not fit: a deleted report; a report linked to another repair; a report
    closed before `event_start`; a report created after `event_start` and not linked; a report
    on another bleacher; a report with another category.
  - Reported, what fits: a report closed on the day of `event_start`; a report created on the day
    of `event_start`; a linked report whose dates are outside both rules (counts always).
  - Several reports: the earliest first, the link to the earliest, `+N` counts reports not days
    (two on one day), per service and per repair (D38).
  - Time zone: a report created at `2026-03-05T02:00:00Z` is on the 4th in Toronto and on the 5th
    in UTC, and the rule against `event_start` follows (D37).
  - A repair with no `event_start` finds only linked reports; a report with an unreadable
    `created_at` is not counted; a service without a category finds only by link.
  - An unknown currency reads as `USD`.
  - The starting order: `created_at` descending, empty last, ties by id (D36).
- **`repairTabs.test.ts`.** The split keeps the order; an unknown status is open; the totals have
  both currencies when a list has one, and `0` for an empty list; a repair with an empty Total
  counts as 0; two currencies are not added together.

## 8. Edge cases and errors

- **Offline (PowerSync).** Every read is local, so the list works offline. A service saved on
  this device shows in Labor, Parts, Tax and Freight at once and in Total after the server has
  recomputed it and the sync has brought it back (D32).
- **Before the new sync rules are live** on a user's stream, `MaintenanceLineItems`, `Vendors`
  and the category tables are empty on that device: the repairs show as old repairs with no
  vendor and no Reported by category (the link still works).
- **Clerk and auth.** The hook reads only the local database and makes no network call, so a
  Clerk error does not reach it. Who may open the page is spec 10.
- **A query fails.** `useTypedQuery` returns no data and the hook returns an empty list with
  `isLoading` false; the page cannot tell this from "no repairs". This is how the other local
  hooks of the project behave; showing an error is not in this spec.
- **Junction lag.** A repair with services and no junction rows (a partial sync) has no
  Bleachers chips and the zone of its stored `zone_uuid` only. The services still show.
- **Show Deleted totals.** In that view, Labor, Parts, Tax and Freight add up every returned
  service, including one deleted by itself earlier, while Total is `cost_cents`, which the server
  computed from the live services only. They can differ (D32, D34).
- **Size.** The five queries read whole tables of the view (143 repairs, 260 reports today). A
  commit on any of those tables re-runs the affected queries; with thousands of reports the
  reports query is the heaviest. Nothing is limited today (D35).
- **A completed repair that is reopened** keeps `completed_at` until spec 08 says otherwise; the
  row shows a dash while it is open (§2.5).

## 9. Not in this spec

- **Anything visible:** the table, chips, status pill, tabs, strip, pager (04); search, filters,
  Show Deleted button, sort arrows and URL state (05); expanded row, service window, the damage
  report view (06); repair window (07).
- **Writes:** status, completed_at, Edit, New repair, services, files, Delete, Restore (08, 09),
  including keeping the junction equal to the services' bleachers (D29).
- **Data for the windows:** the bleacher's model number, type and zone for the service window,
  the vendor's address and contact, the files, the author date (06, 07).
- **The option lists of the filters** (05).
- **A migration** that fills `completed_at` or `zone_uuid` of the old repairs (not chosen, D31, D33).
- **The matrix** `permissionPageData.ts` (D24), the Playwright specs (04 onwards), sync rules.

## 10. Definition of done

- `npm run tc` and `npx vitest run`, each with the real output.
- `npx prettier --check` on the new files and this spec only (the repo-wide `npm run lint` is
  red at baseline).
- Playwright E2E: SKIPPED, because nothing is visible (and the user's rule is not to run it).
- No change outside `src/features/repairs` and `docs/specs`.

## 11. Result (2026-11-18)

- **Implemented:** the five source files of §5 and four test files, all in `src/features/repairs`:
  `db/repairListQueries.ts`, `hooks/useRepairList.ts`, `utils/dayInZone.ts`,
  `utils/repairRows.ts`, `utils/repairTabs.ts`, with `repairListQueries.test.ts`,
  `dayInZone.test.ts`, `repairRows.test.ts` and `repairTabs.test.ts`. Nothing else changed except
  this spec and the status lines of spec 02. The old `useRepairs` and `RepairsPage` are untouched.
- **Tests first:** the four test files were written before the code and failed to load without it.
- **Checks.**
  - `npm run tc`: exit 0 (the `expect<T>()` row types match the compiled queries exactly).
  - `npx vitest run`: exit 0, 546 files and 7944 tests (before: 542 and 7873, so +4 files and
    +71 tests: 45 in `repairRows`, 14 in the queries, 7 in the tabs, 5 in `dayInZone`).
  - `npx prettier --check` on the new files and on specs 02 and 03: clean.
  - Playwright: SKIPPED, nothing is visible and the user's rule is not to run it.
- **Mutation check.** Three rules of `repairRows.ts` were broken one at a time (closed on the day
  of the start no longer counts; created on the day of the start no longer counts; a report
  linked to another repair counts). The tests failed each time (1, 2 and 1 failing tests) and the
  file was restored byte for byte.
- **What differs from the text above.**
  - The "a deleted report" case of §7 is tested in `repairListQueries.test.ts`, because the
    reports query leaves such a report out and it never reaches the rules.
  - `dayInZone.test.ts` is added; §7 listed no separate test for it.
  - Where a local column can be empty although the database says not null, the code reads a
    missing status as `inbound`, a service with no bleacher as an empty bleacher id, and a close
    time that is not a date as "cannot be placed" (the report is then not counted by category).
    §2 does not say these.
  - Every raw row type is nullable except `id`, because the local text and integer columns carry
    no not-null rule.
- **Not verified.** The hook has no unit test (the project has no `renderHook`) and nothing renders
  it yet, so it was not run in the browser or against real PowerSync data. The queries were run
  on an in-memory SQLite shaped like the local database, and `tc` checks them against the schema.
  The first run on real data is spec 04.
- **Not done.** Nothing is committed.
