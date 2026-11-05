# Event change log 03: status change on PowerSync, with the Lost reason

Status: **DRAFT 2026-11-05, waiting for "Approved"**. 0 open decisions; readings to confirm in §1.
Build order: **03 of 07**. Needs: [01](event-change-log-01-payment-recorded.md) (the `eventLogInsert`
row builder). Needed by: nothing.
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

This spec is the third: the **status button** on the quote's Contract tab. Today
`changeQuoteStatus` updates `Events` through the local database and then writes the Log row with a
direct Supabase request. Offline, or if that request fails, the status is changed and the row is
lost (only `console.error`). The row also says nothing about the Lost reason and note.

## 1. What this spec decides

**D6 (plan §3): the reason goes inside the status row.**

- **Question:** how the Lost reason and note are written when the status becomes Lost.
- **Options:** separate rows as the Edit page writes them; inside the status row.
- **User's answer:** inside the status row. Example: "quoted → lost (Price too high)".

**D10 (plan §3): the row moves to PowerSync.** The status update and its row are one local
transaction.

**Readings to confirm:**

- **R1:** the row text. Going to Lost: `prev_value` is the old status, `next_value` is
  `lost (<reason>)`, where `<reason>` is `formatLostReason(reason, note)`: "Price too high", or
  "Other: <the note>" for the reason Other. Any other status: `next_value` is the status, as now.
- **R2:** leaving Lost writes the plain previous status (`lost`), without the old reason. The
  reason is cleared in the data, as today, and is not written as a change.
- **R3:** the list line of a status row stays as it is now (the title only). The reason is read in
  the row's detail window, where "New Status" shows `lost (Price too high)`.
- **R4:** `triage` and the finance notice keep their direct calls and their order: after the write.
- **R5:** the function keeps its signature `changeQuoteStatus(params, supabase, userId)`, because
  `triage` still takes the client. `QuoteStatusButton.tsx` does not change.
- **R6:** `permissionPageData.ts` is not edited: who may change a status is unchanged.

## 2. Research findings

- `changeQuoteStatus.ts` updates `Events` (status, the Lost fields, `booked_at`) with
  `typedExecute`, then calls `logSingleChange(supabase, ..., "event_status", from, to,
"status_change")`, which inserts through Supabase and only logs an error to the console.
- `normalizeLostFields` decides what is written to `lost_reason` and `lost_reason_note`: the reason
  only for Lost, the note only for the reason Other, null otherwise.
- `formatLostReason(reason, note)` already makes "Price too high" and "Other: <note>".
- `LogTab.tsx` draws a `status_change` row as "Status Changed: Status" and, in the detail window,
  "Previous Status" and "New Status" from `prev_value` and `next_value`. It finds a deletion by
  `field_name = "deleted"` with `status_change`; a status row has `field_name = "event_status"`.
- The Edit page already writes `lost_reason` and `lost_reason_note` as rows of their own; it does
  not change in this spec.

## 3. Design

**`changeQuoteStatus`.**

1. `assertStatusTransition` and the `from === to` return, as now. `booked_at` as now.
2. `const lost = normalizeLostFields({...})`.
3. The row's `next_value` is the new status; for Lost it is `lost (` + `formatLostReason(
lost.lost_reason, lost.lost_reason_note)` + `)`.
4. One `typedExecuteBatch([updateEvents, eventLogInsert({ eventId, changedByUserUuid: userId,
fieldName: "event_status", prevValue: from, nextValue, actionType: "status_change" })])`.
5. Then `triage(...)` and the finance notice, as now.

`logSingleChange` is no longer called here. It stays for `softDeleteEvent` (plan D9) and for the
contract signature route.

No database change, no sync rules change, no change to `LogTab.tsx`.

## 4. Behaviour scenarios (Playwright, written, not run)

- **S1:** an admin changes Quoted to Booked; the Log has one "Status Changed" row, Quoted to Booked.
- **S2:** an admin marks a quote Lost with the reason Price too high; the row's detail window shows
  `lost (Price too high)` as the new status.
- **S3:** the reason Other with a note; the detail window shows `lost (Other: <note>)`.
- **S4:** the quote goes back from Lost to Quoted; the row shows `lost` to `quoted` and the
  quote's page no longer shows a Lost reason.
- **S5:** a status picked to the same value writes nothing.

## 5. Tests (Vitest)

- `changeQuoteStatus.test.ts` (new): one transaction of two statements; the row's values for a
  normal change, for Lost with a reason, for Other with a note, and for leaving Lost; `booked_at`
  rules unchanged; a forbidden transition throws before any write; the same status writes nothing;
  `supabase` is not used to write the Log; `triage` and the finance notice are still called, after
  the write.

## 6. Files

Production, 1: `db/changeQuoteStatus.ts`.
Tests: `db/changeQuoteStatus.test.ts` (new), `e2e/statusChangeLog.admin.spec.ts` (new).

## 7. Edge cases and error handling

- **Offline.** The status and its row are saved locally together and uploaded later; before, the
  row was lost.
- **Upload refused.** The connector discards the transaction: no status change and no row.
- **No user id.** The row is written with a null author ("System"), as an unknown user is today.
- **A second click while saving.** `QuoteStatusButton` already disables the control while saving.
- **Two devices change the status at once.** Each writes its own row; the last upload wins the
  status, as today.

## 8. Out of scope

- The Edit page's status and Lost rows (spec 04 moves them). Responded / Awaiting response
  (plan D1). Delete quote (plan D9). Changing `LogTab`'s list line for status rows (R3).
