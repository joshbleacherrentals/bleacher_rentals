# Event change log 01: payment recorded

Status: **APPROVED and IMPLEMENTED 2026-11-05, uncommitted**. 0 open decisions; readings R1 to R7 of §1 confirmed.
Build order: **01 of 07**. Needs: nothing. Needed by: 02 to 05 use the row builder this spec adds.
Plan: [event-change-log-plan.md](event-change-log-plan.md). Branch: `q4-sprint3-finance`.

## 0. The change request of 2026-11-05 (the same in all seven specs)

The user asked to refactor the event change log (the `EventChangeLog` table, the Log tab of a
quote). The pages `/accountant/invoice?id={id}` and `/quotes-bookings/{id}` were audited for what
the Log does not record. The user took these decisions (plan §3):

- Must be recorded: Record payment, Upload file, Delete file, the Lost reason and note, a Stripe
  payment received, Payment Schedule changes on the Edit page.
- Not recorded, by the user's choice: Responded / Awaiting, Internal chat, New Task, QuickBooks
  Check again.
- The rows of a status change and of the Edit page move from a direct Supabase request to
  PowerSync. Delete quote stays a direct request.
- Seven small specs, one logic each. Old payments and files are not filled in.

This spec is the first: **Record payment** writes a Log row. The audit found that
`recordManualPayment` writes the payment and nothing else, on both pages: the Billing tab of
`/quotes-bookings/{id}` and the invoice page both open the same `RecordPaymentDialog`.

## 1. What this spec decides

**D3 (plan §3): the row shows amount, method and date.**

- **Question:** what the row says about the payment.
- **Options:** amount · method · date; plus payer and Applied to; plus Reference.
- **User's answer:** amount · method · date. Example: "Payment recorded: $100.00 · Check ·
  Aug 14, 2026". The payment's Notes are never written.

**Readings to confirm:**

- **R1:** the action type is `payment_add`, beside `payment_edit` and `payment_delete`, and the
  row's `field_name` is `payment:<payment id>` (the form spec accountant-quotes-09 D1 chose).
- **R2:** the row is written by `recordManualPayment`, in **the same transaction** as the payment,
  as `editManualPayment` does. If the server refuses the payment, the row is refused with it.
- **R3:** the date in the row is the payment's paid date (the day the user typed, as in "Paid
  date" of the form), not the day it was recorded. The Log's own time column says when.
- **R4:** a negative amount (a refund or a correction) is recorded the same way, with its minus
  sign: "Payment recorded: -$50.00 · Check · Aug 14, 2026".
- **R5:** the title shows the text saved in the row (`next_value`), not the payment as it is now,
  so an edit made later does not rewrite the history of the row. Edit and delete rows keep their
  own way of naming the payment.
- **R6:** `eventLogInsert` (§3) is added here as the one place that builds a Log insert. The
  hand-built inserts that exist (payment edit and delete, `is_qbo`, send) are not moved to it.
- **R7:** `permissionPageData.ts` is not edited. Nobody gains or loses an ability: Record payment
  stays admin and accountant, the Log is read by the same four roles.

## 2. Research findings

- `recordManualPayment.ts` runs one `typedExecute` with an insert into `PaymentHistory`. It
  already guards the amount (not zero, not above the limit) and the author before the write.
- `editManualPayment.ts` and `deleteManualPayment.ts` write the payment change and the Log row in
  one `typedExecuteBatch`, because the connector discards a whole transaction it is refused.
- `describePaymentForLog` (`utils/paymentEdit.ts`) already words a payment as "$100.00 · Check ·
  Aug 14, 2026". `paymentLogFieldName(id)` makes `payment:<id>`.
- `LogTab.tsx` titles `payment_edit` and `payment_delete` through `paymentLogLabel`, which looks
  the payment up in the current list. A row it does not know is drawn as "Updated: <field_name>".
- `EventChangeLog` insert policy is open to any signed-in user, so an accountant's row is accepted.
  The accountant's PowerSync stream already carries `EventChangeLog`.

## 3. Design

**Types.** `ActionType` in `db/logEventChanges.ts` gains `"payment_add"`.

**The row builder** `db/eventLogInsert.ts` (new):

```ts
export type EventLogRow = {
  eventId: string;
  changedByUserUuid: string | null;
  fieldName: string;
  prevValue: string | null;
  nextValue: string | null;
  actionType: ActionType | `client_${string}`;
  /** ISO; defaults to now. */
  changedAt?: string;
};

/** The compiled insert of one Log row, for `typedExecute` or `typedExecuteBatch`. */
export function eventLogInsert(row: EventLogRow): CompiledQuery<unknown>;
```

It writes `id` (a new uuid), `event_uuid`, `changed_by_user_uuid`, `field_name`, `prev_value`,
`next_value`, `action_type`, `changed_at` (the given time, or `new Date().toISOString()`).

**`recordManualPayment`.** The id is made first (`const id = crypto.randomUUID()`), and one
`typedExecuteBatch` writes two statements: the `PaymentHistory` insert as now, and
`eventLogInsert({ eventId, changedByUserUuid: recordedByUserUuid, fieldName:
paymentLogFieldName(id), prevValue: null, nextValue: describePaymentForLog({...}), actionType:
"payment_add" })`. The description is built from what is being written: the amount, the currency,
the method, `entrySource: "manual"`, the paid date. The guards before the write stay.

**`LogTab.tsx`.**

- `ACTION_CONFIG.payment_add`: icon 💳, green, label "Payment recorded".
- `getTitle`: for `payment_add`, `"Payment recorded: " + (row.next_value ?? paymentLogLabel(...))`.
- `getDetail`: `null` for `payment_add` (the title carries it).
- `ChangeDetailModal`: for `payment_add`, one block "Recorded payment" with `next_value`, drawn
  like "Deleted payment" in green.

No database change, no PowerSync table change, no sync rules change.

## 4. Behaviour scenarios (Playwright, written, not run)

- **S1:** an admin records a $25.00 check on the Billing tab; the Log tab lists "Payment recorded:
  $25.00 · Check · <date>" with the admin's name.
- **S2:** an accountant records a payment on the invoice page; the same row is on the quote's Log.
- **S3:** a negative amount is recorded; the row shows the minus sign.
- **S4:** a payment is edited after it was recorded; the "Payment recorded" row keeps its original
  text and a "Payment edited" row is added above it.
- **S5:** a role without Record payment (account manager) has no button and so no row.

## 5. Tests (Vitest)

- `eventLogInsert.test.ts` (new): the columns and values; a given `changedAt` is kept; nothing
  given means a time near now; each call makes a new id.
- `recordManualPayment.test.ts`: one transaction of two statements; the payment id in the Log row's
  `field_name` is the id of the inserted payment; the author is `recordedByUserUuid`; the text is
  the description of the written values; a refund keeps its sign; a zero amount, a too-large
  amount and a missing author throw before anything is written.
- `LogTab.test.ts`: title and detail of `payment_add`; the title does not change when the payment
  list changes.

## 6. Files

Production, 4: `db/eventLogInsert.ts` (new), `db/recordManualPayment.ts`, `db/logEventChanges.ts`
(`ActionType` only), `components/quoteDetail/tabs/LogTab.tsx`.

Tests: the three of §5, and `e2e/paymentRecordedLog.admin.spec.ts`,
`e2e/paymentRecordedLog.accountant.spec.ts` (new).

## 7. Edge cases and error handling

- **Offline.** The payment and its row are written to the local database and uploaded together
  later; the row shows in the Log at once.
- **Upload refused (RLS, a CHECK).** The connector discards the transaction: no payment and no
  row. This is how a payment that is refused has no row.
- **Double click.** The dialog already chains its writes, so one click makes one payment and one row.
- **Signed out or no user id.** `recordedByUserUuid` missing throws before the write, as now.
- **Another currency.** The row is worded in the payment's own currency.

## 8. Out of scope

- The edit and delete rows (they exist). The Stripe payment row (spec 06). A row for the payment's
  Notes. Filling the Log for payments recorded before the release (plan D11).
- Moving the other hand-built inserts to `eventLogInsert` (R6).
