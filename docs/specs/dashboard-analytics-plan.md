# Dashboard & Analytics page: plan

Status: **APPROVED 2026-11-25** (0 open decisions in the plan; every spec of the series asks its
own questions before it is written). Spec 01 (the design) is approved; specs 02 to 05 are written
and await "Approved" (§2). Page: `/dashboard-analytics`.
Branch: `q4-sprint4-maintenance-dashboard`.

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

## 1. The page, block by block (from the sheet and D1 to D24)

Words used below. **Period:** the chosen year, or All time. **Live:** not deleted. **Spend of a
repair:** labor + parts + tax + freight of its services (its stored total when it has none), in
USD at the rate of its Repair from day. **Bleachers:** D13.

- **The five cards, in the sheet's order.**
  - **Total Fleet Maintenance Spend:** the spend of every live repair of the period.
  - **Bleachers Ready** (the sheet's Operational Readiness Rate, named so in spec 01): D16.
  - **Avg Maint Spend / Bleacher:** D14. Its caption is the least and the greatest spend of one
    bleacher in the period, as the sheet's "Range".
  - **Active Open Work Orders:** D17.
  - **Annual Budget Utilization:** D18.
- **Operating Zone Cost & Fleet Maintenance Cost:** D19. Columns: Assigned Units, Total Work
  Orders (the repairs of the zone), Total Maintenance Cost, Average Cost / Unit, % of Total Spend.
- **Top High-Cost Models:** D20. Columns: Rank, Model, Assigned Units, Avg Cost / Unit, Repairs,
  Cost. The cost of a model is the spend of the services on its bleachers.
- **Unit Damage Category & Expense Breakdown:** D21 and D22. Columns: Number of Repairs, Total
  Expense, Avg Cost / Job, % Fleet Spend, Largest Spend Vendor (the vendor with the most spend in
  that category; a dash when none).
- **Service Vendor Repair & Parts Cost Breakdown:** D23. Columns: Work Orders (the repairs of the
  vendor), Labor Cost, Parts Cost, Total Labor & Parts Spend, % Labor & Parts.
- **Notes and warnings:** the CAD note (D10) and the no-rate line (D9). The year selector (D11)
  sits in the page header.
- **Words and layout.** The labels follow the sheet; the arrangement, the texts, the colours and
  the empty and error states are drawn in spec 01 and corrected there.

## 2. The specs

Five are planned. Each is its own logic, its own "Approved" and its own commit. A page spec is
written only after the design is approved, and only after its questions are answered. Under each
spec is what it must settle; these are questions, not decisions.

**State (2026-11-25).** Spec 01 is approved (D25 to D28). Specs 02 to 05 were written after the
user answered their questions, and each awaits "Approved":

- **02:** `dashboard-analytics-02-access-shell.md`, decisions D29 to D31.
- **03:** `dashboard-analytics-03-converter.md`, decisions D32 to D35.
- **04:** `dashboard-analytics-04-data-numbers.md`, decisions D36 to D40.
- **05:** `dashboard-analytics-05-page.md`, decisions D41 and D42.

The questions listed under each spec below are the ones that were asked; the answers are the
decisions of that spec.

- **01, the design:** `dashboard-analytics-01-design.md` and the boards in
  `docs/design/dashboard-analytics/`. No app code.
  - Settled in the spec (D25 to D28): the arrangement of the blocks, the page title, the name of
    the card Bleachers Ready (Sam does not like "Operational Readiness Rate") and the period
    control. Drawn and corrected on the canvas: the red of an over-spent budget, the colours of
    the chart and the texts of every empty and warning state.
- **02, access and shell:** the segment rule of D2, the paths of the three roles, the sidebar
  item, the route with an empty page titled "Dashboard & Analytics", the row of the permissions
  matrix, Vitest tests of the path rule and the sidebar, Playwright scenarios by role.
  - What the empty page shows until spec 05.
- **03, the converter:** the Frankfurter client, the browser's memory of the days it received,
  the lookup of a rate by day with the carry-forward of D6 and D9, the conversion of cents, the
  state "no rate at all". Pure functions and one hook; nothing visible.
  - Where the browser keeps the days, how a range is asked for (from the oldest CAD repair to
    today, and in how many requests), the time limit of a request, and how cents are rounded.
- **04, the data and the numbers:** the local queries and the pure functions that turn them into
  every figure of §1, the year logic, and the sync rule for `MaintenanceBudgets` in
  `../br_powersync`. Nothing visible.
  - Which source says that a bleacher is in a repair (the repair's list of bleachers or its
    services), how a repair with no services is counted, the order of equal values in the
    rankings, and whether a repair is converted as a whole or service by service.
- **05, the page:** the cards, the four tables, the chart, the year selector, the notes and
  warnings, the loading and empty states, the matrix text, and the Playwright scenarios.
  - Anything the drawing of spec 01 does not settle.

## 3. Order and one rule to keep

- **Order:** 01, 02, 03, 04, then 05. Spec 04 needs the converter of 03; spec 05 needs 04. Spec
  02 needs nothing and can go at any point after 01.
- **The permissions matrix.** CLAUDE.md says `permissionPageData.ts` is updated in the same commit
  as the change that alters what a role can do. Spec 02 changes who can open the page, so it adds
  the row "Dashboard & Analytics" (read for admin, viewer and maintainer, none for the rest).
  Spec 05 is the first screen that shows costs, vendors and budgets, and it rewrites the text of
  the row. Specs 03 and 04 move data that no screen shows yet and carry no row.

## 4. Out of the series

The form that sets the yearly budget, the field "Model Number" and the asset value on the Assets
page (the "Bleacher Inventory" tab), a pace line on the budget, links from rows to the Repairs
page, the sheet's line "Maintenance Tracked as of", CAD budget rows, a USD total on the Repairs
page (its strip stays CAD and USD), the Vendors page, the Driver Parts Tracker and GPS Trackers
tabs of the sheet, the driver's hourly maintenance rate, the driver app, and a server-side gate
by role (as no page has one today).
