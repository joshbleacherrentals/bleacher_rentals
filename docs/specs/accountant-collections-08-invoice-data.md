# Accountant Collections 08: the invoice page data and its five statuses

Status: **Implemented 2026-10-29** (Approved by the user). Decisions taken during the build, both
written into §3: `isLoading` includes the currency (no `currencyResolved` field), and
`buildMoney(balances, lineTotalCents, taxPercent)` takes the Contract Subtotal as its second
parameter. Noted in the code, not in the contract: `notFound` is also true when the quote could not
be read (the output has no `error` field); a venue without an address shows no address (the
event's own address is used only when the event has no venue); a deleted contact is shown like any
other (the quote card does not mark it); the query-count test counts distinct queries (15), because
`useQuoteDetail` renders twice in a server render. Build order: **08**. Needs: [01](accountant-collections-01-backend.md),
[03](accountant-collections-03-ts-twin-and-parity.md),
[07](accountant-collections-07-collections-list.md) (date wording). Needed by: 09. Branch:
`q4-sprint2-collections`.

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

- **The status of an invoice** is calculated, never stored (user's words):
  - booked and paid in full: **Paid** (green);
  - booked, paid on schedule, nothing overdue, the next payment is tomorrow or later (not
    today): **Schedule** (purple);
  - booked with an overdue amount: **Collections** (red);
  - Lost: **Cancelled** (grey);
  - quoted, unsigned changes or draft: **Not active yet** (grey).
- The page shows (from the sketch): a header with the event name, "N days overdue", the status
  and the buttons; an invoice number and the Account Manager; the **Contact** and the **Finance
  Contact** cards, each with name, phone, email and the company's name, number and email;
  **Venue** (name, address); **Event** (start, end, type); **Money** (Contract Subtotal, Taxes,
  Total, Already paid, Remaining Payment, Current Overdue amount); the **Payment Schedule**
  (#, Due Date, Amount, Status, Paid at); the **Payment History** (#, Date, Amount, Method,
  Payer), with the Show deleted switch beside Record Payment; and on the Tasks tab the list of
  completed tasks and the current task.
- **Money definitions** (the sketch's tooltips): Contract Subtotal = total after discounts, no
  taxes; Total = after discounts and taxes; Already paid = funds credited as of now; Remaining
  Payment = Total - Already paid; **Current Overdue amount = Amount Due of the twin** (spec 03).
- No Finance Contact: the card is left out. A contact with no company: the company lines are left
  out (the sketch's two variants).
- **Payment History works as on the Billing tab** (user's words): the **Show deleted** switch sits
  next to Record Payment, off to begin with, and brings the deleted payments back into the table in
  place. Edit and Delete are **not buttons in the rows**: a click on a row opens the Billing tab's
  payment detail dialog (`PaymentDetailDialog`), and Edit and Delete are in that dialog. Stripe
  payments cannot be edited or deleted. No Send Email.
- An event with no open task still opens. A status is shown for every event.

**Readings to confirm at review:**

- Status by the order: Lost, then not booked (including a missing status), then booked: remaining
  0 is Paid (also a booked event whose total is 0), Amount Due above 0 is Collections, otherwise
  Schedule.
- Account Manager is the quote's creator, as on the quote card (`Events.created_by_user_uuid` to
  `Users`).
- "Company number" is `Companies.phone`; "Company email" is `Companies.email`.
- Venue address is the venue's address; an event with no venue shows the event's own address and
  no venue name.
- Taxes = Total - Contract Subtotal; the label shows the rate, `Taxes (15%)`, when
  `Events.tax_percent` is set, otherwise `Taxes`.
- "N days overdue" is the twin's `daysOverdue`; shown in the header only for Collections.
- Payment History numbers the rows listed from 1 in date order, oldest first. With Show deleted on,
  a deleted row is listed and numbered like the others, so the numbers have no gaps.
- Each completed task shows its **due date** in words (`3 days ago`): the table has no
  completion date. The list runs newest due date first.

## 2. Research findings

- **Reusable:** `useQuoteDetail` / `quoteDetailData.ts` already read the event, address, venue
  (id and name), contact, finance contact (name, email, phone) and the account manager (name);
  `usePaymentHistory`, `usePaymentInstallments`, `useEventCurrency`, `useOfficeCurrencies`;
  `formatMoney`; the money definitions in `BillingTab.tsx`.
- **Missing from them:** the contacts' companies (`Contacts.company_uuid` to `Companies`) and the
  venue's address (`Venues.address_uuid` to `Addresses`). Both tables are already synced to
  accountants (`sync_rules.yaml`).
- **Capabilities:** `useQuotesBookingsCapabilities()` answers `recordPayment` (admin and
  accountant) for Record Payment, Edit and Delete.
- **Payment method text and the manual / Stripe split** live in the Billing tab and its dialogs
  (`PaymentDetailDialog`, `RecordPaymentDialog`, `DeletePaymentDialog`).
- **The deleted-payment rules** are in `quotesAndBookings/utils/deletedPayments.ts`
  (`isDeletedPayment`, `withoutDeleted`); `allocatePayments` already leaves a deleted payment out
  of every figure. `PaymentDetailDialog` needs the payment row, the `allocation`, the currency, who
  recorded it and who deleted it (`BillingTab.tsx` resolves both names).
- **Watchers:** the project keeps the number of live queries per screen low
  (`docs/specs/slow-local-db-step1-split-watchers.md`, `quote-detail-reactive-plan.md`).

## 3. Design

All under `src/features/accountantCollections/`.

- **`utils/invoiceStatus.ts`** (new): pure.

  ```ts
  type InvoiceStatus = "paid" | "schedule" | "collections" | "cancelled" | "not_active";
  function invoiceStatus(input: {
    eventStatus: string | null;
    remainingCents: number;
    amountDueCents: number;
  }): InvoiceStatus;
  ```

  Rules in §1. Spec 09 maps each status to its label and colours.

- **`utils/invoiceView.ts`** (new): pure builders that turn the data into display rows, so the
  hook stays thin: `buildMoney(balances, lineTotalCents, taxPercent)` (`lineTotalCents` is the
  Contract Subtotal, the sum of the line items that the hook reads; `CollectionsBalances` has no
  such figure, and spec 03 stays as it is), `buildScheduleRows(allocation, currency,
timezone)` (status `Paid`, `Partial` with `X of Y`, `Unpaid`; `Paid at` only when paid),
  `buildPaymentRows(payments, showDeleted, ...)` (number, date and time, amount, method, payer,
  `isManual`, `isDeleted`, and the payment row itself for the dialog; deleted rows only when
  `showDeleted`),
  `buildTaskLists(tasks, today)` (the open task, the completed ones newest due date first, each
  with `followUpLabel`), `buildContactCard(contact, company)`.
- **`hooks/useInvoiceData.ts`** (new): reactive; input `eventId`; output

  ```ts
  { isLoading, notFound, event: { name, invoiceNumber, status, daysOverdue, accountManager },
    contacts: { contact, financeContact }, venue, eventInfo: { start, end, type },
    money, schedule, payments, allocation, staffNames, tasks: { open, completed }, currency, today }
  ```

  `payments` holds **every** payment row, deleted ones too; the page filters them with its
  Show deleted switch (spec 09), through `buildPaymentRows`. `allocation` and `staffNames` are what
  `PaymentDetailDialog` needs. The money, the schedule and the twin never count a deleted payment.

  It composes `useQuoteDetail(eventId)` with narrow queries for the companies of the two
  contacts, the venue's address, the tasks of the event, and the sums the twin needs (line total,
  installments, payments of the event), then calls `collectionsBalances` and `invoiceStatus`.
  `notFound` is true for a missing event. Use `useTypedQuery` and `expect<T>()`.

  **`isLoading` includes the currency** (user's decision, 2026-10-29): it stays true until
  `useEventCurrencyState(eventId).isResolved`, so the page (spec 09) is not drawn with the USD
  fallback. The output type has no `currencyResolved` field. `isResolved` turns true when the
  online QuickBooks currency fetch ends, with an error too (the office's province is the fallback
  then), so a slow or hanging connection means a longer wait.

  **Queries.** `useQuoteDetail` (6) plus: the contacts' companies (one query on `Contacts` joined
  to `Companies`), the venue's address, the tasks of the event, the line total, and the reused
  `usePaymentInstallments`, `usePaymentHistory`, `useEventCurrencyState`, `useUserNames`,
  `useEventTypeName` (`eventInfo.type` is the event type's name): 15 in all, plus the office
  currencies that `useEventCurrencyState` reads.

## 4. Tests

Red first.

- **`invoiceStatus.test.ts`:** a table with all five outcomes; `lost` with a balance is
  Cancelled; `quoted`, `draft`, `unsigned_changes` and a null status are Not active yet; booked
  with nothing left is Paid, also a total of 0; booked with an installment due today unpaid is
  Collections; booked with the next installment tomorrow and nothing overdue is Schedule; booked
  and part-paid on time is Schedule; a booked event with no schedule, 8 days before the start, is
  Schedule.
- **`invoiceView.test.ts`**, with the sketch's numbers (four installments of 3,235.75, the first
  paid, the second part-paid with 1,500.00): money lines, `Partial` text `C$1,500.00 of
C$3,235.75`, `Paid at`, payment rows (Stripe first, then check), a deleted payment hidden
  with `showDeleted` off and listed, flagged and numbered with it on, completed tasks newest due
  date first, the open task apart, contact cards with and without a company, with and without a
  finance contact.
- **`useInvoiceData.test.tsx`:** `notFound`; `isLoading` is true while the currency is not
  resolved; the query count stays small (at most the 15 of §3); a deleted event is
  still shown; the open task is the newest if two exist; `payments` includes a deleted
  payment while the money and Amount Due ignore it.
- **Gate:** `npm run tc`, `npx vitest run`, `prettier --check`. E2E: SKIPPED here (spec 09).

## 5. Files

**Counted: 3 files** (limit 10): `utils/invoiceStatus.ts`, `utils/invoiceView.ts`,
`hooks/useInvoiceData.ts` (all new). **Not counted:** their tests.

## 6. Edge cases and error handling

- **A missing event** (`notFound`): spec 09 shows "Invoice not found" with a link back.
- **A deleted event** still opens, with its status; nothing hides it.
- **Currency not yet known.** `isLoading` stays true until the office currency is resolved (see §3),
  so nothing is drawn in the USD fallback. If the QuickBooks currency fetch fails, the province
  decides and the page opens.
- **A contact without a name or a deleted contact.** The card shows what it has; a deleted
  contact is shown as on the quote card.
- **No account manager.** A dash.
- **Many payments.** Rendered in full; no paging.
- **Offline.** All reads are local.
- **A status from stale data** is corrected on the next sync; it is never stored.

## 7. Out of scope

- The screens and the colours (spec 09); the buttons' behaviour (06 and 09); Previous / Next (10).
- Editing contacts, venue or event data from this page.
