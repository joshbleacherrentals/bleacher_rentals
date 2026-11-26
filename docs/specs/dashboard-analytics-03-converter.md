# Dashboard & Analytics 03: the exchange-rate converter

Status: **DRAFT 2026-11-25, awaiting "Approved"** (4 decisions of the user in this spec, D32 to
D35; 0 open decisions; nothing built, nothing committed). Build order: **03 of 5**. Needs:
[dashboard-analytics-01-design.md](dashboard-analytics-01-design.md) (approved 2026-11-25). Needed
by: 04 (it takes the rate lookup) and 05 (it shows the notes of D9 and D10 and the loading
state). It does not need spec 02. Branch: `q4-sprint4-maintenance-dashboard`.
Scope: the Frankfurter client, the memory of the days the browser has received, the lookup of a
rate by day, the conversion of cents, and one hook. Pure functions, one client and one hook;
**nothing is visible**: no page, no matrix row, no database change, no sync change.

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

- **D32:** the browser remembers the days it has received in `localStorage`. A rate is one number
  per day; three years are about 780 numbers, about 25 KB.
- **D33:** the rates are asked for in one request: from the Repair from day of the oldest CAD
  repair to today. A later opening asks only for the days after the newest day the browser
  already has.
- **D34:** a request waits 10 seconds. After that the page uses the last known rate (D9), and with
  no rate known at all it shows the line of D9.
- **D35:** cents are rounded to the nearest cent: C$123.50 at 0.70137 is $86.619, which becomes
  $86.62 (rounding down would give $86.61).

**Rules that follow from D6 to D9 and from the tests of 2026-11-25 (no new choice).**

- **No CAD repair, no request.** The page never calls the API when there is nothing to convert.
- **One rate per CAD repair.** The caller asks for the rate of the repair's Repair from day (D6);
  the answer is the rate of the nearest earlier day that has one (D9), or nothing.
- **Nothing is invented.** A day earlier than every known rate has no rate. The page then counts
  that repair as "no rate" (spec 04) and shows the line of D9.
- **The answer of the API is trusted only whole.** One malformed entry makes the whole answer
  unusable (§2.4); half an answer is never applied.

## 1. What this spec delivers

- **`makeRateLookup`:** the rate of a day, with the carry-forward of D6 and D9.
- **`convertCents`:** cents of CAD to cents of USD, rounded as D35 says.
- **`planRatesRequest`:** the one range to ask for, or none (D33).
- **`fetchCadUsdRates`:** the Frankfurter client, with the 10 seconds of D34.
- **`readRateMemory` and `writeRateMemory`:** the memory of D32.
- **`useCadUsdRates`:** the hook that ties them together and tells the page its state.
- **Vitest tests** for all of it. No Playwright: nothing is visible.

## 2. Behaviour

### 2.1 What the API gives (tested 2026-11-25)

The address is `https://api.frankfurter.dev/v1/{from}..{to}?base=CAD&symbols=USD`, with days as
`YYYY-MM-DD`. It is free, needs no key, and answers with `access-control-allow-origin: *`, so a
browser may call it. The app sets no Content-Security-Policy, so nothing blocks the call.

- **Success (HTTP 200):** `{"amount":1.0,"base":"CAD","start_date":"2026-11-20","end_date":"2026-11-25","rates":{"2026-11-20":{"USD":0.69898},"2026-11-23":{"USD":0.69626}}}`.
  One entry per business day. Only the keys of `rates` matter; `start_date` and `end_date` are
  ignored.
- **A range of weekend days** still answers 200, with the rate of the business day before it as
  the only entry (the range 2026-11-21..2026-11-22 gave 2026-11-20).
- **A range after the newest published day** answers HTTP 404 with `{"message":"not found"}`.
- **A range of three years** gave one entry per business day (782), not weekly ones.
- **Only dates and currency codes leave the app.** The request is a plain GET without headers of
  its own and without cookies, so the browser sends no preflight.

### 2.2 The lookup and the conversion

```ts
export type DayRates = Record<string, number>; // "YYYY-MM-DD" -> USD for 1 CAD

export function makeRateLookup(rates: DayRates): (day: string) => number | null;
export function convertCents(cents: number, rate: number): number;
```

- **`makeRateLookup`** sorts the days once and answers by binary search. For a `day` it returns
  the rate of the **latest day that is not after `day`**, or `null` when every known day is
  later (D6, D9). A day after the newest known day gets the newest rate. Days compare as text;
  the format makes that correct.
- **`convertCents(cents, rate)`** is `Math.sign(cents) * Math.round(Math.abs(cents) * rate)`: to the
  nearest cent, a half going away from zero (D35). `convertCents(12350, 0.70137)` is 8662.
  `convertCents(0, rate)` is 0. The caller guarantees finite numbers.
- **A repair is converted whole** (D37 in spec 04): the caller passes the sum, not each service;
  this module only knows cents and a rate.

### 2.3 What to ask for

```ts
export type RatesRequest = { from: string; to: string };
export type RateMemory = { askedFrom: string; rates: DayRates };

export function planRatesRequest(params: {
  memory: RateMemory | null;
  oldestCadDay: string | null;
  today: string;
}): RatesRequest | null;
```

`oldestCadDay` is the Repair from day of the oldest live CAD repair of all time, or `null` when
there is none. `today` is the day in the app time zone. `askedFrom` is the first day any past
request started from. The answer, in this order:

1. **No CAD repair** (`oldestCadDay` is `null`): `null`.
2. **The memory has no rate, or it does not reach back far enough** (`oldestCadDay` is before
   `askedFrom`): ask for the whole range, `from` the earlier of `oldestCadDay` and `today`, `to`
   `today`. A CAD repair dated in the future starts the range at `today`, never after it.
3. **Otherwise** let `newest` be the latest day that has a rate in the memory. When `newest` is
   `today` or later: `null`. Else ask `from` the day after `newest` `to` `today` (D33).

It is one request each time. The days between `newest` and `today` may hold weekends: the API
then answers with the rate already known, and merging it changes nothing.

### 2.4 The client

```ts
export const FRANKFURTER_TIMEOUT_MS = 10_000;

export type RatesFetchResult =
  | { kind: "rates"; rates: DayRates } // 200 and a body that is read whole
  | { kind: "none" } // 404: no newer day has been published
  | { kind: "failed" }; // no network, the 10 seconds, another status, an unreadable body

export async function fetchCadUsdRates(
  request: RatesRequest,
  options?: { fetchFn?: typeof fetch; timeoutMs?: number },
): Promise<RatesFetchResult>;
```

- **The call:** `GET https://api.frankfurter.dev/v1/${from}..${to}?base=CAD&symbols=USD`, with
  `credentials: "omit"` and an `AbortController` that aborts after `timeoutMs` (10 seconds,
  D34). The timer is cleared when the call ends.
- **200:** the body is read as JSON. It must be an object whose `rates` is an object; every key
  must be a day `YYYY-MM-DD`, and every value an object whose `USD` is a finite number above 0.
  When all of that holds the result is `{ kind: "rates", rates }` with the flat map of days. An
  empty `rates` is valid: no new day. Anything else is `failed`: **one bad entry spoils the
  whole answer**.
- **404:** `none`. It is not a failure: nothing newer exists yet.
- **Any other status, a network error, the timeout, an unreadable body:** `failed`. The function
  never throws and never retries.

### 2.5 The memory (D32)

```ts
export const RATE_MEMORY_KEY = "dashboard-analytics:cad-usd-rates:v1";

export function readRateMemory(storage: Pick<Storage, "getItem">): RateMemory | null;
export function writeRateMemory(storage: Pick<Storage, "setItem">, memory: RateMemory): void;
```

- **What is stored:** one JSON object `{ "version": 1, "askedFrom": "YYYY-MM-DD", "rates": {…} }`
  under `RATE_MEMORY_KEY`. It holds only days and numbers.
- **`readRateMemory`** returns `null` when the key is missing, the text is not JSON, the version
  is not 1, `askedFrom` is not a day, or any entry fails the check of §2.4. A memory that fails
  is ignored, not deleted; the next successful write replaces it.
- **`writeRateMemory`** never throws. A full or blocked storage (a private window) is swallowed:
  the page works with the rates of this opening and they are asked for again next time.
- **Growth:** about 260 entries a year, about 8 KB. There is no pruning.
- **Tabs:** the memory is shared by every tab of the app (one origin), which is intended.

### 2.6 The hook

```ts
export type CadUsdRatesState = {
  /** idle: nothing to convert. loading: no rate is known yet and a request is open.
      ready: at least one rate is known (a request for newer days may still be open).
      unavailable: no rate is known and the request ended without one. */
  status: "idle" | "loading" | "ready" | "unavailable";
  rateFor: (day: string) => number | null;
};

export function useCadUsdRates(params: {
  oldestCadDay: string | null;
  today: string;
}): CadUsdRatesState;
```

The hook is for client components. It reads the memory after the first render, never during it,
so the server and the browser render the same first frame.

1. **`oldestCadDay` is `null`:** `status` is `idle`, `rateFor` returns `null` for every day, and
   nothing is read or asked.
2. **Otherwise** the hook reads the memory (§2.5). When it holds rates, `status` is `ready` at once
   and `rateFor` answers from it, so the page shows its numbers without waiting. When it holds
   none, `status` is `loading`.
3. **It plans the request** with `planRatesRequest`. When the plan is `null`, the hook is done.
4. **It asks once** with `fetchCadUsdRates`:
   - **`rates`:** the received days are merged into the known ones (the received value wins on the
     same day); `askedFrom` becomes the earlier of the old one and `from`; the memory is written;
     `rateFor` now answers from the merged days; `status` is `ready`.
   - **`none`:** nothing changes. With rates known `status` stays `ready`; with none it becomes
     `unavailable`.
   - **`failed`:** the same as `none`. The memory is not written.
5. **It runs again** only when `oldestCadDay` or `today` changes. It does not poll, and it makes at
   most one request for one pair of those two values in one mounting.
6. **When the hook unmounts** or the pair changes, an open request is aborted and its answer is
   dropped; nothing is set after that.
7. **`rateFor` changes identity** only when the known days change, so a memo on it is stable.

## 3. Locked contracts

Everything with a signature in §2: `DayRates`, `RateMemory`, `RatesRequest`, `RatesFetchResult`,
`CadUsdRatesState`, `makeRateLookup`, `convertCents`, `planRatesRequest`, `fetchCadUsdRates`,
`FRANKFURTER_TIMEOUT_MS`, `RATE_MEMORY_KEY`, `readRateMemory`, `writeRateMemory`,
`useCadUsdRates`. Changing one needs a new "Approved". The file names of §6 are free.

## 4. Edge cases and errors

- **First visit, no internet:** no memory, the request fails: `status` goes from `loading` to
  `unavailable` after at most 10 seconds (D34). The page then shows everything but its CAD
  repairs and the line of D9 (spec 05).
- **First visit, slow network:** the page shows the loading state until the answer or the 10
  seconds.
- **Memory present, offline:** `ready` at once; the request fails quietly; the last known rates
  stand.
- **A repair on a weekend or a holiday:** the lookup gives the earlier business day's rate (D6).
- **A repair older than the oldest remembered day:** `planRatesRequest` asks for the whole range
  again (§2.3, rule 2), once.
- **A repair dated in the future:** it gets the newest known rate (the lookup carries forward).
- **Memory damaged by hand:** ignored (§2.5); the next success replaces it.
- **Storage blocked:** the page works; the rates are not remembered.
- **The API changes its answer:** an unexpected shape is `failed`, never half applied.
- **Clerk and PowerSync:** this module touches neither. No auth header goes to the API.

## 5. Tests (written first, red then green)

**Vitest** (`npm run test`), next to each file:

- **`exchangeRates.test.ts`:** the lookup (a known day, a weekend, a day before every rate gives
  `null`, a day after the newest, an empty map); `convertCents` (86.619 gives 86.62, a half rounds
  away from zero, zero, a negative number); `planRatesRequest` for each rule of §2.3, including a
  future `oldestCadDay` and `newest` equal to `today`.
- **`frankfurterClient.test.ts`** with an injected `fetchFn`: the exact address and no headers; a
  good body; an empty `rates`; 404 gives `none`; 500, a rejected call and bad JSON give `failed`;
  every kind of bad entry (a key that is not a day, `USD` missing, zero, negative, a string) gives
  `failed`; the 10 seconds with fake timers aborts and gives `failed`; the timer is cleared.
- **`exchangeRateMemory.test.ts`:** a round trip; a missing key, bad JSON, a wrong version, a bad
  `askedFrom` and a bad entry each give `null`; `writeRateMemory` swallows a throwing storage.
- **`useCadUsdRates.test.ts`** (`renderHook`, a mocked client, an in-memory storage): `idle` and no
  request without CAD repairs; memory that covers `today` gives `ready` and no request; stale
  memory gives `ready` at once, then a request, a merge and a write; no memory and a good answer
  goes `loading` then `ready`; no memory and `failed` goes `loading` then `unavailable`; memory
  and `failed` stays `ready` and writes nothing; `none` as in the rule; a throwing storage still
  works; one request for one pair in strict mode; a changed `today` asks again; an unmount
  aborts the request and sets nothing.

**Playwright:** none, nothing is visible. The report marks it SKIPPED with that reason.

## 6. Files

New, in `src/features/dashboardAnalytics/`:

- `utils/exchangeRates.ts` and `exchangeRates.test.ts`.
- `utils/exchangeRateMemory.ts` and `exchangeRateMemory.test.ts`.
- `api/frankfurterClient.ts` and `frankfurterClient.test.ts`.
- `hooks/useCadUsdRates.ts` and `useCadUsdRates.test.ts`.

Not changed: the database, `AppSchema.ts`, the sync rules, the permissions matrix (no screen shows
anything yet), the Repairs page.

## 7. Definition of done

- Every test of §5 written first, seen red, then green.
- `npm run tc`, `npm run test` pass; `npx prettier --check` on the touched files is clean (format
  only the touched files).
- Playwright not written, SKIPPED with the reason of §5.
- The final report of CLAUDE.md, with the real tail of each command.
- The user's "Approved" on this spec before any code; a commit only when the user asks.
