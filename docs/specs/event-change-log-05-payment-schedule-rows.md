# Event change log 05: the Edit page, Payment Schedule rows

Status: **DRAFT 2026-11-05, waiting for "Approved"**. 0 open decisions; readings to confirm in §1.
Build order: **05 of 07**. Needs: [04](event-change-log-04-edit-fields-line-items-local.md) (the
`updateQuoteEvent` that passes the user and the three-group save) and
[01](event-change-log-01-payment-recorded.md) (`eventLogInsert`). Needed by: nothing.
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

This spec is the fifth: a change to the **Payment Schedule** (the installments) on the Edit page
is not written to the Log at all. The user took it in although the Edit page is not one of the two
audited pages.

## 1. What this spec decides

**D7 (plan §3): a row per installment.**

- **Question:** how a schedule change is recorded. Each installment has a due date and a percentage.
- **Options:** a row per installment (added, removed, changed); one row per save with the whole
  schedule before and after.
- **User's answer:** a row per installment.

**D8 (plan §3): the schedule and its rows are one transaction**, the third of the three.

**Readings to confirm:**

- **R1:** the action types are `schedule_add`, `schedule_remove`, `schedule_change`; the
  `field_name` is `payment_schedule`, labelled "Payment Schedule" in `FIELD_LABELS`.
- **R2:** an installment is written as "Due Aug 31, 2026 · 50%". An empty due date is "No date".
  The percentage is `percentage_bps / 100`, with up to two decimals ("33.33%").
- **R3:** an added installment has its text in `next_value`, a removed one in `prev_value`, a
  changed one has the text before and after. The installment is matched by its id, as
  `diffSchedule` does.
- **R4:** a change that does not alter the text (only the stored currency differs) writes no row.
- **R5:** the titles are "Installment Added", "Installment Removed", "Installment Changed", drawn
  like the line item rows (➕ ➖ ✏️, green, red, amber).
- **R6:** creating a quote does not write schedule rows: its "create" row covers it.
  `syncPaymentInstallments` gets the Log only when the caller passes it, and `createQuoteEvent`
  does not.
- **R7:** the installments are now written in one transaction instead of one statement each.
- **R8:** `permissionPageData.ts` is not edited.

## 2. Research findings

- `syncPaymentInstallments(eventUuid, installments, currency)` reads the existing installments,
  calls `diffSchedule` (`toInsert`, `toUpdate`, `toDelete` ids), refuses a removal that holds
  money (`ScheduleBlockedError`), then runs one `typedExecute` per delete, update and insert.
- Callers: `updateQuoteEvent` and `createQuoteEvent`.
- `PaymentInstallments` columns used: `due_date`, `percentage_bps`, `currency`, `event_uuid`.
- `scheduleDiff.test.ts` covers the diff and the blocked removal; there is no test of the writes.

## 3. Design

**Types.** `ActionType` gains `"schedule_add" | "schedule_remove" | "schedule_change"`.
`FIELD_LABELS.payment_schedule = "Payment Schedule"`.

**`utils/scheduleLog.ts` (new, pure):**

```ts
export function buildScheduleRows(p: {
  eventId: string;
  changedByUserUuid: string | null;
  existing: ExistingInstallment[];
  diff: ScheduleDiff;
}): EventLogRow[];
export function describeInstallment(i: { dueDate: string; percentageBps: number }): string;
```

**`syncPaymentInstallments(eventUuid, installments, currency, log?)`** with `log = {
changedByUserUuid: string | null }`. After the blocked-removal check, one `typedWriteTransaction`
runs the deletes, updates and inserts and then the rows of `buildScheduleRows` (when `log` is
given). `updateQuoteEvent` passes `{ changedByUserUuid: currentUserUuid ?? null }`.

**`LogTab.tsx`.** `ACTION_CONFIG` for the three types; `getTitle` per R5; the list line and the
detail window show the text like `line_item_add`, `line_item_remove` and `line_item_change`.

No database change and no sync rules change.

## 4. Behaviour scenarios (Playwright, written, not run)

- **S1:** a 50 / 50 schedule becomes 30 / 70; two "Installment Changed" rows.
- **S2:** a third installment is added; one "Installment Added" row.
- **S3:** an installment with no money is removed; one "Installment Removed" row.
- **S4:** Save with the schedule untouched writes no schedule row.
- **S5:** removing an installment that holds a payment is refused as today; no schedule row, no
  schedule change.
- **S6:** a new quote with a schedule has the "create" row and no schedule rows.

## 5. Tests (Vitest)

- `scheduleLog.test.ts` (new): add, remove, change, a currency-only change (no row), the date and
  percentage wording, no date, fractional percentages.
- `paymentInstallments.log.test.ts` (new): the writes and the rows share one transaction; none
  without `log`; a blocked removal writes nothing; no rows when nothing changed.
- `LogTab.test.ts`: titles and details of the three types.

## 6. Files

Production, 5: `utils/scheduleLog.ts` (new), `db/paymentInstallments.ts`,
`db/updateQuoteEvent.ts`, `db/logEventChanges.ts` (`ActionType`, `FIELD_LABELS`),
`components/quoteDetail/tabs/LogTab.tsx`.
Tests: the three of §5, and `e2e/scheduleLog.admin.spec.ts` (new).

## 7. Edge cases and error handling

- **Offline.** The schedule and its rows are saved locally and uploaded together.
- **Upload refused.** The connector discards the transaction: no schedule change, no rows. The
  other two groups of the save are unaffected (plan D8).
- **ScheduleBlockedError.** Thrown before the transaction: nothing of the schedule is written; the
  editor keeps the draft.
- **Percentages that do not add to 100.** The editor's own validation runs first; the Log records
  what was saved.
- **No user id.** A null author, as in spec 04.

## 8. Out of scope

- A row for the contract total changing because the schedule is by percentage (the total's own row
  exists in spec 04's fields).
- Schedule rows on quote creation (R6). Filling in old schedules (plan D11).
