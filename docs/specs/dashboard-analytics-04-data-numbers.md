# Dashboard & Analytics 04: the data and the numbers

Status: **APPROVED and IMPLEMENTED 2026-11-26** (5 decisions of the user in this spec, D36 to
D40; 0 open decisions; the sync rule is in `../br_powersync`, not committed there and not
deployed). Build order: **04 of 5**. Needs:
[dashboard-analytics-01-design.md](dashboard-analytics-01-design.md) (approved 2026-11-25) and
[dashboard-analytics-03-converter.md](dashboard-analytics-03-converter.md) (the rate lookup).
Needed by: 05, which shows these figures. It does not need spec 02. Branch:
`q4-sprint4-maintenance-dashboard`.
Scope: the local queries, the pure functions that turn their rows into every figure of the page,
the year logic, and one sync rule for `MaintenanceBudgets` in `../br_powersync`. **Nothing is
visible**: no page, no matrix row, no table or migration in the database.

## 0. The feature in brief (the same in the plan and in every spec)

**The request (user, 2026-11-24, translated).** Create the page Dashboard & Analytics at
`/dashboard-analytics`. It is made for the maintainer role. Admin and viewer can open it too, and
no other role can. It has a toggle between USD and CAD. It is a copy of the "Dashboard &
Analytics" tab of Sam's Google spreadsheet (id `1rz80xAoBtDzta7eYHvkKVyaDs-RRGzelufiamMKMi6w`),
explained by the Ukrainian task artifact of the 2026-11-13 stand-up and by the stand-up
transcript.

**Changed by the user (2026-11-25, translated).** No toggle between CAD and USD. Everything is
in USD, and a converter from CAD to USD takes the rates from a free exchange-rate API, so the
analytics are correct. The toggle and the questions that depended on it (an average per
currency, open work orders per currency) are withdrawn.

- **The database is done.** [maintenance-01-database-schema.md](maintenance-01-database-schema.md)
  and the Repairs series ([repairs-plan.md](repairs-plan.md)) are built. This series changes no
  table and adds no migration: it reads what the Repairs page writes.
- **Why a series of its own.** The Repairs plan (§3) put this page out of its series, as "a new
  item in the Quality Assurance dropdown".
- **How we work.** Every spec runs in its own chat, so every spec repeats this context. Each
  spec exists twice: English in the repository, and a full Ukrainian copy as an artifact that
  is not committed. The user takes every decision; a question is asked, never guessed. A spec
  has no "readings to confirm". The look is drawn first (D4).

**Decisions taken by the user (2026-11-24 and 2026-11-25).**

Who and where:

- **D1:** the page is `/dashboard-analytics`, a copy of the "Dashboard & Analytics" tab. A
  maintainer, an admin and a viewer open it; no other role does (from the request).
- **D2:** the path rule of `accessConfig.ts` compares a whole path segment for every role, not a
  prefix: a path is allowed when it equals an allowed path or starts with it and a "/". With the
  prefix rule an account manager, who has `/dashboard`, would open `/dashboard-analytics`
  (checked by a script on 2026-11-25). The same script found no existing route of `src/app`
  whose result changes. `/dashboard-analytics` is added to admin, viewer and maintainer only.
- **D3:** the page is an item of the Quality Assurance dropdown, named "Dashboard & Analytics",
  shown to admin, viewer and maintainer (the user's wording of 2026-11-18 in the Repairs plan).
- **D4:** the look is drawn first on the Design canvas (`docs/design/dashboard-analytics/`), and
  the page is built from the approved drawing. Spec 01 is the design only, as in the Repairs
  series.

Money in USD:

- **D5:** there is no currency toggle. Every amount on the page is in USD: a CAD repair is
  converted, a USD repair is as it is. This is for this page only. The Repairs page keeps its two
  totals, CAD and USD, not converted.
- **D6:** a CAD repair is converted at the rate of the day of its Repair from date
  (`event_start`). A day with no rate (a weekend, a holiday) takes the nearest earlier day that
  has one.
- **D7:** the rates come straight from the API into the page. There is no table for them in the
  database, no server job and no sync rule. The browser remembers the days it has received, so
  the next opening asks only for the days it does not have.
- **D8:** the API is Frankfurter: free, no key, the rates of the European Central Bank. Only
  dates and currency codes leave the app.
- **D9:** a day with no rate takes the last known earlier rate. When the browser knows no rate at
  all and the API cannot be reached (a first visit without internet), the page shows everything
  except the CAD repairs, with one line saying how many CAD repairs have no rate and are not
  counted.
- **D10:** when the period holds CAD repairs, a short note says how many of them were converted,
  and that the rates are Frankfurter's (ECB, daily).

The period:

- **D11:** a year selector lists every year that has a repair (by Repair from) and "All time";
  the list always holds the current year. The page opens on the current year, and the choice is
  not remembered (it is not in the address). Everything on the page follows it except the card
  Bleachers Ready (D16).
- **D12:** a repair belongs to the year of its Repair from date. Every spend figure counts every
  live (not deleted) repair, whatever its status.

The cards:

- **D13:** the bleachers of the page are all live bleachers (144 locally). A bleacher with no
  zone is counted in the Unassigned row of the zone table (2 locally).
- **D14:** Avg Maint Spend / Bleacher is the spend divided by all bleachers; in the zone table,
  the zone's spend divided by the bleachers of that zone. This is the sheet's formula, and it is
  a consequence of D5 and D13: with one currency there is no currency split to divide by.
- **D15:** "not finished" means every status except Completed: Inbound, Triaged, Waiting repair,
  In repair and Confirm repair.
- **D16:** the card Bleachers Ready (the sheet's Operational Readiness Rate, named so in spec 01)
  is always about today, whatever the year: a bleacher is not ready when it belongs to a live
  repair that is not finished; the card shows the ready bleachers out of all bleachers.
- **D17:** Active Open Work Orders counts the live repairs that are not finished and whose Repair
  from is in the chosen year (All time: all of them). Its caption counts the five statuses of D15;
  the sheet's line has four, and Inbound is the new one (a consequence of D15).
- **D18:** Annual Budget Utilization is read-only. It reads `MaintenanceBudgets`, USD rows only,
  and shows the spend as a percent of the budget, a line "Spent ... | Remaining ...", and red when
  the spend is over the budget. There is no pace line. A year with no row says "Budget not set".
  For All time it is all the spend of all time divided by the sum of every budget that is set.
  The rows are entered by a developer until a later spec adds a form. The table is added to the
  web sync streams of admin, viewer and maintainer in `../br_powersync`.

The tables and the chart:

- **D19:** the zone table has a row for every zone in `Zones` (8 locally), even with no bleachers
  and no spend. A repair counts for its own `zone_uuid` only; a repair with no zone goes to the
  Unassigned row. Columns as in the sheet; a Total row.
- **D20:** the Top High-Cost Models block groups bleachers by `Bleachers.model_number`, as the
  sheet does; a bleacher with no model is left out; the top five by cost, then a Top 5 Models
  Total row. With no model numbers the block says "No model numbers yet". Nothing in the app can
  fill the field today (a separate piece of work), and 0 of the 144 local bleachers have one.
- **D21:** the category table has every active damage category, even with no spend, and a
  switched-off category that has spend. A service with no category, and a repair with no
  services, go to Unassigned (the category exists among the nine). The Total row is the sum of
  the rows, so a repair with two categories counts in both, as in the sheet.
- **D22:** the column chart of spend per category, as the sheet's chart "Maintenance Spend by
  Category", sits beside the category table.
- **D23:** the vendor table has the six vendors with the most Labor + Parts (tax and freight are
  not in it, as in the sheet). Repairs with no vendor are not in it: there is no "No vendor" row.
  The Total row and the percents are over every vendor that has spend, not over the six shown.
- **D24:** no row and no card links to another page, and the sheet's line "Maintenance Tracked as
  of" is not shown.

**What the code has today (researched 2026-11-25).**

- **Access.** `src/features/userAccess/accessConfig.ts` lists the allowed paths of each role;
  `useAccessRedirect` and `canAccessPath` match them with `startsWith`. No server code gates a
  page by role: `src/proxy.ts` only asks for a Clerk session. The fence of the data is what syncs
  to a role and the database policies.
- **Sidebar.** Quality Assurance is a dropdown whose children carry their own `roles`
  (`src/components/sidebar/useSidebarItems.ts`).
- **Data in the local database.** `MaintenanceEvents` (status, currency, `zone_uuid`,
  `vendor_uuid`, `event_start`, `cost_cents`), `MaintenanceLineItems` (labor, parts, tax and
  freight cents, `damage_category_uuid`, `bleacher_uuid`), `BleacherMaintEvents`, `Bleachers`
  (`zone_uuid`, `model_number`), `Zones`, `Vendors`, `DamageCategories`, `MaintenanceBudgets`.
  The last one is in `AppSchema.ts` but in no web sync stream, and nothing in the app writes it
  ([repairs-02-sync-rules.md](repairs-02-sync-rules.md) §5).
- **Local figures (2026-11-25).** 144 live bleachers, 142 with a zone, 8 zones, 194 live repairs
  (190 Inbound and 4 Completed, all USD), 195 services, 192 repairs with no zone, 193 with no
  vendor, 9 categories, 0 budgets, 0 model numbers. The read-only database that Claude can query
  has no maintenance tables yet (the migration is not deployed there).
- **No exchange-rate code exists.** `formatMoney` (`src/features/quotesAndBookings/utils`) writes
  USD as "$" and CAD as "C$". Recharts 3.7 is in `package.json` (the scorecard and the driver
  satisfaction chart use it).
- **Frankfurter, tested on 2026-11-25.** No key; `access-control-allow-origin: *`, so a browser
  may call it; `cache-control: public, max-age=86400`. `GET /v1/latest?base=CAD&symbols=USD`
  gave 0.70137. A range request `/v1/2026-01-01..2026-11-24` returned 231 daily rates and a
  three-year range 782, one per business day. A Saturday (2026-03-07) returned Friday's rate
  (2026-03-06). The range start 2026-01-01, a holiday, returned 2025-12-31.
- **Checks of the project (CLAUDE.md).** `npm run tc`, `npm run test`, `npm run lint` (format
  only the touched files: `npm run format` rewrites about 120 unrelated files). Playwright specs
  are written and **not run** (the user's rule); the report marks that step SKIPPED.

**Decisions of spec 01 (user, 2026-11-25; the design and the canvas are approved).**

- **D25:** the blocks are in one column, each full width, one under another: zones, Top High-Cost
  Models, categories, the category chart, vendors. Above them is the row of five cards.
- **D26:** the title is "Dashboard & Analytics", with one short line under it in the style of the
  Repairs header. The line is drawn as "Maintenance spend, readiness and cost breakdowns across
  the bleachers" and corrected on the canvas.
- **D27:** the card about the ready bleachers is named "Bleachers Ready", with the caption "141 of
  144 ready to go". The sheet's name "Operational Readiness Rate" is not used (Sam said he does not
  like it). D16 is about this same card.
- **D28:** the year selector is a dropdown in the page header, at the right, showing the chosen
  year or "All time".

**Decisions of this spec (user, 2026-11-25).**

- **D36:** the bleachers of a repair come from the repair's list of bleachers
  (`BleacherMaintEvents`), as on the Repairs page and the Dashboard. The card Bleachers Ready and
  the count of repairs of a model use it. The services keep the same list when they are saved, so
  the two differ only for a moment after a service is deleted.
- **D37:** a CAD repair is converted whole, with one rate, instead of service by service. That is
  fewer calculations, and a difference of a few cents between two tables is accepted.
- **D38:** the category table lists the categories by spend, the biggest first; the categories
  with no spend follow, by name A to Z; Unassigned is last. The chart follows the same order.
- **D39:** when two vendors (Top 6) or two models (Top 5) have the same amount, the one whose name
  comes first, A to Z, is higher.
- **D40:** a yearly budget of exactly $0 counts as not set: the card says "Budget not set".

**Rules that follow from the decisions (no new choice).**

- **R1:** the tie rule of D39 is also the order of equal spend in the category table (D38) and of
  equal vendors in the "Largest Spend Vendor" column.
- **R2:** D37 converts the sums of a repair: its total, its Labor and its Parts, each once. A
  figure that needs the amount of one service (a category row, the spend of one bleacher, the cost
  of a model) converts that service at the same rate, so a row can differ from a card by a few
  cents, which D37 accepts.
- **R3:** a repair with no services (the old repairs now all have one, but a repair can lose its
  last service) has no bleacher, no category and no Labor or Parts. Its total is its stored
  `cost_cents`; it counts in the cards, in its zone and in its vendor's Work Orders, and in the
  Unassigned category (D21). Its list of bleachers is empty, so it blocks no bleacher.
- **R4:** every figure of the period leaves out a CAD repair that has no rate (D9) and counts it
  in `cad.withoutRate`. A CAD repair that has a rate counts in `cad.converted` (D10).
- **R5:** percentages are returned as ratios (0.195 for 19.5%), unrounded; spec 05 formats them
  with one decimal. A ratio over a zero total is 0.

## 1. What this spec delivers

- **The local queries** of §2.1 (Kysely, reactive through `useTypedQuery`) and the hook
  `useAnalyticsData` that reads them.
- **The pure functions** of §2.2 to §2.7: `buildAnalytics`, `oldestCadDay`, `analyticsYears`,
  `resolvePeriod`. They hold every rule below and are tested without React and without a database.
- **The sync rule:** `MaintenanceBudgets` added to the web streams of admin, viewer and maintainer
  in `../br_powersync/config/sync_rules.yaml` (§2.9).
- **No screen, no matrix row, no migration.**

## 2. Behaviour

### 2.1 What is read

Eight local queries, each a compiled Kysely query with its own row type, tied to its type in the
hook with `expect<T>()` as the Repairs hooks do. None uses `db.fn` (the app's `db` strips its
helper methods). Booleans come back as `0/1`.

- **Repairs:** `MaintenanceEvents` where `deleted = 0`: `id`, `event_start`, `status`,
  `currency`, `zone_uuid`, `vendor_uuid`, `cost_cents`.
- **Services:** `MaintenanceLineItems` joined to its repair, where the service and the repair
  both have `deleted = 0`: `id`, the repair's id, `bleacher_uuid`, `damage_category_uuid`,
  `labor_cents`, `parts_cents`, `tax_cents`, `freight_cents`.
- **Repair bleachers:** `BleacherMaintEvents` joined to its repair, where the repair has
  `deleted = 0`: `bleacher_uuid`, `maintenance_event_uuid`.
- **Bleachers:** `Bleachers` where `deleted = 0`: `id`, `zone_uuid`, `model_number`.
- **Zones:** `Zones`: `id`, `display_name`.
- **Vendors:** `Vendors`: `id`, `display_name` (every vendor, active or not).
- **Categories:** `DamageCategories`: `id`, `name`, `is_active`.
- **Budgets:** `MaintenanceBudgets`: `year`, `currency`, `amount_cents`.

The hook `useAnalyticsData()` returns `{ inputs, isLoading }`. `inputs` is the object of §3
built from the eight answers (nulls turned into the safe values of §3: a null amount is 0, a
null flag is false). `isLoading` is true until all eight queries have answered. It is reactive:
a change of any of the eight tables re-runs it.

### 2.2 Words used below

- **Live:** not deleted. A live service belongs to a live repair. A live bleacher has
  `deleted = 0`.
- **Period:** `{ kind: "year", year }` or `{ kind: "all" }` (D11).
- **The year of a repair:** the first four digits of `event_start`, a number. `event_start` is a
  date with no time of day, so no time zone is involved (D12).
- **In the period:** every live repair for All time; the live repairs whose year is the chosen year
  otherwise.
- **The rate of a repair:** 1 for a USD repair; `rateFor(event_start)` for a CAD repair (D6). When
  that is `null` the repair has no rate (R4).
- **Money of a repair**, in the cents of its own currency, from its live services:
  `labor`, `parts`, `tax` and `freight` are the sums of the services' amounts, a null amount being
  0, and `total` is their sum. With no service (R3): `total` is `cost_cents` (null is 0), `labor`
  and `parts` are 0.
- **Money of a repair in USD (D37):** `totalUsd`, `laborUsd` and `partsUsd` are `total`, `labor` and
  `parts` each passed once through `convertCents(x, rate)` (spec 03). For a USD repair the rate
  is 1.
- **Money of a service in USD (R2):** the sum of its four amounts passed through `convertCents`
  at the rate of its repair.
- **Names are compared** A to Z with `localeCompare` in English with numeric and base-letter
  options, so "Zone 2" comes before "Zone 10" and case is ignored, and by exact text when that says
  equal. This one comparer is used wherever a rule says "by name" (D38, D39, R1) and for the order
  of the zones (§2.5).
- **Averages** are `Math.round(cents / count)` and 0 when the count is 0.

### 2.3 The year logic

```ts
export function analyticsYears(repairs: AnalyticsRepair[], currentYear: number): number[];
export function resolvePeriod(choice: Period, years: number[], currentYear: number): Period;
export function oldestCadDay(repairs: AnalyticsRepair[]): string | null;
```

- **`analyticsYears`:** the distinct years of every live repair, plus `currentYear`, newest first
  (D11). A repair without a rate is still counted: the year list does not depend on rates.
- **`resolvePeriod`:** returns `choice` when it is All time or a year that is in `years`;
  otherwise the current year. This keeps the page valid when the chosen year loses its last
  repair while it is open.
- **`oldestCadDay`:** the smallest `event_start` among live CAD repairs of all time, or `null`.
  Spec 03's hook takes it as `oldestCadDay`.

### 2.4 The cards (D13 to D18, D36, D40)

- **Total Fleet Maintenance Spend** (`totalSpendCents`): the sum of `totalUsd` of every repair in
  the period that has a rate. Every live repair counts, whatever its status (D12).
- **Bleachers Ready** (`ready`), always about today, never the period (D16):
  - `total` is the number of live bleachers (D13).
  - A bleacher is **busy** when it is in the list of bleachers (D36) of a live repair whose
    status is not `completed`, of any year, with or without a rate. A bleacher in several
    repairs counts once. A bleacher not live is never counted.
  - `ready` is `total` minus the number of busy bleachers; `ratio` is `ready / total`.
- **Avg Maint Spend / Bleacher** (`avgPerBleacherCents`): `totalSpendCents` divided by the number
  of live bleachers (D14), rounded as the averages are.
- **Its caption, the range** (`rangeCents`): the spend of one bleacher is the sum of the USD
  money of the live services on it, in repairs of the period that have a rate. The range is the
  smallest and the largest of that spend over every live bleacher; a bleacher with no service
  is 0. With no bleacher the range is 0 to 0. A service on a bleacher that is not live counts in
  the totals and tables but not here.
- **Active Open Work Orders** (`openWorkOrders`): the repairs in the period that have a rate and
  whose status is not `completed` (D15). `byStatus` counts them for `inbound`, `triaged`,
  `waiting_repair`, `in_repair` and `confirm_repair`; `total` is their sum (D17).
- **Annual Budget Utilization** (`budget`):
  - **A year:** the row of `MaintenanceBudgets` with that year and the currency USD. Its amount
    is the budget when it is above 0; otherwise the budget is not set (D40).
  - **All time:** the sum of the amounts of every USD row above 0, of every year. A sum of 0, or
    no row, is not set (D18).
  - **Set:** `setCents` is the budget; `remainingCents` is `setCents - spentCents` and may be
    negative; `usedRatio` is `spentCents / setCents`; `isOver` is `spentCents > setCents`.
  - **Not set:** `setCents`, `remainingCents` and `usedRatio` are `null`; `isOver` is false.
  - `spentCents` is `totalSpendCents` in both cases (D18: for All time, all the spend of all time).
  - Rows in another currency are ignored (CAD budget rows are outside this series).

### 2.5 The zone table (D19)

- **Rows:** one for every row of `Zones`, in the order of the name comparer (so Zone 2 comes before
  Zone 10), then one **Unassigned** row, then the total.
- **`units`:** the live bleachers whose `zone_uuid` is that zone. Unassigned: the live bleachers
  with no zone, or with a zone that is not in `Zones`.
- **`workOrders`:** the repairs in the period that have a rate, whose own `zone_uuid` is that zone
  (D19: the repair's own zone, not the bleachers' zones). Unassigned: the repairs with no zone, or
  a zone that is not in `Zones`.
- **`costCents`:** the sum of `totalUsd` of those repairs.
- **`avgCostCents`:** `costCents` divided by `units`.
- **`share`:** `costCents` divided by `totalSpendCents` (R5).
- **Every zone is listed**, also with no bleacher and no repair (a row of zeros).
- **The total row:** `units` is the number of live bleachers; `workOrders` and `costCents` are the
  sums of the rows (so `costCents` equals `totalSpendCents`); `avgCostCents` is the card's average
  (D14); `share` is 1, or 0 when the spend is 0.

### 2.6 Top High-Cost Models (D20, D36, D39)

- **A model** is the `model_number` of a live bleacher with surrounding spaces trimmed. A bleacher
  with an empty one has no model and is left out. Equal text is the same model.
- **`hasModelNumbers`** is true when any live bleacher has a model.
- **For a model:** `units` is its live bleachers; `costCents` is the sum of the USD money of the
  live services, in repairs of the period that have a rate, on those bleachers; `repairs` is the
  number of repairs of the period that have a rate and whose list of bleachers (D36) holds one of
  those bleachers.
- **Candidates:** the models with at least one such repair. They are ordered by `costCents`, the
  biggest first, equal ones by name (D39). The first five are the rows, with `rank` 1 to 5 and
  `avgCostCents` as `costCents` over `units`.
- **The total ("Top 5 Models Total"):** the sums of `units`, `repairs` and `costCents` of the
  rows, and `avgCostCents` as its `costCents` over its `units`. A repair that holds bleachers of
  two models counts in both rows, as in the sheet. With no row, the total is `null`.
- **What the page shows** (spec 05) is decided from `hasModelNumbers` and the rows: no model
  number at all, model numbers but no row in the period, or rows.

### 2.7 The categories and the chart (D21, D22, D38, R1)

- **The Unassigned row** stands for a service with no category, for the stored category named
  "Unassigned" (compared without case and spaces) and for a repair with no services (R3). It is
  one row; the stored category of that name is not a second row.
- **The other rows:** every active category, and every inactive category that has spend in the
  period.
- **For a row:**
  - `repairs` is the number of repairs of the period that have a rate and have at least one live
    service in the category. A repair with services in two categories counts in both (D21). A repair
    with no services counts in Unassigned.
  - `expenseCents` is the sum of the USD money of those services; in Unassigned also the
    `cost_cents` of the repairs with no services, converted whole.
  - `avgCostCents` is `expenseCents` over `repairs`.
  - `share` is `expenseCents` over the sum of `expenseCents` of all rows (R5).
  - `topVendor` is the name of the vendor with the most spend in the row: the sum of the USD
    money of the row's services (and, in Unassigned, of the no-service repairs) that belong to a
    repair with a vendor. It is `null` when no vendor has spend above 0. Equal vendors: by name.
- **The order (D38):** rows with spend above 0 by `expenseCents`, biggest first, equal ones by
  name; then the rows with no spend, by name; the Unassigned row last in every case.
- **The total row:** `repairs` and `expenseCents` are the sums of the rows (a repair in two
  categories counts twice, so the sum can exceed the number of repairs, D21); `avgCostCents` is
  its `expenseCents` over its `repairs`; `share` is 1, or 0 when the sum is 0.
- **The chart (D22)** uses the same rows in the same order and the `expenseCents` of each.

### 2.8 The vendor table (D23, D37, D39)

- **Per vendor,** over the repairs of the period that have a rate and a vendor: `workOrders` is
  their number; `laborCents` and `partsCents` are the sums of `laborUsd` and `partsUsd`;
  `totalCents` is their sum (tax and freight are not in it).
- **A vendor has spend** when its `totalCents` is above 0. Only those are candidates, and only
  those are in the total. A repair with no vendor is in no vendor row and no total.
- **The rows:** the six vendors with the biggest `totalCents`, equal ones by name (D39).
  `share` is `totalCents` over the total of all vendors with spend, not over the six (R5).
- **The total row:** `vendorsWithSpend` is the number of vendors with spend; `workOrders`,
  `laborCents`, `partsCents` and `totalCents` are the sums over all of them, not over the six;
  `share` is 1, or 0 when there is no spend. The six shares therefore add up to less than 1 when
  more than six vendors have spend.

### 2.9 The sync rule for the budgets (D18)

`MaintenanceBudgets` is in `AppSchema.ts` and in no web stream, so today no device has a row.
In `../br_powersync/config/sync_rules.yaml` (branch `q4-sprint4-maintenance`, where the Repairs
rules are), add one query to each of the three streams:

- **Viewer, maintainer and admin:** `SELECT "MaintenanceBudgets".* FROM "MaintenanceBudgets"` with
  the same join and predicates as the `"DamageCategories"` line of that role (`"Users"."is_viewer"`,
  `"Maintainers"."is_active"` through `"Users"`, and `"Users"."is_admin"`), plus the one-line
  comment above it that names this spec, as the Repairs lines do.
- **No other role** gets the table: not the account manager, the accountant or the developer.
- **No column list**, as in the other lines. The line does not join to the row it returns, so it
  adds no bucket per row.

Until the rule is deployed the table is empty on every device, so every year says "Budget not
set": a safe state, not an error. The rows themselves are entered by a developer until a later
spec adds a form (D18).

## 3. Locked contracts

```ts
// src/features/dashboardAnalytics/utils/analyticsTypes.ts
export type RepairStatus =
  | "inbound"
  | "triaged"
  | "waiting_repair"
  | "in_repair"
  | "confirm_repair"
  | "completed";
export type OpenStatus = Exclude<RepairStatus, "completed">;

export type Period = { kind: "year"; year: number } | { kind: "all" };

export type AnalyticsRepair = {
  id: string;
  eventStart: string; // YYYY-MM-DD
  status: RepairStatus;
  currency: "USD" | "CAD";
  zoneId: string | null;
  vendorId: string | null;
  costCents: number; // null in the database is 0 here
};
export type AnalyticsService = {
  id: string;
  repairId: string;
  bleacherId: string;
  categoryId: string | null;
  laborCents: number;
  partsCents: number;
  taxCents: number;
  freightCents: number;
};
export type AnalyticsRepairBleacher = { repairId: string; bleacherId: string };
export type AnalyticsBleacher = { id: string; zoneId: string | null; modelNumber: string | null };
export type AnalyticsZone = { id: string; name: string };
export type AnalyticsVendor = { id: string; name: string };
export type AnalyticsCategory = { id: string; name: string; isActive: boolean };
export type AnalyticsBudget = { year: number; currency: string; amountCents: number };

export type AnalyticsInputs = {
  repairs: AnalyticsRepair[];
  services: AnalyticsService[];
  repairBleachers: AnalyticsRepairBleacher[];
  bleachers: AnalyticsBleacher[];
  zones: AnalyticsZone[];
  vendors: AnalyticsVendor[];
  categories: AnalyticsCategory[];
  budgets: AnalyticsBudget[];
};

export type ZoneRow = {
  zoneId: string | null; // null: Unassigned
  name: string;
  units: number;
  workOrders: number;
  costCents: number;
  avgCostCents: number;
  share: number;
};
export type ZoneTotal = Omit<ZoneRow, "zoneId" | "name">;
export type ModelRow = {
  rank: number;
  model: string;
  units: number;
  avgCostCents: number;
  repairs: number;
  costCents: number;
};
export type ModelTotal = {
  units: number;
  avgCostCents: number;
  repairs: number;
  costCents: number;
};
export type CategoryRow = {
  categoryId: string | null; // null: Unassigned
  name: string;
  repairs: number;
  expenseCents: number;
  avgCostCents: number;
  share: number;
  topVendor: string | null;
};
export type CategoryTotal = {
  repairs: number;
  expenseCents: number;
  avgCostCents: number;
  share: number;
};
export type VendorRow = {
  vendorId: string;
  name: string;
  workOrders: number;
  laborCents: number;
  partsCents: number;
  totalCents: number;
  share: number;
};
export type VendorTotal = {
  vendorsWithSpend: number;
  workOrders: number;
  laborCents: number;
  partsCents: number;
  totalCents: number;
  share: number;
};

export type AnalyticsFigures = {
  period: Period;
  cad: { converted: number; withoutRate: number };
  cards: {
    totalSpendCents: number;
    bleachersTotal: number;
    ready: { ready: number; total: number; ratio: number };
    avgPerBleacherCents: number;
    rangeCents: { min: number; max: number };
    openWorkOrders: { total: number; byStatus: Record<OpenStatus, number> };
    budget: {
      setCents: number | null;
      spentCents: number;
      remainingCents: number | null;
      usedRatio: number | null;
      isOver: boolean;
    };
  };
  zones: { rows: ZoneRow[]; total: ZoneTotal };
  models: { hasModelNumbers: boolean; rows: ModelRow[]; total: ModelTotal | null };
  categories: { rows: CategoryRow[]; total: CategoryTotal };
  vendors: { rows: VendorRow[]; total: VendorTotal };
};

// src/features/dashboardAnalytics/utils/buildAnalytics.ts
export function buildAnalytics(params: {
  inputs: AnalyticsInputs;
  period: Period;
  rateFor: (day: string) => number | null;
}): AnalyticsFigures;

// src/features/dashboardAnalytics/utils/analyticsPeriod.ts
export function analyticsYears(repairs: AnalyticsRepair[], currentYear: number): number[];
export function resolvePeriod(choice: Period, years: number[], currentYear: number): Period;
export function oldestCadDay(repairs: AnalyticsRepair[]): string | null;

// src/features/dashboardAnalytics/hooks/useAnalyticsData.ts
export function useAnalyticsData(): { inputs: AnalyticsInputs; isLoading: boolean };
```

Changing a type or a signature needs a new "Approved". File names are free.

## 4. Edge cases and errors

- **No repair at all, or none in the period:** every sum is 0, every ratio 0, the zone and category
  tables still list their rows (D19, D21), the model rows and the vendor rows are empty, the open
  work orders are 0, and Bleachers Ready still counts today's bleachers (D16).
- **No bleacher:** `bleachersTotal` is 0, the average is 0, the range is 0 to 0, Bleachers Ready is
  0 of 0 with ratio 0.
- **A CAD repair with no rate:** left out of every figure and counted in `cad.withoutRate` (R4).
  It still blocks its bleachers in Bleachers Ready (readiness has nothing to do with money), and
  it still counts in the list of years.
- **A repair with services on bleachers that are not in its list, or the reverse:** the list
  decides which bleachers a repair holds (D36); the services decide the money of a bleacher. They
  differ only for a moment after a deletion.
- **A service whose category is missing from the categories** (a removed row): it goes to
  Unassigned.
- **A repair whose zone or vendor is missing from the lists:** the zone goes to Unassigned; a repair
  with an unknown vendor is treated as having no vendor.
- **A budget row twice:** impossible (the pair year and currency is unique).
- **A repair in a year with no budget row:** "not set".
- **A model typed two ways** ("TSP15-450" and "tsp15-450"): two models; the rule is the stored
  text, trimmed.
- **Offline, or PowerSync not connected:** the queries read the local database, so the numbers
  show what the device has; the rates come from spec 03's memory. Nothing here calls the network.
- **Clerk and sync errors:** not handled here. A role without the synced tables reads empty
  results, and the zero rules above apply.
- **Tables still loading:** `isLoading` is true until all eight queries answer; the page shows its
  loading state (spec 05).

## 5. Tests (written first, red then green)

**Vitest** (`npm run test`), with a fixture builder `analyticsFixture.ts` that makes the inputs of
§3 in a few lines, as `repairRowFixture.ts` does for the Repairs list:

- **`analyticsPeriod.test.ts`:** the years (distinct, plus the current one, newest first, deleted
  repairs absent); `resolvePeriod` for All time, a listed year and an unlisted year; `oldestCadDay`
  with no CAD repair, one, and several.
- **`buildAnalytics` cards:** the total spend with USD and CAD repairs (C$100.00 at 0.7 is $70.00;
  a CAD repair converted whole, not by services, so the cents of a rounding case differ from the
  per-service sum by the expected cent); a repair of every status counts in the spend (D12); a
  year filters by the first four digits of `event_start`; Bleachers Ready ignores the year, counts
  a bleacher in two open repairs once, ignores a completed repair, ignores a deleted bleacher, and
  is blocked by a CAD repair with no rate; the average and the range (a bleacher with no service is
  0; a service on a deleted bleacher is not in the range); open work orders by the five statuses
  and the year; the budget for a year, a missing year, an amount of 0 (D40), a CAD row ignored,
  All time as the sum, over-budget, remaining negative.
- **`buildAnalytics` zones:** every zone listed with zeros; the natural order (Zone 2 before Zone
  10); a repair counts for its own zone and not the bleachers' zones; a repair with no zone and a
  bleacher with no zone go to Unassigned; the rows' costs add up to the total; the total row.
- **`buildAnalytics` models:** no model number gives `hasModelNumbers` false; a trimmed model; the
  top five by cost; a tie by name (D39); a model with no repair in the period is not a row; the
  repairs counted through the list of bleachers, the cost through the services; the total row; a
  repair with two models counts in both.
- **`buildAnalytics` categories:** active categories with no spend are listed; an inactive one
  only with spend; the stored "Unassigned" and a service with no category are one row; a repair
  with no services lands in Unassigned with its `cost_cents`; a repair with two categories counts
  in both and the total shows it; the order of D38 and the tie of R1; `topVendor` including a
  dash for none; the shares.
- **`buildAnalytics` vendors:** Labor and Parts per repair converted whole; tax and freight left
  out; a repair with no vendor left out; the top six by Labor + Parts, a tie by name; the total over
  all vendors with spend and the shares of the six adding up to less than 1; `vendorsWithSpend`.
- **`buildAnalytics` reconciliation:** the zone costs equal the total spend; the vendor total is at
  most the total spend; the category total is within a few cents of the total spend when every
  repair has services (R2).
- **`analyticsQueries.test.ts`:** each compiled query selects the columns of its row type, filters
  on `deleted = 0` where §2.1 says, and uses no `db.fn` (the same style as
  `repairListQueries.test.ts`).
- **`useAnalyticsData.test.ts`:** `isLoading` until all eight answer; nulls become the safe values;
  the inputs reach the shape of §3.

**SQL/sync check** for §2.9 (not Vitest; the checks of `repairs-02-sync-rules.md` §3):

- **Compile** the file with the service's own library (`SqlSyncRules.fromYaml`, schema `public`,
  `throwOnError: false`) inside the container `br_powersync-powersync-1`: 0 errors. If no
  container runs, start the service from `../br_powersync` or report the step as not run.
- **Buckets:** the web data sources that have bucket parameters, before and after: the count must
  not grow.
- **Tables per role:** only `MaintenanceBudgets` is added, to viewer, maintainer and admin.
- **No column lists** in the three new lines.

**Playwright:** none, nothing is visible. The report marks it SKIPPED with that reason.

## 6. Files

New, in `src/features/dashboardAnalytics/`:

- `utils/analyticsTypes.ts`.
- `utils/buildAnalytics.ts` and `buildAnalytics.test.ts` (it may be split into one file per block,
  with its test, when it grows; the exported signature stays).
- `utils/analyticsPeriod.ts` and `analyticsPeriod.test.ts`.
- `utils/analyticsFixture.ts` (test helper).
- `db/analyticsQueries.ts` and `analyticsQueries.test.ts`.
- `hooks/useAnalyticsData.ts` and `useAnalyticsData.test.ts`.

Changed in `../br_powersync`: `config/sync_rules.yaml` (three queries and three comments). It is
committed there on the user's word only, and not deployed by this spec.

Not changed: the database, `AppSchema.ts` (the table is already there), the permissions matrix
(nothing is shown yet), the Repairs page.

## 7. Definition of done

- Every test of §5 written first, seen red, then green; the sync checks run, with the real output.
- `npm run tc`, `npm run test` pass; `npx prettier --check` on the touched files is clean (format
  only the touched files).
- Playwright not written, SKIPPED with the reason of §5.
- The final report of CLAUDE.md, with the real tail of each command.
- The user's "Approved" on this spec before any code; a commit only when the user asks.
