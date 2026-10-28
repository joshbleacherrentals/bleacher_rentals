# Accountant Collections 02: the Amount Due calculation in Postgres

Status: **Draft, written 2026-10-28, waiting for "Approved".** 0 open decisions; readings to
confirm in §1. Build order: **02**. Needs: nothing (it only reads existing tables). Needed by:
03, 04, 05. Branch: `q4-sprint2-collections`.

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

- The cron (spec 04) and the completion trigger (spec 05) must know an event's Amount Due inside
  PostgreSQL. The calculation exists today only in TypeScript, so it is **ported, not
  reinvented**: "do not create an alternative allocation algorithm that can give other results".
- The port is a set of SQL functions kept equal to the TypeScript by shared tests (spec 03).
  Not chosen: a simpler "due minus received" formula (it gives other numbers than the AR tab,
  for example 0 instead of 1000 when a customer prepaid the last installment while an earlier
  one is overdue); and a cron that only schedules a call to a TypeScript route (it cannot back a
  database trigger, and a network failure would leave tasks open).
- The one new rule is for an event with **no payment schedule** (§0 item 3): its whole balance
  falls due 7 days before `event_start`. Everything else is the existing rule.

**Readings to confirm at review:**

- "Created" in "an event created 0 to 7 days before the start" is read as **booked** (`booked_at`);
  the user wrote both words. For this spec only the condition "implicit due date <= today"
  matters, and a booking inside the 7 days already satisfies it. The reading changes only the
  days-overdue figure (specs 03 and 07).
- `event_start` is a date; the implicit due date is `event_start - 7`.
- The `PaymentInstallments.amount_cents` column is ignored; installment amounts come from
  `percentage_bps` and the event total, as in the TypeScript.
- Invalid inputs (a non-whole total, a negative `percentage_bps`) are not validated in SQL; the
  TypeScript throws on them, the SQL treats them as the schedule editor never produces them.

## 2. Research findings

The TypeScript to port, with the places that decide the numbers:

- **Total.** `eventTotalCents` in `utils/accountsReceivable.ts`: `lineTotal + tax`, where
  `lineTotal = Σ coalesce(quantity,1) × coalesce(value_cents,0)` over lines with `deleted = false`
  (`useAccountsReceivableData`), `tax = tax_amount_cents ?? Math.round(lineTotal × tax_percent /
100)`; then `Math.max(0, Math.round(total))`.
- **Schedule.** `resolvePaymentSchedule` (`utils/resolvePaymentSchedule.ts`): for each installment
  `value = total × percentage_bps / 10000` **in double precision**; if the percentages add to
  exactly 10000, amounts are floors plus one extra cent for the largest remainders
  (`value - floor(value)`, ties by due date then id) until the cents add to the total; otherwise
  each amount is `Math.round(value)`.
- **Allocation.** `allocatePayments` (`utils/allocatePayments.ts`): payments that are deleted
  (`deleted_at` set), not `succeeded`, or in another currency than the event's are not counted.
  Per installment, ordered by due date then id: targeted net = Σ counted payments whose
  `installment_id` is that installment; it is clamped to [0, nominal]; the excess and every
  untargeted payment (also one pointing at an installment of no event) go into a pool; a positive
  pool fills installments forwards up to nominal; a negative pool (a refund) un-fills backwards,
  newest first. **The order of the payments does not matter for the numbers needed here**, only
  their sums.
- **Amount Due.** `computeAmountDue` (`utils/computeAmountDue.ts`): `remaining = max(total -
received, 0)`; with a schedule, `Σ over installments with due_date <= today of max(0, nominal -
allocated)`; with none, the whole remaining; finally `min(overdue, remaining)`.
- **Currency.** `resolveOfficeCurrency` + `pickEventCurrency`: the office's `QboConnections.currency`
  when it is `CAD` or `USD` (trimmed, upper case), otherwise `CAD` if the office address's
  `state_province` is Canadian (`isCanadianProvince`), otherwise `USD`; no office, or an office
  that is deleted, gives `USD`. Provinces: codes AB BC MB NB NL NS NT NU ON PE QC SK YT; full
  names (Alberta, British Columbia, Manitoba, New Brunswick, Newfoundland and Labrador, Nova
  Scotia, Northwest Territories, Nunavut, Ontario, Prince Edward Island, Quebec, Saskatchewan,
  Yukon), compared case-insensitively after trimming; aliases `québec`,
  `newfoundland & labrador`, `newfoundland`, `p.e.i.`, `pei`.
- **Float traps for the port.** Use `double precision`, never `numeric`, wherever the TypeScript
  uses a JavaScript number (the remainders, the percentage maths). `Math.round(x)` is
  `floor(x + 0.5)`. Postgres `round()` on a negative half rounds the other way. Ids are compared as
  lower-case hex strings in JavaScript and as `uuid` here; the order is the same.
- **Tests that exist:** `allocatePayments.test.ts` (48 cases) and `accountsReceivable.test.ts`.
  They are the source of the SQL cases in §6.

## 3. The functions

`supabase/migrations/20261028130000_ar_amount_due.sql`. All `LANGUAGE plpgsql` (the helpers that
need no loops may be `sql`), `STABLE`, `SECURITY INVOKER`, `SET search_path = public`.
`ar_event_balances` and `ar_event_amount_due` also get `COST 1000`: Postgres does not promise the
order of `WHERE` conditions, and a high cost makes the planner run them after the cheap ones.
`REVOKE ALL ... FROM PUBLIC, anon, authenticated` on every one of them, so nobody can call them
over PostgREST; the cron and the triggers run as the owner.

- **`ar_is_canadian_province(p_value text) RETURNS boolean`** (`IMMUTABLE`): the rule above.
- **`ar_office_currency(p_office uuid) RETURNS text`**: `'CAD'` or `'USD'`, by the rule above.
- **`ar_event_total_cents(p_event uuid) RETURNS bigint`**: the total. Tax rounding is
  `floor(x::float8 + 0.5)`. Result is `greatest(0, ...)`. A missing event gives 0.
- **`ar_event_balances(p_event uuid, p_today date) RETURNS TABLE (total_cents bigint, received_cents
bigint, remaining_cents bigint, amount_due_cents bigint)`**, one row (all zeros for a missing
  event):
  1. total, currency;
  2. the event's installments ordered by `due_date, id`, with amounts by the schedule rule;
  3. counted payments (rule above), `received = Σ counted` (may be negative);
  4. allocation by the rule above (loop over the ordered installments, a forward walk for a
     positive pool, a backward walk for a negative one);
  5. `remaining = greatest(total - received, 0)`;
  6. with installments: `Σ greatest(0, nominal - allocated)` over `due_date <= p_today`;
     **without installments: `remaining` if `event_start - 7 <= p_today`, else 0**;
  7. `amount_due = least(that, remaining)`.
- **`ar_event_amount_due(p_event uuid, p_today date) RETURNS bigint`**: `amount_due_cents` of the
  above. This is what the cron and the triggers call.

`p_today` is always passed in (the callers pass Toronto's date, spec 04); the functions never read
the clock.

## 4. Tests

Red first. `supabase/tests/ar_amount_due.test.sql` and script `test:db:aramountdue` (added to
`test:db:all`). Rolled-back transaction; fixtures for an office, an event, line items,
installments and payments. Each case states the numbers computed by hand.

- **Total:** deleted lines ignored; `quantity` null counts as 1; tax from percent (a `.5` case
  rounds up); tax override wins; discounts bigger than items give 0.
- **Schedule:** three installments of 3333 / 3333 / 3334 bps on a total of 10001 (the extra cent
  goes by remainder, ties by due date); percentages that do not add to 10000 round each amount.
- **Allocation:** untargeted payments fill oldest first; **the worked example** (three
  installments of 1000 due Oct 1, Nov 1, Dec 1; today Nov 15; payments of 1000 aimed at the first
  and at the third) gives Amount Due 1000; an overpayment on one installment spills forwards; a
  refund un-fills the newest installment; a deleted payment, a `pending` payment and a payment in
  the other currency change nothing; a payment aimed at another event's installment is
  untargeted.
- **Boundary:** an installment due today is overdue; due tomorrow is not.
- **No schedule:** `event_start = today + 7` gives the whole remaining; `today + 8` gives 0; an
  event booked with `event_start = today + 3` gives the whole remaining; a part-paid event gives
  only what is left.
- **Currency:** QuickBooks `CAD`; QuickBooks empty with an Ontario address gives `CAD`; empty
  with Texas gives `USD`; no office gives `USD`; a deleted office gives `USD`.
- **Access:** `anon` and `authenticated` cannot execute any of the functions (42501).
- **Missing event:** all zeros.
- **Gate:** `npm run tc`, `npx vitest run`, `prettier --check` on touched files. E2E: SKIPPED (no
  UI).

## 5. Files

**Counted: 1 file** (limit 10): `supabase/migrations/20261028130000_ar_amount_due.sql` (new).
**Not counted:** `supabase/tests/ar_amount_due.test.sql`, `package.json` (the script). No
`AppSchema.ts`, no `database.types.ts` (functions are not typed in the app), no sync rules.

## 6. Edge cases and error handling

- **Cost.** The cron calls the function once per booked event. Each call reads five tables by
  `event_uuid`. Measure it in a rollback on a copy of real data and write the time in the pull
  request; check with `EXPLAIN` that `PaymentHistory` and `PaymentInstallments` are read by
  their `event_uuid` index.
- **A change in the TypeScript.** If someone later changes `allocatePayments`, `computeAmountDue`
  or `resolvePaymentSchedule`, spec 03's shared cases go red until the SQL is changed too.
- **A bad row.** A payment with a null `amount_cents` counts as 0; a null `percentage_bps` as 0.
- **Rolling back.** Dropping the functions is safe: nothing else depends on them until specs 04
  and 05 ship.

## 7. Out of scope

- The TypeScript twin and the parity tests (spec 03); the cron (04); the triggers (05).
- Changing `computeAmountDue`, the AR tabs or the public Pay tab.
- Days overdue, statuses and money display (specs 03, 07, 08).
