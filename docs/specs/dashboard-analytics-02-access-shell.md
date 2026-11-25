# Dashboard & Analytics 02: access and the empty page

Status: **APPROVED and IMPLEMENTED 2026-11-25** (3 decisions of the user in this spec, D29 to
D31; 0 open decisions; built, not committed). Build order: **02 of 5**. Needs:
[dashboard-analytics-01-design.md](dashboard-analytics-01-design.md) (approved 2026-11-25). Needed
by: 05, which fills the empty page this spec makes. Specs 03 and 04 do not need it and it does not
need them. Branch: `q4-sprint4-maintenance-dashboard`.
Scope: who can open `/dashboard-analytics`, the item in the sidebar, the route with an empty page,
the row of the permissions matrix and the tests. No database change, no sync change, no figures.

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

- **D29:** the item "Dashboard & Analytics" is the first child of the Quality Assurance dropdown,
  above Damage Reports. The dropdown then reads: Dashboard & Analytics, Damage Reports,
  Inspections, Annual Inspections, Repairs. Each role sees only the children it may open (D3).
- **D30:** until spec 05 the page shows its title and nothing else.
- **D31:** the row of the permissions matrix sits in the group "Scorecards", next to Sales
  Scorecard and Driver Scorecard.

**A rule that follows from D2 and D3 (no new choice).** The path rule of D2 is one pure function,
and the sidebar uses it too. Today the highlight of a menu item matches the address with
`startsWith` and no slash, so with the item of D3 the address `/dashboard-analytics` would also light
up the Dashboard button (`/dashboard`). Both the access check and the highlight must give the same
answer, so both call the same function (§2.1).

## 1. What this spec delivers

- **One path rule** (`pathMatches`) that every place using an allowed path or a menu path calls:
  an address matches a path when it equals it or continues it after a slash.
- **The new path** `/dashboard-analytics` for an administrator, a viewer and a maintainer, and for
  no other role.
- **The sidebar item** of D3 and D29, and a highlight that no longer lights up two items.
- **The route** `src/app/dashboard-analytics` and the empty page of D30.
- **The row of the permissions matrix** (D31), in the same commit (CLAUDE.md).
- **Tests:** Vitest for the rule, the three role lists, the sidebar and the matrix; Playwright
  scenarios by role, written and not run.

## 2. Behaviour

### 2.1 The path rule

The function, in `src/features/userAccess/logic/pathMatches.ts`:

```ts
export function pathMatches(path: string, pathname: string): boolean;
```

- **True** when `pathname` equals `path`, or `pathname` starts with `path` followed by "/".
- **A trailing slash** on the address still matches: `/repairs/` matches `/repairs`.
- **A path that ends with "/"** (none exists today) matches every address that starts with it.
- **Not part of the address:** the query string and the hash. `pathname` never holds them.
- **Case** is compared exactly, as today.

Examples:

- `pathMatches("/dashboard", "/dashboard")` is true.
- `pathMatches("/dashboard", "/dashboard/anything")` is true.
- `pathMatches("/dashboard", "/dashboard-analytics")` is **false**. This is the whole point.
- `pathMatches("/roadmap/backlog", "/roadmap/backlog/123")` is true.
- `pathMatches("/roadmap/backlog", "/roadmap")` is false.
- `pathMatches("/quote", "/quotes-bookings")` is **false**.

It replaces `startsWith` in the six places that match an address to a path:

- **`canAccessPath`** in `src/features/userAccess/accessConfig.ts` (its comment says "by path
  prefix" and is corrected). Its signature does not change.
- **`useAccessRedirect`** in `src/features/userAccess/hooks/useAccessRedirect.ts`.
- **`SideNavButton`**, for `href` and for every `activePrefixes` item.
- **`SideNavSection`** in `src/components/sidebar/Sidebar.tsx`.
- **`SideNavDropdown`**, twice: the test that any child is selected and the test of each child.

D2 recorded that the rule changes the result for no existing route of `src/app` (checked by a
script on 2026-11-25), so no role loses a page it has today. The tests of §3 keep the sensitive
cases (`/dashboard`, `/quote`, `/roadmap/backlog`, a trailing slash, a nested address) so a later
change cannot break them unseen.

### 2.2 The paths of the roles

- **Added:** `/dashboard-analytics` to `admin`, `viewer` and `maintainer` in
  `src/features/userAccess/accessConfig.ts`, each right after `/repairs`.
- **Not added:** `account_manager`, `developer`, `accountant` and `driver`. An account manager
  has `/dashboard` and would open the page under the old prefix rule; the rule of §2.1 stops that.
- **A person with several roles** gets the union of the paths, as today.
- **A role without the path** that opens `/dashboard-analytics` is sent to its landing page by
  `useAccessRedirect`, the same as for any other page it cannot open. Nothing changes there.
- **No server gate.** As with every page, `src/proxy.ts` only asks for a Clerk session; the fence of
  the data is what syncs to a role (spec 04 adds the budgets to the streams of these three roles).

### 2.3 The sidebar item

In `src/components/sidebar/useSidebarItems.ts`, the Quality Assurance dropdown gets a new first
child:

```ts
{ label: "Dashboard & Analytics", href: "/dashboard-analytics", roles: ["admin", "viewer", "maintainer"] }
```

- **Who sees it:** an administrator, a viewer and a maintainer. An account manager keeps the
  dropdown with its other children and does not see this one; the existing filter by `roles` of
  the children does this.
- **Highlight:** on `/dashboard-analytics` the new child is selected, the dropdown is open, and the
  Dashboard button is **not** selected (§2.1).
- **No icon:** the children of a dropdown have none.

### 2.4 The route and the empty page

- **`src/app/dashboard-analytics/layout.tsx`:** the same as the Repairs layout: a `div` with the
  class `p-4` around the children.
- **`src/app/dashboard-analytics/page.tsx`:** renders `DashboardAnalyticsPage`.
- **`src/features/dashboardAnalytics/components/DashboardAnalyticsPage.tsx`:** a client component
  that renders `PageHeader` with the title "Dashboard & Analytics" and nothing else (D30): no
  subtitle, no dropdown, no query of the local database, no rate request.
- **Spec 05** puts the line under the title (D26), the period dropdown (D28) and every block into
  this component.

### 2.5 The row of the permissions matrix (D31)

One new entry in `PERMISSIONS` in `src/features/userAccess/permissionPageData.ts`, in the group
"Scorecards", after "Driver Scorecard", with a comment that names this spec as the other rows do.

- **Label:** "Dashboard & Analytics".
- **Description:** "The Dashboard & Analytics page, in the Quality Assurance menu: the maintenance
  spend, open repairs, budget and cost breakdowns of the whole fleet, in US dollars. It only shows
  figures; nothing on it can be changed."
- **Administrator:** `read` ("Opens the page and reads it. Nothing on it can be changed.").
- **Viewer:** `read` (the same note).
- **Maintainer:** `read` ("Opens the page and reads it, with the same figures as an administrator.
  Nothing on it can be changed.").
- **Account manager:** `none` ("Account managers do not have this page; it is hidden from them.
  They still read every repair on the Repairs page.").
- **Developer:** `none` (the existing note: "Developers do not have access to repairs or
  maintenance data. This role is limited to the product roadmap.").
- **Driver:** `none` (the existing note: "Drivers only have access to the Driver Mobile App.").
- **Accountant:** `none` (the existing `ACCOUNTANT_NO_ACCESS_NOTE`).
- **The maintainer's role description** (`ROLE_DESCRIPTIONS.maintainer`) gets one sentence before
  "No quotes, payments, or team management.": "Reads the Dashboard & Analytics page of maintenance
  figures."
- **Spec 05** rewrites the description once the page shows figures (plan §3).

## 3. Locked contracts

```ts
// src/features/userAccess/logic/pathMatches.ts
export function pathMatches(path: string, pathname: string): boolean;

// src/features/userAccess/accessConfig.ts (unchanged signature)
export function canAccessPath(roles: WebRole[], pathname: string): boolean;

// src/features/dashboardAnalytics/components/DashboardAnalyticsPage.tsx
export default function DashboardAnalyticsPage(): React.JSX.Element;
```

Changing these needs a new "Approved".

## 4. Edge cases and errors

- **A driver-only user** is blocked before the role config is read, as today; nothing changes.
- **A person whose roles are not loaded yet:** `useAccessRedirect` waits for the config, as for
  every page; the empty page does not read the role itself.
- **A person with no role that has the path** who types the address: sent to the landing page.
- **Offline:** the page needs nothing from the network; it opens from the app shell like any page.
- **Clerk errors:** unchanged; the shell handles a missing session before this page renders.
- **`/dashboard-analytics/anything`:** matches for the three roles (a nested address), so a later
  spec may add child routes without touching access again.
- **The Dashboard button on `/dashboard/anything`:** still selected (the rule keeps the nested
  address).

## 5. Tests (written first, red then green)

**Vitest** (`npm run test`):

- **`pathMatches.test.ts`:** every example of §2.1, a trailing slash, a nested address, an empty
  `pathname`, a path that ends with "/", and the case rule.
- **`accessConfig.test.ts`** (extended): `/dashboard-analytics` is allowed for admin, viewer and
  maintainer (also nested); denied for account manager, developer, accountant and driver; a merged
  admin plus driver keeps it; `/dashboard` is still allowed for the account manager and does not
  open `/dashboard-analytics`; a maintainer opens `/roadmap/backlog` and `/roadmap/backlog/1` and
  not `/roadmap`; the allowed result is unchanged for every other path the tests already used.
- **`useSidebarItems.test.ts`** (extended): the first child of Quality Assurance is "Dashboard &
  Analytics" for admin, viewer and maintainer; an account manager's children do not contain it;
  the order for admin is Dashboard & Analytics, Damage Reports, Inspections, Annual Inspections,
  Repairs.
- **`Sidebar.test.tsx`** (extended): on `/dashboard-analytics` the Dashboard button is not
  selected and the new child is; on `/dashboard` the button is selected.
- **`permissionPageData.test.ts`** (extended): the row exists, is in the group "Scorecards", and
  has `read` for admin, viewer and maintainer and `none` for the other four roles. Any existing
  test that lists the granted rows of a role is changed on purpose, with the row added.

**Playwright** (written, not run; the report marks it SKIPPED). Files in
`src/features/dashboardAnalytics/e2e/`:

- **S1** (`dashboardAnalyticsAccess.admin.spec.ts`): an administrator opens
  `/dashboard-analytics` and sees the title "Dashboard & Analytics" and nothing under it; the
  Quality Assurance dropdown lists the item first, and the Dashboard button is not highlighted.
- **S2** (`dashboardAnalyticsAccess.viewer.spec.ts`): the same for a viewer.
- **S3** (`dashboardAnalyticsAccess.am.spec.ts`): an account manager does not see the item in the
  dropdown, and typing the address sends them to the landing page.
- **S4** (`dashboardAnalyticsAccess.maintainer.spec.ts`): the same as S1 for a maintainer. The
  maintainer suite joins the run once `E2E_MAINTAINER_EMAIL` exists (`playwright.config.ts`).
- **S5** (`dashboardAnalyticsAccess.admin.spec.ts`): clicking the item from the dropdown opens the
  page, and clicking Dashboard afterwards moves the highlight to that button.

## 6. Files

New:

- `src/features/userAccess/logic/pathMatches.ts` and `pathMatches.test.ts`.
- `src/app/dashboard-analytics/layout.tsx` and `page.tsx`.
- `src/features/dashboardAnalytics/components/DashboardAnalyticsPage.tsx`.
- `src/features/dashboardAnalytics/e2e/dashboardAnalyticsAccess.{admin,viewer,am,maintainer}.spec.ts`.

Changed:

- `src/features/userAccess/accessConfig.ts` and `accessConfig.test.ts`.
- `src/features/userAccess/hooks/useAccessRedirect.ts`.
- `src/components/sidebar/SideNavButton.tsx`, `Sidebar.tsx`, `SideNavDropdown.tsx`,
  `useSidebarItems.ts`, `useSidebarItems.test.ts` and `Sidebar.test.tsx`.
- `src/features/userAccess/permissionPageData.ts` and `permissionPageData.test.ts`.

Not changed: the database, `AppSchema.ts`, the sync rules, `src/proxy.ts`.

## 7. Definition of done

- Every test of §5 written first, seen red, then green.
- `npm run tc`, `npm run test` pass; `npx prettier --check` on the touched files is clean (format
  only the touched files).
- Playwright written and not run: the final report says SKIPPED.
- The final report of CLAUDE.md, with the real tail of each command.
- The user's "Approved" on this spec before any code; a commit only when the user asks.
