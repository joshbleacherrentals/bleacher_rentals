# Dashboard & Analytics 01: the design of the page

Status: **DRAFT 2026-11-25, awaiting "Approved"** (design only, nothing to build, uncommitted; 0 open
decisions). Build order: **01 of 5**. Needs: [dashboard-analytics-plan.md](dashboard-analytics-plan.md)
(approved). Needed by: 02 to 05. Branch: `q4-sprint4-maintenance-dashboard`.
Scope: **the design only**. No app code, no tests, no permissions row. The deliverable is the canvas
in `docs/design/dashboard-analytics/` and this text.

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

**Decisions of this spec (user, 2026-11-25).**

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

**Drawn, not asked (as in the Repairs design): corrected on the canvas.** The look of the over-spent
budget, the colours of the chart, the line under the title and the texts of the empty and warning
states.

## 1. What this spec delivers

- **The canvas** `docs/design/dashboard-analytics/` (nine boards, §2) and its README, and the
  published copy https://claude.ai/artifact/KV8ojwavxA5HB1ibuzgMpg (private).
- **This text**, which fixes what the canvas shows, so the later specs can build from it.
- **Nothing else.** `npm run test`, `npm run tc` and Playwright are not touched by this spec.

The user approves the design with "Approved" on this spec. A change to the canvas after that needs a
new "Approved", and the specs that depend on the changed board are updated first.

## 2. The boards

All boards are 1440 px wide. The figures are samples: the 144 bleachers and the eight zones are the
local database's; categories, vendors and model numbers follow the spreadsheet. `Main` computes every
sum and percent from its sample rows, so the cards, the tables and the chart agree. 2025 and All time
are the 2026 rows times 3 and times 5.

**1 `Main`: the page for 2026.**

- **Header (D26, D28):** the title, the line under it, and the period dropdown at the right
  ("2026").
- **CAD note (D10):** a grey line with an info icon: "4 CAD repairs were converted to USD at the
  Frankfurter (ECB) rate of their Repair from day."
- **Five cards, in a row (D16 to D18):**
  - **Total Fleet Maintenance Spend:** $38,946.12, "2026 spend across 144 bleachers".
  - **Bleachers Ready:** 97.9%, "141 of 144 ready to go".
  - **Avg Maint Spend / Bleacher:** $270.46, "Range: $0 – $3,120".
  - **Active Open Work Orders:** 7, "Inbound 2 | Triaged 1 | Waiting repair 1 | In repair 2 | Confirm
    repair 1".
  - **Annual Budget Utilization:** 19.5% with a bar, "Spent: $38,946 | Remaining: $161,054" and
    "Budget 2026: $200,000".
- **Zones (D19):** a table with a row for each of Zone 1 to Zone 8 and Unassigned, and a Total /
  Fleet Summary row. Columns: Operating Zone, Assigned Units, Total Work Orders, Total Maintenance
  Cost, Average Cost / Unit, % of Total Spend. Zone 8 has 0 units and $0.00.
- **Top High-Cost Models (D20):** Rank, Model, Assigned Units, Avg Cost / Unit, Repairs, Cost; five
  rows and a Top 5 Models Total row.
- **Categories (D21):** Failure Category, Number of Repairs, Total Expense, Avg Cost / Job, % Fleet
  Spend, Largest Spend Vendor; nine rows (Unassigned is the last, its vendor a dash) and a Total
  Category Spend row. The count column adds up to 30 against 27 work orders in the zones table,
  because a repair with two categories counts in both (D21).
- **Chart (D22):** nine navy columns of Total Expense per category, light grid lines and a round
  vertical scale, the value above each column and the category under it.
- **Vendors (D23):** six rows by Labor + Parts, then a total row over all eight vendors that have
  spend, so the six percents add up to less than 100%. The note at the right of the title says "Top 6
  of 8 vendors by Labor + Parts. Tax and freight are not included. Repairs with no vendor are not
  listed."
- **Interactive:** the dropdown switches 2026, 2025 and All time, and every figure follows.

**2 `AllTime`:** All time. The caption says "All-time spend across 144 bleachers"; the budget card
shows 55.6% and "Budgets of all years: $350,000" (D18). Bleachers Ready is unchanged (D16).

**3 `YearMenu`:** the dropdown open: 2026 (ticked), 2025, All time.

**4 `OverBudget`:** the budget is $34,000 and the spend is over it: 114.5% in red, a full red bar,
the pill "Over budget", and "Spent: $38,946 | Remaining: -$4,946" in red (the sheet's own formula
gives a negative remainder).

**5 `NoBudget`:** the budget card shows a dash, "Budget not set" and "No budget is set for 2026"
(D18).

**6 `NoModels`:** the Top High-Cost Models block says "No model numbers yet" and "This block fills in
once model numbers are set on the bleachers." (D20).

**7 `NoRate`:** the CAD note is replaced by an amber line: "3 CAD repairs have no exchange rate yet
and are not counted. Open the page again when you are online." (D9).

**8 `EmptyYear`:** a year with no repairs. The cards show $0.00, 0.0% and "No open repairs", while
Bleachers Ready still shows 141 of 144 (D16). The zones and categories tables still list every row
with zeros (D19, D21). The models block says "No repairs in 2026", the chart "No spend to show for
2026.", the vendors block "No vendor spend in 2026."

**9 `Loading`:** the header, the line "Reading repairs and exchange rates", five grey cards and five
grey blocks.

## 3. The visual rules the canvas uses

These are drawn choices, not options; they are corrected on the canvas.

- **Look:** the app's own look: Geist, the brand navy `#10365a` for the title, the card values, the
  bars and the column fills, the Tailwind greys, and white blocks with a 1 px `#e5e7eb` border and a
  10 px radius, as the totals strip of the Repairs page. Text contrast is 4.5:1 or better.
- **Cards:** an uppercase 12 px label, a 28 px value, a 13 px grey caption. Five cards share the row
  and wrap when the screen is narrow.
- **Tables:** a header row on `#f9fafb` with uppercase 12 px labels; numbers right-aligned with tabular
  digits; the Total row on `#f9fafb` in bold.
- **Money:** all USD with a `$` sign: cents in the cards and tables, whole dollars in captions and
  chart labels. There is no `C$` on this page.
- **Over budget:** red `#b91c1c` for the value and the caption, `#dc2626` for the bar, and the pill
  "Over budget". The word is printed, so colour is never the only signal.
- **Notices:** the CAD note is a quiet grey line; the missing-rate line is an amber callout (`#fffbeb`
  fill, `#92400e` ink).
- **Empty states:** one centred grey line inside the block.
- **Loading:** grey bars of the same size as the cards and the blocks.

## 4. Not drawn, and left to the later specs

- **Narrow screens:** the cards wrap and the tables scroll sideways in their boxes; not drawn.
- **The period dropdown's keyboard behaviour and focus ring:** spec 05.
- **Views for other roles:** admin, viewer and maintainer see the same read-only page; nothing to draw.
- **When the missing-rate line appears and what else can fail with the rate service:** spec 03.
- **What the empty page of spec 02 shows, and the text of the permissions row:** specs 02 and 05.

## 5. Files

- `docs/design/dashboard-analytics/canvas.json` and the nine `.dc.html` files (new).
- `docs/design/dashboard-analytics/README.md` (new).
- `docs/specs/dashboard-analytics-plan.md` (the card's name and the status) and this spec (new), and
  their Ukrainian copies as artifacts (not committed).

## 6. Definition of done

- The user has looked at the canvas and written "Approved".
- `npx prettier --check` on `docs/design/dashboard-analytics/README.md`,
  `docs/specs/dashboard-analytics-plan.md` and this spec is clean (the `.dc.html` files and
  `canvas.json` are skipped by `.prettierignore`).
- `npm run tc`, `npm run test` and Playwright: SKIPPED, because no code changes.
