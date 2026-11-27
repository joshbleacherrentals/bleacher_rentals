# Accountant KPI tab: days to collect

Status: **IMPLEMENTED 2026-11-27, uncommitted** (APPROVED 2026-11-27; tc and the full Vitest
run green; e2e written, not run; no live browser check). All 17 decisions D1-D17 are the user's
answers; 0 open. What differs from the text below is in §7. One spec, one logic, one commit.
Branch: `q4-sprint-4-finance`.
Builds on: [payment-accounting-truth](payment-accounting-truth.md) (how money is applied to an
installment), [payment-first-installment-on-signing](payment-first-installment-on-signing.md)
(the first installment is due the day the event is first booked) and
[accountant-audit-05](accountant-audit-05-drivers-table.md) (the range controls). None of the
three is edited.

## 0. The feature in brief

**The request (user, 2026-11-27, translated).** A new tab "KPI" on the Accountant page. It
shows KPIs. For now two values:

- **Days to collect Deposit:** the average number of days from the day a payment was
  scheduled to the day the deposit was paid. The deposit is the first payment (instalment) of
  the payment schedule.
- **Days to collect Final Payment:** the average number of days from the day a payment was
  scheduled to the day the final payment was paid. The final payment is the last payment
  (instalment) of the payment schedule.
- Both values count full payments only, not a part: if 1000 is expected, the payment counts
  as paid only when the value reaches 1000.
- A way to choose a time range, as on `/accountant?tab=audit&from=2026-11-01&to=2026-11-30`.
- Notes that came with the request:
  - A customer who pays less than expected is not counted as collected, not until fully paid.
  - The accountant may adjust the payment terms at any time, and this could recalculate the
    collected-days KPI.
  - Show an average for the selected range.
  - The due date of the last payment on the payment schedule, against the date of the last
    transaction that was equal to or greater than the last scheduled payment.
- **How we work:** one English spec in `docs/specs/` and one full Ukrainian copy as an
  artifact (not committed). The user takes every decision; a question is asked, never guessed.

**Decisions taken by the user (2026-11-27).**

- **D1, what "collected" means:** the money adds up. A payment of the schedule is collected
  when the money applied to it reaches its full amount, even if it came in several
  transactions. The day is the day of the last transaction that completed it. Example: 1000
  due Nov 1, paid 600 on Nov 5 and 400 on Nov 9: collected Nov 9, 8 days. This is the rule the
  Billing tab already uses for Paid. The request's note "the last transaction equal to or
  greater than the last scheduled payment" is read this way: the transaction after which what
  was received reached the scheduled amount.
- **D2, what the range filters:** the day the payment was collected. A payment belongs to
  the range its last transaction falls in. Example: due Oct 28, collected Nov 3 (6 days): it is
  in the range "November", not in "October". Both ends of the range are included.
- **D3, early payments:** a payment collected before its due date (negative days) is not
  counted: not in the average, not in the number of payments. A payment collected on its due
  date (0 days) is counted. Example: 0, 4 and -2 days give an average of 2.
- **D4, which events:** only `Events.event_status = 'booked'` and not deleted, as Collections.
  An event in `unsigned_changes` (signed, then changed) is out of the KPI while it has that
  status and comes back when it is booked again.
- **D5, an event with no schedule:** counts as a schedule with one payment for the whole event
  total, due on the day the event was first booked (D9). That payment goes to Final Payment
  only (D6). Example: booked Nov 2, paid in full Nov 12: 10 days in Final Payment.
- **D6, a schedule with one payment:** its only payment goes to Final Payment, not to Deposit.
  Deposit exists only for a schedule of two or more payments.
- **D7, recalculation:** live. Nothing is stored. Every number is worked out again from the
  current schedule and the current payments, so a changed due date, changed percentages, a
  deleted payment or a refund also change the numbers of past ranges at once.
- **D8, the card:** the average and how many payments it is made of, for example `10 days`
  and `3 payments`. A payment that is not collected yet is in neither, so a payment that stays
  unpaid for a long time does not raise the number.
- **D9, the day the event was first booked (for D5):** the Toronto day of the event's first
  signature (`ContractSignatures.signed_at`, any status); if there is none, the Toronto day of
  `Events.booked_at`. The same rule the database already uses for the first payment of a
  schedule (`first_booked_day`). The two days differ in only 5 events today.
- **D10, no such day:** an event with no schedule and neither a signature nor `booked_at` is
  skipped. Today 238 of the 623 booked events with no schedule are like this; none of them
  has a payment.
- **D11, rounding:** the average is shown in whole days, rounded up (to the larger whole
  number). 28 / 3 = 9.33 shows `10 days`; exactly 9 shows `9 days`; 0.2 shows `1 day`; 0 shows
  `0 days`. Only the shown average is rounded; the number of payments is a count.
- **D12, the range is the tab's own:** the KPI tab has its own `from` and `to` in its own URL
  parameters; the Audit tab does not see them and they do not see the Audit tab's. The
  controls are the same: the same presets, From and To fields.
- **D13, the opening range:** This month (the first to the last day of the current month),
  written into the URL once when the tab opens with no dates.
- **D14, Export to CSV:** the button in the page header stays on the page and is disabled
  (grey) on the KPI tab.
- **D15, the tab's place:** last, after Audit: Collections, AR Deposits, Need attention,
  Audit, KPI.
- **D16, the hint:** each card has an (i) next to its title with a short explanation (the
  texts are in §2.4).
- **D17, time zone:** always Toronto (`America/Toronto`), for every user. A payment's day is
  the Toronto day of its `paid_at`; due dates are plain dates. A payment made on Nov 9 at
  22:00 Toronto (Nov 10, 03:00 UTC) is on Nov 9.

Settled by the request, so not asked: the two cards and their names; the average is over the
payments of the selected range; both values count full payments only; the range controls are
those of the Audit tab (both ends included, the preset select is not in the URL, From after To
shows a message and runs nothing); no new access rule, the tab is on the Accountant page, so
whoever can open that page (administrators and accountants) can open the tab.

**What the code already has (researched 2026-11-27).**

- **The page.** `src/app/accountant/page.tsx` has four tabs from `ACCOUNTANT_TABS`
  (`utils/listTabs.ts`). Collections and Audit hide the receivables chrome (filter sidebar,
  Filter button, Show Deleted, search, chips). The header's `ExportCsvButton` is disabled
  while no tab has registered a file (`disabled={!spec || spec.disabled}`), so a tab that
  registers nothing gets D14 for free.
- **The range.** `accountantAudit/utils/auditRange.ts` has the presets, `resolvePreset`,
  `presetOf`, `openingRange`, `isRealIsoDate`, `isRangeInverted` and the type `AuditRange`.
  `AuditRangeControls` draws the preset select and the From / To fields from a range and an
  `onChange`. `useAuditRange` keeps the range in the URL as `from` and `to`. Their parameter
  names are fixed inside `parseAuditRange` and `withAuditRange`, which also drop `apage`, so
  the KPI tab needs its own pair of functions and its own hook.
- **The money rules.** `quotesAndBookings/utils/allocatePayments.ts` is the one function that
  says how much of an event's money sits in which installment (`byPayment[].parts`), and
  `accountsReceivable.ts` shows the whole chain for a list of events:
  `resolvePaymentSchedule` -> `allocatePayments` -> numbers. It reads Events, EventLineItems,
  PaymentInstallments and PaymentHistory from the local PowerSync database
  (`useAccountsReceivableData`), and `useOfficeCurrencies` / `pickEventCurrency` give the
  event's currency. `accountantCollections/utils/calendarDays.ts` has `daysBetween`.
- **Sync.** The Accountant and Admin web buckets already sync Events, EventLineItems,
  PaymentInstallments, PaymentHistory and ContractSignatures (the file is
  `sync_rules.yaml` in the sibling repository `br_powersync`, folder `config`). No sync-rule
  change, no migration, no `AppSchema.ts` change.
- **A fault in `paidAt`, found while writing this spec.** `InstallmentAllocation.paidAt` is
  the date of the last payment the function handled, not the latest date. A payment aimed at
  the installment is handled before a payment with no installment. Checked 2026-11-27 with a
  throwaway test: installment A, 1000 due Nov 1; a payment of 400 aimed at A on Nov 10 and a
  payment of 600 with no installment on Nov 5. A is full on Nov 10 (9 days), but `paidAt` says
  Nov 5 (4 days). Two other cases were right (payments with no installment one after the
  other, and an overpayment that spills into the next installment). This spec therefore does
  not use `paidAt` (C6) and does not change `allocatePayments`.
- **The data today (2026-11-27, production, read-only).** 725 booked events. 102 of them
  have a schedule (12 with one payment, 88 with two, 2 with three) and 623 have none. 138 live
  payments, 52 of them with no installment link; 108 events have a payment. Only 1 payment
  sits on an event that is not booked or `unsigned_changes`. The `due_on_signing` column is in
  the repository but not deployed yet, so the production schedules do not carry it.

## 1. The calculation

One pure function turns the loaded rows into "collected payments"; another filters them by
range and averages. The rules, in order:

- **C1, events.** `event_status = 'booked'` and `deleted = 0` (D4).
- **C2, the schedule.** The event's `PaymentInstallments` rows in the schedule's own order:
  the row with `due_on_signing` first, then by `due_date`, then by `id` (the order of
  `usePaymentInstallments`). Amounts come from `resolvePaymentSchedule(rows, totalCents)` with
  the event total of the receivables list: `eventTotalCents(lineTotalCents, event)`, never
  below 0.
- **C3, no schedule.** An event with no rows gets one row of 100% whose due date is the day of
  D9. With no such day the event is skipped (D10). The row's id is `none:<event id>`.
- **C4, roles.** With two or more rows the first row is Deposit and the last row is Final
  Payment. With one row (or the row of C3) that row is Final Payment only (D5, D6).
- **C5, what is paid.** `allocatePayments(schedule, payments, currency)`, the same call as the
  Billing tab and the receivables list, with the event's currency. A payment that is deleted,
  not `succeeded` or in another currency is left out by that function, as everywhere. A row is
  collected when its allocation `status` is `paid` and its amount is above 0 (a row of 0 is
  "paid" but nothing paid it, so it is skipped).
- **C6, the collected day.** The payments are put back one at a time in the order they arrived
  (`paid_at`, else `created_at`; ties by `created_at`, then `id`), and after each one
  `allocatePayments` is asked whether the row is full. The collected day is the Toronto day
  (D17) of the payment after which the row became full for the last time. So a refund that
  reopens the row and a later payment that fills it again give the day of that later payment.
  A payment with no readable time cannot give a day; if the row became full on it, the row is
  skipped. `InstallmentAllocation.paidAt` is not used, see §0. (Changed during implementation,
  see §7.)
- **C7, days.** `days = daysBetween(dueDate, collectedDay)`, whole calendar days. A row with an
  empty due date is skipped.
- **C8, early.** A row with `days < 0` is not counted (D3).
- **C9, the range.** `from <= collectedDay <= to`; a `null` end is no limit (D2).
- **C10, the number.** For one role: the rows that pass C8 and C9; `count` is how many;
  the shown average is `ceil(sum of days / count)` worked out with whole numbers (D11).
- **C11, nothing to show.** `count = 0` shows a dash as the value and `0 payments`.
- **C12, live.** No column, table or trigger stores a day or a number (D7).

Worked examples (every number computed with a tool on 2026-11-27); they become unit tests.

- **E1.** Total 2000.00. Row 1: 50%, due on signing, first booked Nov 2. Row 2: 50%, due on
  Nov 20. Payments: 1000.00 on Nov 4 and 1000.00 on Nov 25. Deposit 2 days, Final Payment 5
  days.
- **E2 (D1).** Row of 1000.00 due Nov 1; payments 600.00 on Nov 5 and 400.00 on Nov 9.
  Collected Nov 9, 8 days. With only the 600.00 the row is not collected and is not counted.
- **E3 (the `paidAt` fault).** Rows A (1000.00, due Nov 1) and B (1000.00, due Dec 1). A
  payment of 400.00 aimed at A on Nov 10 and a payment of 600.00 with no installment on Nov 5.
  A is collected Nov 10, 9 days.
- **E4 (D3).** Due Nov 20, collected Nov 18: -2 days, not counted. Due Nov 20, collected Nov
  20: 0 days, counted.
- **E5 (D5, D9).** No schedule, first signature on Nov 2, paid in full Nov 12: Final Payment
  10 days, Deposit nothing.
- **E6 (D6).** A schedule of one row, due Nov 1, collected Nov 3: Final Payment 2 days,
  Deposit nothing.
- **E7 (D11).** Days 8, 9 and 11: sum 28, 28 / 3 = 9.33, shown `10 days`, `3 payments`. Days
  9, 9 and 9: `9 days`. Days 1, 0, 0, 0, 0: 0.2, shown `1 day`.
- **E8 (D2).** Due Oct 28, collected Nov 3: 6 days; in the range Nov 1 to Nov 30, not in Oct 1
  to Oct 31.
- **E9 (D17).** `2026-11-10T03:00:00Z` is Nov 9 in Toronto.
- **E10 (C6).** Row of 1000.00 due Nov 1; payments 1000.00 on Nov 5, a refund of -400.00 on Nov
  7 and 400.00 on Nov 10, whether they are aimed at the row or not. The row was full, was
  reopened and was filled again: collected Nov 10, 9 days.

## 2. Design

### 2.1 Types and contracts (locked)

```ts
// accountantKpi/utils/collectionDays.ts
export type KpiRole = "deposit" | "final";

/** One payment of a schedule that was paid in full, and how long it took. */
export type CollectedPayment = {
  eventId: string;
  /** The installment id, or `none:<event id>` for an event with no schedule (C3). */
  paymentId: string;
  role: KpiRole;
  dueDate: string; // YYYY-MM-DD
  collectedDay: string; // YYYY-MM-DD, Toronto (D17)
  days: number; // whole days; negative when paid early
};

export type KpiEventRow = {
  id: string;
  sales_office_uuid: string | null;
  tax_percent: number | null;
  tax_amount_cents: number | null;
  booked_at: string | null;
};

export type KpiInstallmentRow = {
  id: string;
  event_uuid: string | null;
  due_date: string | null;
  percentage_bps: number | null;
  due_on_signing: number | null;
}; // the ReceivableInstallmentRow columns and due_on_signing, flat (see §7)

export type FirstSignatureRow = { event_uuid: string | null; first_signed_at: string | null };

export type CollectionSources = {
  events: readonly KpiEventRow[];
  lineTotals: readonly EventLineTotalRow[]; // from accountsReceivable.ts
  installments: readonly KpiInstallmentRow[];
  payments: readonly ReceivablePaymentRow[]; // from accountsReceivable.ts
  firstSignatures: readonly FirstSignatureRow[];
};

export function collectedPayments(
  sources: CollectionSources,
  currencyOf: (event: KpiEventRow) => Currency,
): CollectedPayment[];
```

```ts
// accountantKpi/utils/kpiAverages.ts
export type KpiResult = {
  /** Whole days, rounded up (D11); `null` when there is nothing to average. */
  days: number | null;
  count: number;
};

export function kpiForRange(
  rows: readonly CollectedPayment[],
  role: KpiRole,
  range: AuditRange, // from accountantAudit/utils/auditRange.ts
): KpiResult;
```

```ts
// accountantKpi/utils/kpiRange.ts
export const KPI_FROM_PARAM = "kfrom";
export const KPI_TO_PARAM = "kto";
export function parseKpiRange(searchParams: { get(key: string): string | null }): {
  range: AuditRange;
  hasRangeParams: boolean;
};
export function withKpiRange(current: URLSearchParams, range: AuditRange): string;
```

```ts
// accountantKpi/hooks/useKpiData.ts
export function useKpiData(): {
  rows: CollectedPayment[] | undefined; // undefined while loading
  isLoading: boolean;
  error: Error | undefined;
};
```

```tsx
// accountantKpi/components/KpiCard.tsx
export type KpiCardProps = {
  title: string; // "Days to collect Deposit"
  hint: string; // the text of the (i)
  value: string; // "10 days", a dash, or "Loading..."
  detail?: string; // "3 payments"; left out while loading
  testId: string; // "kpi-card-deposit" or "kpi-card-final"
};
export function KpiCard(props: KpiCardProps): React.JSX.Element;

// accountantKpi/components/KpiTab.tsx: no props. It reads the URL (useKpiRange) and the data
// (useKpiData), and draws the range row and the two cards.
export function KpiTab(): React.JSX.Element;
```

The names `kfrom` and `kto` are mine (after `asearch` of Audit and `csort` of Collections).

### 2.2 Files

New (8 counted):

- `src/features/accountantKpi/utils/collectionDays.ts`: `collectedPayments` (C2-C7).
- `src/features/accountantKpi/utils/kpiAverages.ts`: `kpiForRange`, early payments, the range
  and the rounding (C8-C11).
- `src/features/accountantKpi/utils/kpiRange.ts`: the URL pair of §2.1.
- `src/features/accountantKpi/utils/kpiFormat.ts`: `1 day` / `10 days`, `1 payment` /
  `3 payments`, the dash.
- `src/features/accountantKpi/hooks/useKpiRange.ts`: reads the range, writes the opening range
  once, writes changes (a copy of `useAuditRange` for `kfrom` and `kto`, without `apage`).
- `src/features/accountantKpi/hooks/useKpiData.ts`: the queries of §2.3, the currency, the
  memoised `collectedPayments`. Independent of the range, so a new range does not run the
  allocation again.
- `src/features/accountantKpi/components/KpiCard.tsx`: the card (§2.4).
- `src/features/accountantKpi/components/KpiTab.tsx`: range row, two cards, states, and the
  two hint texts of §2.4 as constants.

Changed (2 counted): `src/app/accountant/page.tsx` (the trigger, the content, `onKpi` in
`hideReceivablesChrome`, the header comment) and `src/features/quotesAndBookings/utils/listTabs.ts`
(`{ id: "kpi", startingSort: DEFAULT_SORT, offersStatus: false }` last in `ACCOUNTANT_TABS`, the
comment). Ten counted files in all.

Not counted: tests, `permissionPageData.ts`, `dataDictionary.ts` (§5). Reused as they are, not
edited: `AuditRangeControls`, `auditRange.ts` helpers, `allocatePayments`,
`resolvePaymentSchedule`, `eventTotalCents`, `useOfficeCurrencies`, `InfoTooltip`,
`daysBetween`. The KPI feature imports from `accountantAudit` and `accountantCollections` and
those do not import from it. `AuditRangeControls` keeps its test id `audit-range-controls`;
only one tab is mounted at a time.

### 2.3 Data (PowerSync, one reactive query each, `expect<T>()` on all)

No Supabase migration and no change to `AppSchema.ts`: every table and column below is already
there. Reads go through `db` and `useTypedQuery`, never `supabase.from(...)`.

- **Events:** `id`, `sales_office_uuid`, `tax_percent`, `tax_amount_cents`, `booked_at` where
  `event_status = 'booked'` and `deleted = 0`.
- **Line totals:** the same sum as `useAccountsReceivableData`
  (`sum(coalesce(quantity, 1) * coalesce(value_cents, 0))` per event, `deleted = 0`).
- **Installments:** `id`, `event_uuid`, `due_date`, `percentage_bps`, `due_on_signing`.
- **Payments:** the nine columns `useAccountsReceivableData` reads from `PaymentHistory`.
- **First signatures:** `event_uuid`, `min(signed_at)` from `ContractSignatures`, grouped by
  event. In the aggregate use the callback form (`.select(({ fn }) => ...)`): the app's `db`
  proxy strips `db.fn`.

The rows are grouped by event in the browser and the allocation runs once per change of the
data. Only booked events are looked at; the other tables are read whole, as the receivables
list does.

### 2.4 The tab

- **URL.** `?tab=kpi&kfrom=YYYY-MM-DD&kto=YYYY-MM-DD`. A URL with neither `kfrom` nor `kto`
  opens on This month and writes it once by `router.replace` (D13). A present but empty
  parameter is "no limit" (All time is `?kfrom=&kto=`). A value that is not a real date is
  read as empty. The page's own URL code keeps `kfrom` and `kto` while the user changes tabs,
  as it keeps `from` and `to`; if it does not, the implementer stops and tells the user.
- **Layout.** The tab hides the receivables chrome. The `AuditRangeControls` row is first;
  below it the two cards side by side, wrapping on a narrow window. A card is in the style of
  the scorecard `KpiCard`: the title in small capitals with the (i) after it, the value large
  (`10 days`), the count under it in small grey text (`3 payments`).
- **Titles.** `Days to collect Deposit` and `Days to collect Final Payment`.
- **States.** Loading: the value area shows `Loading...`. Error: `Could not load the KPIs.`
  (red). From after To: `The start date is after the end date.` and no number. No rows: a
  dash and `0 payments` (C11).
- **Test ids.** `kpi-tab`, `kpi-card-deposit`, `kpi-card-final`.
- **The hints (D16).**
  - Deposit: "The average number of days between the day the first payment of the payment
    schedule was due and the day it was paid in full. A payment is counted in the range that
    contains the day it was paid in full. A payment made before its due date is not counted. A
    booking with one payment or no schedule has no deposit. Changing a payment schedule
    changes this number, also for past dates."
  - Final Payment: "The average number of days between the day the last payment of the payment
    schedule was due and the day it was paid in full. A payment is counted in the range that
    contains the day it was paid in full. A payment made before its due date is not counted. A
    booking with one payment counts here, and so does a booking with no schedule: its payment
    is due the day the booking was first signed or booked. Changing a payment schedule changes
    this number, also for past dates."
- **Export.** Nothing is registered with `useRegisterCsvExport`, so the header button is
  disabled (D14).

## 3. User scenarios (Playwright, written, not run locally: project rule)

Files `src/features/accountantKpi/e2e/kpi.accountant.spec.ts` (and `.admin.`), plus
`kpiAccess.am.spec.ts` and `kpiAccess.viewer.spec.ts` (copies of the Audit access specs). Test
bookings are created with the helpers the Collections specs use.

- **S1.** `/accountant` shows the tabs in the order of D15. `?tab=kpi` opens the KPI tab with
  `kfrom` and `kto` written for This month.
- **S2.** A booked event with a two-row schedule, the deposit collected 2 days and the final
  5 days after their due dates, inside the range: Deposit `2 days`, `1 payment`; Final Payment
  `5 days`, `1 payment` (E1).
- **S3.** The same event with only part of the deposit paid: Deposit shows a dash and
  `0 payments`; the rest recorded on a later day: the card shows the days to that later day
  (E2).
- **S4.** A range that does not contain the collected day: a dash. Choosing a preset or editing
  a date changes the numbers; the Audit tab's own range is not changed.
- **S5.** A payment collected before its due date is not counted (E4).
- **S6.** A one-row schedule: Final Payment counts it, Deposit does not (E6).
- **S7.** A booked event with no schedule, paid in full: Final Payment counts it (E5).
- **S8.** Editing the schedule of a collected event (a due date moved) changes the number at
  once, without a reload (D7).
- **S9.** Days 8, 9 and 11 show `10 days`, `3 payments` (E7).
- **S10.** The header's Export to CSV is disabled on KPI and enabled again on Collections.
- **S11.** From after To shows the message and no numbers. All time (`?kfrom=&kto=`) counts
  every collected payment.
- **S12.** An account manager and a viewer cannot reach `/accountant?tab=kpi`; an admin and an
  accountant can.

## 4. Edge cases and errors

- **Offline / PowerSync.** The numbers come from the local database, so the tab works offline
  with the last synced data. While the first sync result is loading it shows `Loading...`,
  never `0 payments`.
- **Auth.** The tab sits behind the Accountant page's gate (Clerk and the role check); a user
  without the role never reaches it. No new server route, so no new auth error.
- **A refund after collection.** The refund reopens the newest row (the function's rule), the
  row stops being collected and leaves the numbers (D7).
- **A deleted payment, a payment in another currency, a payment that is not `succeeded`.**
  Not counted, as everywhere (C5). One live payment today is in a currency different from its
  installment's.
- **An overpayment.** The surplus goes to the next row (the function's rule); each row is
  collected on the day of the last transaction that put money into it.
- **A payment with no installment** (52 live ones today). It fills rows oldest first, as on
  the Billing tab.
- **A row with an empty due date** (only the due-on-signing row of an event never booked, and
  such an event is not booked). Skipped.
- **An event total of 0** (no line items). Every row is 0, so nothing is collected, nothing is
  counted. This is the Billing tab's total, not a new rule.
- **The event leaves `booked`** (becomes `unsigned_changes`, lost or deleted). Its payments
  leave the numbers at once (D4, D7).
- **The first-installment migration is not deployed yet** (`20261128120000`). When it reaches
  production it re-dates the first row of finished booked events to their signing day, so
  the Deposit numbers shift at that moment (D7). This is a consequence of D7, not a defect.
- **Two payments on the same instant.** The tie goes by `created_at`, then `id`, as in the
  function.
- **A date that cannot be read** (a bad `paid_at`). The payment is not used for the day; if
  `created_at` is also unreadable the row is skipped.
- **A bad URL.** An unreal date is read as empty; unknown `tab` opens Collections (the page's
  rule).

## 5. Tests and the same-commit updates

Test first, in this order: `collectionDays.test.ts` (E1-E6, E9, E10, each rule C2-C7 and every
edge case of §4), `kpiAverages.test.ts` (E7, E8, C8, the range ends, `null` ends, an empty
result, the integer rounding with exact divisions such as 27 / 3), `useKpiData.test.tsx` (C1 and
D9: the five queries run on SQLite; the loading, error and currency states), `kpiRange.test.ts`
(parse and write,
empty ends, unreal dates), `kpiFormat.test.ts`, `useKpiRange.test.tsx` (the opening write,
and that the page's own write does not erase it), `KpiCard.test.tsx`, `KpiTab.test.tsx` (the
four states), `page.test.tsx` (the fifth tab, no receivables chrome on KPI, `?tab=kpi` opens it
and only then), `listTabs.test.ts` (KPI is the fifth and last tab, no Status filter).

In the same commit (CLAUDE.md):

- **`permissionPageData.ts`:** a new row "Collection KPIs": administrator and accountant
  `read`; account manager, developer, viewer, driver and maintainer `none` (the Accountant page
  is for accountants and administrators). The accountant blurb gets one sentence about the KPI
  tab. `permissionPageData.test.ts` pins the exact texts, so it is updated with them.
- **`dataDictionary.ts`:** a new rule "Days to collect (KPI)" under Accounts receivable, with
  C1-C12 in short, `source` pointing at `collectionDays.ts` and `kpiAverages.ts`. No new table
  or column, so `dataDictionary.columns.test.ts` is not affected.

Final report (Definition of Done): `npm run tc`, `npm run test`, `npm run lint` on the touched
files only (the repository lint gate is red at baseline), and e2e `SKIPPED` (not run locally by
the user's rule).

## 6. Not defined (agreed later, not decided here)

More KPIs on the tab: the user said "for now two values", so the tab's layout is two cards and
nothing is reserved for others. A list of the payments behind a number, a per-manager or
per-office split, a CSV of the payments, a comparison with a previous range, and a stored
history of the numbers are not asked for and not part of this spec.

## 7. What differs from the text above (implementation, 2026-11-27)

- **C6 changed.** The approved text took the latest payment that added money to the row
  (`byPayment[].parts` above 0). A test of E10 with a refund and a payment that are not aimed at
  the row failed: `allocatePayments` credits an unaimed refund and an unaimed payment that
  cancel out to the first payment, so the day came out as Nov 5 instead of Nov 10, against D1.
  The day is now found by replaying the payments in arrival order and asking `allocatePayments`
  after each one (§1 C6). E1 to E6 give the same results; E10 is new. The function runs once
  per payment of an event that has a collected row, which is a handful.
- **C8 is in `kpiForRange`**, not in `collectedPayments`, as the type `CollectedPayment` says
  (`days` can be negative). §2.2 had put C1-C8 under `collectionDays.ts`. C1 is the events
  query (`buildKpiEventsQuery`).
- **`KpiInstallmentRow` is a flat object type**, not an intersection: `expect<T>()` compares
  the query's result with the type exactly. The fields are the same.
- **The error state** replaces the cards with the message, as the Audit list does, so `detail`
  is left out only while loading.
- **Exports for tests.** The five query builders of `useKpiData.ts` (`buildKpiEventsQuery`,
  `buildKpiLineTotalsQuery`, `buildKpiInstallmentsQuery`, `buildKpiPaymentsQuery`,
  `buildKpiFirstSignaturesQuery`) and the two hint texts of `KpiTab.tsx` (`DEPOSIT_HINT`,
  `FINAL_HINT`).
- **Other tests changed on purpose:** `page.test.tsx` (five tabs, were four, and the KPI block),
  `listTabs.test.ts` (KPI last), `filterUrlSync.test.ts` (`kfrom` and `kto` survive the page's
  own URL writes: this is how "the page keeps them" of §2.4 is checked without a browser),
  `permissionPageData.test.ts`, `dataDictionary.test.ts`, and the two Audit e2e specs that
  listed four tabs.
- **Counted files:** ten, as planned (8 new, `page.tsx`, `listTabs.ts`).
- **Checked:** `npm run tc` exit 0; the full `npx vitest run` passed (693 files, 10151 tests,
  the new KPI tests among them); Prettier clean on the touched files. **Not done:** e2e S1-S12
  are written and not run (project rule; the admin user is absent locally); no live browser
  check (the Browser pane cannot run PowerSync), so the look of the tab and the live update
  of D7 are unseen in a real browser.
