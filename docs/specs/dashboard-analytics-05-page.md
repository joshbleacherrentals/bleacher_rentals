# Dashboard & Analytics 05: the page

Status: **DRAFT 2026-11-25, awaiting "Approved"** (2 decisions of the user in this spec, D41 and
D42; 0 open decisions; nothing built, nothing committed). Build order: **05 of 5**. Needs:
[dashboard-analytics-01-design.md](dashboard-analytics-01-design.md) (the canvas, approved
2026-11-25), [dashboard-analytics-02-access-shell.md](dashboard-analytics-02-access-shell.md) (the
route and the empty page this spec fills),
[dashboard-analytics-03-converter.md](dashboard-analytics-03-converter.md) (the rates) and
[dashboard-analytics-04-data-numbers.md](dashboard-analytics-04-data-numbers.md) (the figures).
Needed by: nothing. Branch: `q4-sprint4-maintenance-dashboard`.
Scope: the page itself: the header and the period dropdown, the notes and warnings, the five
cards, the four tables, the chart, the loading and empty states, the rewritten text of the matrix
row, and the tests. It draws exactly what the canvas shows.

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

- **D41:** the tables cannot be sorted. A column header is plain text, as in the sheet, and the
  rows keep the order the figures give them (spec 04).
- **D42:** the chart has no hover tooltip. The value is written above each bar, as drawn.

**Rules that follow from the decisions and the canvas (no new choice).**

- **R1:** every string of §2 is the one the canvas shows (spec 01 §2), copied letter for letter.
  Where the canvas drew a year, a text for All time is written the same way (§2.9, the words
  marked "not drawn").
- **R2:** the pixels (spacing, sizes, the widths of the columns) are those of the board files in
  `docs/design/dashboard-analytics/`, mainly `Main.dc.html`, and of the visual rules in spec 01 §3.
  Where the text of a spec and the board differ, the board wins.
- **R3:** the period dropdown is the app's own `DropdownMenu` with a radio group
  (`src/components/ui/dropdown-menu.tsx`): its keyboard behaviour (arrows, Enter, Escape, type to
  find) and its focus ring come with it. No new package is added.
- **R4:** the chart is drawn with Recharts, which the app already has, and nothing else is added.

## 1. What this spec delivers

- **`DashboardAnalyticsPage`** (the shell of spec 02, filled): header, period dropdown, notes,
  cards, tables, chart, loading and empty states.
- **The helpers** for formats and the chart scale (§3).
- **The rewritten text** of the matrix row "Dashboard & Analytics" (§5).
- **Vitest tests** and **Playwright scenarios** (written, not run).

## 2. Behaviour

### 2.1 How the page is put together

`DashboardAnalyticsPage` is a client component. It reads:

- **The data:** `useAnalyticsData()` (spec 04): `inputs` and `isLoading`.
- **The day:** `today` is the calendar day in the app time zone (`useTimezoneStore`, taken with
  `dayInZone` of the Repairs utilities), and `currentYear` is its first four digits.
- **The rates:** `useCadUsdRates({ oldestCadDay: oldestCadDay(inputs.repairs), today })`
  (specs 03 and 04): `status` and `rateFor`.
- **The period:** React state `choice`, which starts as the current year every time the page opens
  (D11: not remembered, not in the address). `years` is the result of `analyticsYears` over
  `inputs.repairs` and `currentYear`, and `period` is `resolvePeriod(choice, years, currentYear)`.
- **The figures:** `buildAnalytics({ inputs, period, rateFor })` in a `useMemo`.

It draws the **loading state** (§2.8) while `isLoading` is true or the rates `status` is
`loading`; otherwise the page. The numbers show at once when the browser already remembers rates
(`status` is `ready`), even while newer days are being asked for. The page is reactive: a change
in the local database or a new rate recomputes the figures.

### 2.2 The header (D26, D28)

- **Title:** "Dashboard & Analytics" (`PageHeader`, as the empty page of spec 02 has it).
- **Line under it (D26):** "Maintenance spend, readiness and cost breakdowns across the
  bleachers", in the style of the Repairs header.
- **Period dropdown (D28), at the right:** a button of 40 px with a calendar icon, the label and
  a chevron, as drawn (`aria-label="Period"`). The label is the chosen year, or "All time".
  Opening it lists every year of `years`, newest first, then "All time". The chosen option has a
  tick. Choosing an option sets `choice` and closes the list; Escape and a click outside close it
  without a change. It is the `DropdownMenu` of R3, with one `DropdownMenuRadioItem` per option.

### 2.3 The notes (D9, D10)

Under the header, before the cards. Both can show at once; the grey note comes first.

- **The CAD note (D10),** when `figures.cad.converted` is above 0: a grey line with an info icon:
  "{n} CAD repairs were converted to USD at the Frankfurter (ECB) rate of their Repair from day."
  For one repair: "1 CAD repair was converted to USD at the Frankfurter (ECB) rate of its Repair
  from day."
- **The missing-rate line (D9),** when `figures.cad.withoutRate` is above 0: an amber block with a
  warning icon: "{n} CAD repairs have no exchange rate yet and are not counted. Open the page
  again when you are online." For one repair: "1 CAD repair has no exchange rate yet and is not
  counted. Open the page again when you are online."
- **None,** when the period has no CAD repair.

### 2.4 The five cards (D14 to D18, D27)

Money is written `$1,234.56` (a minus before the dollar sign: `-$4,946.00`); "whole dollars" is
`$1,234`. Percents have one decimal: `19.5%`.

- **Total Fleet Maintenance Spend:** the value is `totalSpendCents` with cents. The line under
  it is "{year} spend across {bleachersTotal} bleachers", and for All time "All-time spend across
  {bleachersTotal} bleachers".
- **Bleachers Ready (D27):** the value is the ratio as a percent; the line under it is "{ready} of
  {total} ready to go". It never changes with the period (D16).
- **Avg Maint Spend / Bleacher:** the value is `avgPerBleacherCents` with cents; the line is
  "Range: {min} – {max}" in whole dollars, with an en dash.
- **Active Open Work Orders:** the value is `openWorkOrders.total`. The line is "No open
  repairs" when it is 0; otherwise "Inbound {n} | Triaged {n} | Waiting repair {n} | In repair
  {n} | Confirm repair {n}", all five always, zeros included.
- **Annual Budget Utilization (D18, D40):**
  - **Budget set:** the value is `usedRatio` as a percent; under it a bar filled to `usedRatio`
    (never wider than the bar); then "Spent: {spent} | Remaining: {remaining}" in whole dollars;
    then "Budget {year}: {budget}", or "Budgets of all years: {budget}" for All time.
  - **Over the budget** (`isOver`): the value and the two lines are red (`#b91c1c`), the bar is full
    and red (`#dc2626`), and a badge "Over budget" sits beside the card name. Remaining is
    negative, as in the sheet. The words, not the colour alone, say it.
  - **Not set:** the value is "—", the bar is empty, the first line is "Budget not set" and the
    second is "No budget is set for {year}" (not drawn for All time: "No budget is set for any
    year").

### 2.5 The tables (D19 to D21, D23, D25, D41)

Each is a white block with a heading, a short grey line beside it, and the table in a box that
scrolls sideways when the screen is narrow (the table is at least 760 px wide). Column headers are
plain text in capitals (D41). Numbers are right-aligned with tabular digits. The total row is on
`#f9fafb` in bold. Long names wrap inside their cell.

- **Operating Zone Cost & Fleet Maintenance Cost.** Grey line: "Repairs with no zone are counted in
  Unassigned". Columns: Operating Zone, Assigned Units, Total Work Orders, Total Maintenance Cost,
  Average Cost / Unit, % of Total Spend. Rows: `zones.rows`; last row "Total / Fleet Summary".
- **Top High-Cost Models.** Grey line: "The five models with the highest maintenance cost".
  Columns: Rank (written `#1`), Model, Assigned Units, Avg Cost / Unit, Repairs, Cost. Rows:
  `models.rows`; last row "Top 5 Models Total" with an empty Rank cell. The block has three
  states, from `models`:
  - **No model number on any bleacher:** the title "No model numbers yet" and under it "This block
    fills in once model numbers are set on the bleachers."
  - **Model numbers, no repair in the period:** "No repairs in {year}" (All time: "No repairs
    yet", not drawn) and "Models with maintenance cost will appear here."
  - **Rows:** the table.
- **Unit Damage Category & Expense Breakdown.** Grey line: "A repair with two categories counts in
  both". Columns: Failure Category, Number of Repairs, Total Expense, Avg Cost / Job, % Fleet
  Spend, Largest Spend Vendor (left-aligned; a dash when `topVendor` is null). Rows:
  `categories.rows`; last row "Total Category Spend" with an empty vendor cell. Every row is
  listed, also with zeros (D21).
- **Service Vendor Repair & Parts Cost Breakdown.** Grey line, when there is spend: "Top 6 of
  {vendorsWithSpend} vendors by Labor + Parts. Tax and freight are not included. Repairs with no
  vendor are not listed."; with no spend: "Top 6 vendors by Labor + Parts". Columns: Service
  Vendor, Work Orders, Labor Cost, Parts Cost, Total Labor & Parts Spend, % Labor & Parts. Rows:
  `vendors.rows`; last row "Total Labor & Parts Spend, all {vendorsWithSpend} vendors". With no
  vendor spend the block says "No vendor spend in {year}." (All time: "No vendor spend yet.", not
  drawn).

### 2.6 The chart (D22, D42)

The block "Maintenance Spend by Category", grey line "Total expense per damage category, USD".

- **Data:** `categories.rows` in their order, one dark blue (`#10365a`) column of `expenseCents`
  per category. Same rows as the table above it.
- **Value:** written above each column in whole dollars (`$11,206`), also `$0`. No tooltip (D42).
- **Scale:** light grid lines (`#e5e7eb`) at round values and a vertical axis labelled `$0`, `$5k`,
  `$10k`... The scale is `chartScale(maxCents)` (§3): the step is the first of 500, 1000, 2000,
  2500, 5000, 10000, 20000, 25000, 50000, 100000 dollars for which the greatest column divided by
  the step is at most 4 (the last one if none); the top of the axis is the greater of the step
  and the greatest column rounded up to a whole number of steps; the ticks are 0, step, 2 steps up
  to the top. A tick of 1000 or more is `$` plus thousands plus `k` (`$2.5k`).
- **Under the columns:** the category names; under them the axis title "Damage category".
- **No animation.** The chart has an `aria-label` that gives its title; the table above is the
  accessible form of its data.
- **No spend** (the greatest column is 0): no chart, and the text "No spend to show for {year}."
  (All time: "No spend to show yet.", not drawn).

### 2.7 The period

The dropdown of §2.2 is the only control. Choosing a period recomputes everything except
Bleachers Ready (D11, D16). The choice lives in React state only: opening the page again starts on
the current year. If the chosen year stops being in the list while the page is open (its last
repair was deleted), `resolvePeriod` moves the page to the current year.

### 2.8 The loading state

While the page is loading it shows the header (with the dropdown), the line "Reading repairs and
exchange rates" with a spinner icon, five grey cards in a row and five grey blocks of the size of
the blocks, as drawn (`aria-busy="true"`). It lasts until the eight local queries have answered
and, when the browser remembers no rate and a CAD repair exists, until the rates answered or the
10 seconds of spec 03 passed.

### 2.9 Words not drawn

The canvas drew every text for a year. For All time (and nowhere else) these are written the same
way: "No repairs yet", "No spend to show yet.", "No vendor spend yet." and "No budget is set for
any year". They appear only when All time holds no repair, no spend, no vendor spend or no
budget.

### 2.10 Narrow screens

The five cards share the row and wrap when the screen is narrow; the tables scroll sideways in
their boxes; the chart keeps its height and shrinks in width. The canvas is 1440 px wide.

## 3. Locked contracts

```ts
// src/features/dashboardAnalytics/components/DashboardAnalyticsPage.tsx
export default function DashboardAnalyticsPage(): React.JSX.Element;

// src/features/dashboardAnalytics/utils/analyticsFormat.ts
export function formatUsd(cents: number): string; // 123456 -> "$1,234.56"; -494600 -> "-$4,946.00"
export function formatUsdWhole(cents: number): string; // 123456 -> "$1,235" (rounded to a whole dollar)
export function formatPercent(ratio: number): string; // 0.195 -> "19.5%"; 1.145 -> "114.5%"; 0 -> "0.0%"

// src/features/dashboardAnalytics/utils/chartScale.ts
export function chartScale(maxCents: number): { topDollars: number; ticks: number[] };
export function formatTick(dollars: number): string; // 0 -> "$0"; 500 -> "$500"; 2500 -> "$2.5k"; 15000 -> "$15k"
```

`formatPercent` is `(Math.round(ratio * 1000) / 10).toFixed(1)` and "%". `formatUsdWhole` rounds
half up. Changing a signature needs a new "Approved". Component and file names under it are free.

## 4. Edge cases and errors

- **No repair at all:** the cards say $0.00, 0.0%, "No open repairs"; Bleachers Ready still counts
  today's bleachers; the zone and category tables list their rows with zeros; the models, chart and
  vendor blocks show their empty texts (the "EmptyYear" board).
- **A year with no budget row:** "Budget not set" (the "NoBudget" board). A budget of $0 looks
  the same (D40).
- **Spend over the budget:** the red card (the "OverBudget" board).
- **No exchange rate and no internet on the first visit:** the page shows everything except the
  CAD repairs and the amber line (the "NoRate" board); the line says how many were left out.
- **Rates arrive after the first paint** (stale memory): the numbers update by the few days that
  were carried forward before; the page does not go back to loading.
- **A CAD repair older than any rate:** left out and counted in the amber line.
- **The chosen year disappears:** back to the current year (§2.7).
- **Role changes or a deactivated user while the page is open:** handled by the access hook of the
  shell (spec 02), not here.
- **Offline or PowerSync not connected:** the figures come from the local database and the memory of
  rates; nothing here needs the network except the rate request, whose failure is the amber line.
- **Clerk errors:** none are specific to this page; the session is handled by the shell.
- **Slow or unfinished first sync of a new device:** the queries answer with what the device has, as
  on the Repairs page; the numbers grow as the data arrives.
- **A very long vendor, category or model name:** wraps in its cell.

## 5. The permissions matrix (the same commit, CLAUDE.md)

Spec 02 added the row "Dashboard & Analytics" with a text that names the purpose of the page. Now
that the page shows figures, this spec rewrites the description and the notes of the same row in
`src/features/userAccess/permissionPageData.ts` (the levels do not change: `read` for admin,
viewer and maintainer, `none` for the rest).

- **Description:** "The Dashboard & Analytics page, in the Quality Assurance menu. It adds up what
  the fleet's repairs cost, in US dollars (a repair paid in Canadian dollars is converted at the
  exchange rate of the day it starts), for a year or for all time: the total spend, the share of
  bleachers that are not in an open repair, the average spend per bleacher, the open repairs by
  status and how much of the yearly budget is used; the cost by operating zone, by bleacher model
  and by damage category, with a chart; and the six vendors with the most labor and parts spend.
  Everything on the page is read only."
- **Administrator, viewer, maintainer (`read`):** "Opens the page and reads every figure on it,
  vendors and budget included. Nothing on it can be changed."
- **Account manager, developer, driver, accountant (`none`):** the notes of spec 02, unchanged.

## 6. Tests (written first, red then green)

**Vitest** (`npm run test`):

- **`analyticsFormat.test.ts`:** `formatUsd` (cents, grouping, a negative, zero), `formatUsdWhole`
  (a half rounds up), `formatPercent` (one decimal, over 100%, zero).
- **`chartScale.test.ts`:** the step rule on the examples (a greatest column of $11,206.35 gives
  the step 5000 and the ticks 0, 5000, 10000, 15000; $480 gives 500 steps up to $500; $900,000 uses
  the step 100000), a zero maximum, and `formatTick` (`$0`, `$500`, `$2.5k`, `$15k`).
- **`DashboardAnalyticsPage.test.tsx`** (React Testing Library, `useAnalyticsData`,
  `useCadUsdRates` and the timezone store mocked, `buildAnalytics` real over an
  `analyticsFixture`): the title and the line under it; the five cards with their captions
  (the sample of spec 01: 141 of 144, the Range line, the five statuses, a budget line); All time
  changes the captions ("All-time spend across", "Budgets of all years") and keeps Bleachers
  Ready; the dropdown lists the years newest first and All time, the chosen one is ticked, a
  choice recomputes the cards and closes the list, and the page starts on the current year; the
  four tables with their headers, rows and total rows; the headers are not buttons (D41); the
  chart has no tooltip (D42); the CAD note, singular and plural; the amber line, singular and
  plural; both together; the over-budget card (red, "Over budget", negative remaining) and the
  not-set card ("—", "Budget not set"); the three states of the models block; the empty year (the
  empty texts, the zero rows); the loading state while `isLoading` or while the rates are loading;
  the numbers shown at once when the rates are `ready`.
- **`permissionPageData.test.ts`** (extended): the row's description names the six blocks and
  says it is read only; the levels are as in §5.

**Playwright** (written, not run; the report marks it SKIPPED). Files in
`src/features/dashboardAnalytics/e2e/` with a helper that seeds repairs, services and, for S12,
a `MaintenanceBudgets` row through the service role, as `helpers/repairsFixtures` of the Repairs
series does, and removes them afterwards. The Frankfurter calls are answered with `page.route`
so no test reaches the real API.

- **S6** (`dashboardAnalytics.admin.spec.ts`): with seeded USD repairs the page shows the five
  cards, the four tables and the chart, and the total spend card equals the seeded amounts of the
  current year; the caption names the number of bleachers.
- **S7** (admin): the dropdown lists the current year, the seeded earlier year and All time;
  choosing the earlier year changes the total and the caption; All time shows the sum of both.
- **S8** (admin): a seeded repair in an open status holds a bleacher; Bleachers Ready is one lower
  than before and does not move when the period changes; after the repair is set to Completed it
  is back.
- **S9** (admin): a seeded CAD repair with the API answered at a fixed rate is converted
  (total equals the USD repair plus the converted CAD amount to the cent), and the CAD note says
  "1 CAD repair was converted…".
- **S10** (admin): the API call is aborted and nothing is remembered: the amber line says 1 CAD
  repair has no rate and the total leaves it out.
- **S11** (`dashboardAnalytics.viewer.spec.ts`): a viewer sees the same page, with the period
  dropdown as its only control.
- **S12** (admin): a seeded budget row for the current year makes the card show its percent, and a
  row smaller than the spend shows the red card with "Over budget". This scenario needs the local
  sync service to run the rule of spec 04; without it the card says "Budget not set".
- **S13** (`dashboardAnalytics.maintainer.spec.ts`): a maintainer sees the same page as S11. It
  joins the run once `E2E_MAINTAINER_EMAIL` exists.

## 7. Files

New, in `src/features/dashboardAnalytics/`:

- `components/` for the blocks (`AnalyticsHeader`, `PeriodDropdown`, `AnalyticsNotes`,
  `AnalyticsCards`, `ZonesTable`, `ModelsTable`, `CategoriesTable`, `CategoryChart`,
  `VendorsTable`, `AnalyticsSkeleton`, each with a test when it holds logic); the names are free.
- `utils/analyticsFormat.ts`, `utils/chartScale.ts` and their tests.
- `e2e/dashboardAnalytics.{admin,viewer,maintainer}.spec.ts` and an e2e helper for the seeds.

Changed:

- `components/DashboardAnalyticsPage.tsx` (spec 02's shell is filled).
- `src/features/userAccess/permissionPageData.ts` and `permissionPageData.test.ts` (§5).

Not changed: the database, `AppSchema.ts`, the sync rules (spec 04), the access rule and the
sidebar (spec 02), the Repairs page.

## 8. Definition of done

- Every test of §6 written first, seen red, then green.
- `npm run tc`, `npm run test` pass; `npx prettier --check` on the touched files is clean (format
  only the touched files).
- Playwright written and not run: the report says SKIPPED. Claude does not open the page in the
  Claude browser pane (it cannot run PowerSync); the user looks at it in their own browser.
- The final report of CLAUDE.md, with the real tail of each command.
- The user's "Approved" on this spec before any code; a commit only when the user asks.
