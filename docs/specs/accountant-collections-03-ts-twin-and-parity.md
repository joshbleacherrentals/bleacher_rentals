# Accountant Collections 03: the TypeScript twin and the parity tests

Status: **Implemented 2026-10-29.** Approved by the user. Build order: **03**. Needs:
[02](accountant-collections-02-sql-amount-due.md). Needed by: 07 and 08 (they call the twin); CI
keeps 02 honest. Branch: `q4-sprint2-collections`.

Deviations and choices the spec left open:

- The twin's function is named `computeCollectionsBalances` (§3 names the types, not the function).
- `toAllocatablePayment` (the mapping from a payment row to `allocatePayments`' input) is private in
  `accountsReceivable.ts`, which is not in §5's Files. The twin keeps its own copy of the five-line
  mapping; the invariant "with a schedule the figure equals the AR chain" in
  `amountDueParity.test.ts` catches a drift between the two.
- Without a schedule and with `event_start` null the Amount Due is 0, as in the SQL (a null date
  never compares true). The column is NOT NULL, so this only guards the type.
- "The date of `booked_at`" is the first ten characters of the stored string, with no timezone
  conversion (the twin's contract has no timezone). For an event booked in the 7-day window a
  `booked_at` near midnight UTC can therefore differ by one day from Toronto's calendar.
- A refund is a negative `amountCents`; the case type has no separate `refund` field.
- `amountDueCases.ts` also exports what the two readers share: `caseId`, `caseCurrency`,
  `toTwinInput`, `runTwin`, `HAND_CASES`, `FUZZ_SEED`, `FUZZ_COUNT`, `allAmountDueCases`.
- The generated file holds 354 cases (54 hand, 300 fuzz), 7216 lines. Prettier does not format
  `.sql`, so it was not run on it.

Mutation check (to record in the pull request), 2026-10-29: `clamp(targetedNet[idx], 0, ...)` →
`1` in `allocatePayments.ts` turned vitest red (11 tests, including the drift test); `v_start - 7`
→ `6` in a copy of the migration turned 3 pgTAP cases red (two hand, one fuzz) and
`greatest(r.net, 0::bigint)` → `1` in the allocation 80 cases. So each side turns a different
runner red. Each mutation was reverted (the SQL ones were only ever applied inside a rolled-back
transaction).

## 0. The feature in brief (the same in all ten specs)

This spec is one of a series of ten. Each is built in its own chat, so this section is
repeated in every spec.

**The series** (`docs/specs/`, in build order):

- **01** `accountant-collections-01-backend.md`: table `ArEventTasks`, RLS, sync rules,
  `AppSchema.ts`.
- **02** `accountant-collections-02-sql-amount-due.md`: the Postgres port of the Amount Due
  calculation.
- **03** `accountant-collections-03-ts-twin-and-parity.md`: the TypeScript twin and the shared
  tests that keep both equal.
- **04** `accountant-collections-04-cron.md`: the daily pg_cron job that creates tasks.
- **05** `accountant-collections-05-completion-triggers.md`: triggers that complete tasks
  (payment, Lost).
- **06** `accountant-collections-06-done-next-task.md`: the client write that completes the open
  task and creates the next one.
- **07** `accountant-collections-07-collections-list.md`: the Collections list (rows, filter,
  sort, URL state, date wording).
- **08** `accountant-collections-08-invoice-data.md`: the data of the invoice page and its five
  statuses.
- **09** `accountant-collections-09-design.md`: all screens, page access and the permissions
  matrix.
- **10** `accountant-collections-10-prev-next.md`: Previous Task and Next Task.

**Who.** Accountant, and Admin. Not Account Manager, Developer, Viewer, Maintainer or Driver.

**What.** Accountants chase overdue payments. The app lists the bookings whose payment is
overdue, each with one open task ("call the customer", "send an email"). The accountant does
that work outside the app, comes back, and either records the payment (the tasks then close by
themselves) or writes the next task with a new date. Pages: `/accountant?tab=collections` (a new
first tab on the Accountant page, opened by default) and
`/accountant/invoice?id=<event uuid>&tab=info|tasks` (new).

**The table `ArEventTasks`:** `id` (random uuid), `created_at`, `due_date` (date, not null),
`completed` (boolean, default false), `note` (text, not null, not empty), `event_uuid`. A task is
**open** while `completed = false`. An event has at most one open task.

**Where the work is.** Branch `q4-sprint2-collections`. Design: `docs/design/accountant-collections/`
(canvas source) and the author's sketch `docs/Untitled-2026-05-28-2029.excalidraw` (untracked).
Stack and rules: `CLAUDE.md`, `docs/POWERSYNC_ARCHITECTURE.md`.

**Decisions taken by the user (they hold for the whole series):**

1. **Eligible events:** status `booked`, not deleted, any start date. No other status gets tasks.
2. **Overdue.** A payment is overdue when its due date is today or earlier. Amount Due is the
   existing `computeAmountDue` rule: the unpaid part of each overdue installment, payments aimed
   at an installment stay on it, a refund un-fills the newest installment first, capped at the
   remaining balance. It is not the simpler "due minus received".
3. **Event with no payment schedule.** Its whole balance falls due 7 days before `event_start`.
   An event booked inside those 7 days is overdue at once. Days overdue count from 7 days before
   `event_start`; for an event booked inside those 7 days, from `booked_at`. This rule is only for
   Collections; the AR tabs and the public Pay tab keep their own.
4. **Creation.** pg_cron, every day at 05:20 UTC (00:20 or 01:20 in Toronto); "today" is Toronto's
   date. For each eligible event with Amount Due > 0 and no open task it adds one task: note
   `Remind the customer about payment`, due today. It runs whether or not anyone opens the app, and
   running it twice adds nothing.
5. **Completion by the system.** After any change to a payment row, if the event's Amount Due is
   0, every open task of that event is completed (manual payments and Stripe alike). An event that
   becomes Lost has its open tasks completed. An event that stops being `booked` in any other way,
   or is deleted, keeps its open tasks; they are only hidden. If Amount Due later rises again,
   nothing is created at that moment; the next 05:20 run creates the task.
6. **Done / Next Task** is one action: the event's open task is completed (even if its date has
   not come) and a new open task is created with the date and note typed in the modal. The modal
   opens with today + 2 days and the note `Follow-up needed`. The calendar offers today and later.
   After Save the accountant stays on the same page.
7. **Safety.** A partial unique index allows one open task per event; `note` must not be blank
   after trimming; `event_uuid` is a foreign key to `Events` with cascade; nobody can DELETE.
   "Due date is today or later" is checked in the interface only, never in the database.
8. **Collections list:** the open tasks of eligible events. Show Not Due Yet (off by default) adds
   tasks dated in the future. Columns: Name (event name), Next Follow Up, Payment Overdue, Task
   Notes, Amount Overdue. Default order: Next Follow Up, oldest first. Equal values follow a
   fixed chain (spec 07).
9. **Statuses** (header of the invoice page): Paid (green), Schedule (purple), Collections (red),
   Cancelled (grey), Not active yet (grey).
10. **Invoice page:** tabs Information and Tasks. Record Payment, and Edit and Delete of manual
    payments, reuse the Billing tab's dialogs. There is no Send Email button in this feature. An
    event with no open task still opens; Tasks then says "No open task".
11. **Previous / Next Task** follow the list's order; the neighbours are fixed when the invoice
    page opens.
12. **Out of scope for the series:** Send Email, assigning a task to another accountant, the PO
    number, search, filters and paging on the Collections tab, a Paid or Cancelled list.

## 1. What this spec decides

**From the user's own words (not options):**

- SQL and the app must give the same numbers, and the guarantee is **shared tests**: the same
  cases run against the TypeScript and against the Postgres functions of spec 02, and a change
  to one side without the other turns CI red (user's answer: "SQL function and shared tests").
- No new allocation algorithm. The TypeScript twin calls the existing functions.
- The no-schedule rule (§0 item 3) lives in the twin and in the SQL, and nowhere else. The AR
  tabs and the Pay tab keep `computeAmountDue` as it is.
- Days overdue: with a schedule, from the oldest installment that is not fully paid; without
  one, from 7 days before `event_start`, except that an event booked inside those 7 days counts
  from `booked_at` (user's answer).

**Readings to confirm at review:**

- With a schedule, the figure counts from the oldest installment that is **not fully paid and
  already due** (`due_date <= today`). If nothing is overdue the figure is empty.
- Without a schedule the start of the count is the later of `event_start - 7` and the date of
  `booked_at` (a null `booked_at` counts as `event_start - 7`). A start in the future, or an
  Amount Due of 0, gives an empty figure.
- Days are whole calendar days between two `YYYY-MM-DD` dates.
- The twin gets "today" from its caller. The screens pass the date in the timezone store
  (Toronto by default); the SQL gets Toronto's date. They agree unless an accountant changes the
  timezone selector; then a row may differ by one day around midnight from what the cron saw.

## 2. Research findings

- **The building blocks** are exported and tested: `eventTotalCents`, `withReceivableBalances`
  (`utils/accountsReceivable.ts`), `resolvePaymentSchedule`, `allocatePayments`,
  `computeAmountDue`. The twin only chains them.
- **Existing "differential" tests** compare two TypeScript paths in an in-memory SQLite
  (`quoteDetailData.differential.test.ts`); there is no TypeScript-against-Postgres test yet.
- **CI** runs `supabase test db` (pgTAP) on every file in `supabase/tests/`, so a generated pgTAP
  file is picked up with no CI change. Locally there is no host `psql` and no pgTAP: pipe the
  file into the Supabase container inside `BEGIN ... ROLLBACK` (project memory
  `sql-tests-via-docker-psql`).
- **Fuzz precedent:** `supabase/tests/driver-scorecard.fuzz.sql`.
- **Dates:** the AR code compares `YYYY-MM-DD` strings. `luxon` is available; plain UTC date
  arithmetic is enough for whole days and has no daylight-saving trap.

## 3. Design

**`src/features/accountantCollections/utils/collectionsBalances.ts`** (new):

```ts
type CollectionsBalancesInput = {
  event: {
    event_start: string | null;
    booked_at: string | null;
    tax_percent: number | null;
    tax_amount_cents: number | null;
  };
  lineTotalCents: number;
  installments: ReceivableInstallmentRow[];
  payments: ReceivablePaymentRow[];
  currency: Currency;
  today: string; // YYYY-MM-DD
};
type CollectionsBalances = {
  totalCents: number;
  receivedCents: number;
  remainingCents: number;
  amountDueCents: number;
  overdueSince: string | null; // YYYY-MM-DD
  daysOverdue: number | null;
  allocation: Allocation;
};
```

Steps: `totalCents` as in `withReceivableBalances` (clamped, rounded); `resolvePaymentSchedule`;
`allocatePayments`; with installments `computeAmountDue` unchanged; **without installments**
`amountDueCents = (event_start - 7 days <= today) ? remainingCents : 0`, then
`min(amountDue, remaining)`. `overdueSince` and `daysOverdue` as in §1.

**`utils/calendarDays.ts`** (new): `addDays(date, n)` and `daysBetween(from, to)` on `YYYY-MM-DD`
strings through UTC dates. Specs 07 and 08 reuse them.

**The shared cases** `utils/amountDueCases.ts` (new): an array of named cases. A case is an
office (QuickBooks currency, province), an event (`event_start`, `booked_at`, tax fields), line
items, installments (`due_date`, `percentage_bps`), payments (amount, currency, status, deleted,
target installment, refund), `today`, and **`expected` numbers written by hand**: total, received,
remaining, amount due. Cases are the SQL cases of spec 02 §4 plus: a partly paid overdue
installment, an overdue installment paid in full by a later payment, a refund after full payment,
a cent-split with three installments, a CAD event with a USD payment, an event whose only
payment is deleted. Hand numbers are the reference, so a bug copied into both sides is still
caught.

**The fuzz cases** `makeFuzzCases(seed, count)` (same file): a seeded generator (mulberry32) of
valid scenarios: 0 to 5 installments (percentages that add to 10000 most of the time, sometimes
not), 0 to 8 payments (targeted, untargeted, negative, deleted, foreign currency, non-succeeded),
0 to 4 line items, tax by percent or override, dates around `today`. Committed with seed 20261028
and 300 cases. Expected numbers come from the TypeScript twin.

**`utils/amountDueParitySql.ts`** (new): `buildParitySql(cases)` turns the cases into one pgTAP
file: per case, fixture inserts with ids derived from the case index, then one `is()` that
compares `(total, received, remaining, due)` from `public.ar_event_balances(event, today)` with
`expected`. It sets `plan(N)` and rolls back.

**`supabase/tests/ar_amount_due_parity.test.sql`** (generated, committed) and the script
`test:db:aramountdueparity` (added to `test:db:all`).

**The vitest test** `utils/amountDueParity.test.ts`:

1. every hand case: the twin equals `expected`;
2. every fuzz case: the twin's invariants hold (`0 <= due <= remaining`; `received` is the sum
   of counted payments; with a schedule the figure equals the AR chain's `amount_due_cents`;
   without one it is 0 or `remaining`);
3. **drift:** `buildParitySql(allCases)` equals the committed file byte for byte. Regenerate with
   `UPDATE_PARITY=1 npx vitest run amountDueParity` (the test writes the file instead of
   comparing). A change to `allocatePayments` or to a case that is not followed by a
   regenerated file, and by the SQL that makes it pass, fails here or in `supabase test db`.

## 4. Tests

Red first. Besides the parity test above:

- **`calendarDays.test.ts`:** month and year ends, leap day, negative `n`, `daysBetween` signs.
- **`collectionsBalances.test.ts`:** a schedule gives the same `amountDueCents` as
  `withReceivableBalances`; no schedule, start in 7 days: whole remaining; in 8 days: 0; booked
  inside the window: `daysOverdue` counts from `booked_at`; booked earlier: from `start - 7`;
  amount due 0 gives null days; the oldest overdue installment decides `overdueSince`; a part
  payment on the oldest keeps it as the start; a null `booked_at`.
- **Mutation check:** change one number in `allocatePayments.ts` and in the SQL in turn;
  each must turn a different side red. Record this in the pull request.
- **Gate:** `npm run tc`, `npx vitest run`, `prettier --check` on touched files (not on the
  generated SQL if Prettier does not format `.sql`). E2E: SKIPPED (no UI). The pgTAP file is run
  through the Docker pipe locally and by `supabase test db` in CI.

## 5. Files

**Counted: 4 files** (limit 10), all under `src/features/accountantCollections/utils/`:
`collectionsBalances.ts`, `calendarDays.ts`, `amountDueCases.ts`, `amountDueParitySql.ts` (new).

**Not counted:** their tests, `amountDueParity.test.ts`, `supabase/tests/ar_amount_due_parity.test.sql`
(generated), `package.json`.

## 6. Edge cases and error handling

- **Fuzz must stay inside the valid domain** (whole-number cents, non-negative `percentage_bps`),
  because the twin throws on the rest and the SQL does not check.
- **A fuzz failure means the SQL is wrong**, never "regenerate": the TypeScript is the reference.
  Only a deliberate change of a rule regenerates the file.
- **Cents split ties** must appear in the hand cases, because they are the only place where a
  float comparison could differ between JavaScript and Postgres.
- **Timezone** (§1, last reading): not a calculation bug; call it out in the screens' help text
  only if the user asks.

## 7. Out of scope

- The Postgres functions (02), cron (04), triggers (05).
- The list, the invoice data and the screens (07 to 09), though they import this twin.
- Moving the AR tabs or the Pay tab onto the twin.
