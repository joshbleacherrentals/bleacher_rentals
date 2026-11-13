# Event change log 07: the QuickBooks invoice row

Status: **DRAFT 2026-11-05, waiting for "Approved"**. 0 open decisions; readings to confirm in §1.
Build order: **07 of 07**. Needs: nothing. Needed by: nothing.
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

This spec is the seventh: a small fault found on the way. The row that Create invoice and Update
invoice leave in the Log (`logInvoiceChange`, field `qbo_invoice`) always has the previous value
"None", also for an update of an invoice that already existed.

## 1. What this spec decides

**D12b and D14 (plan §3): an update has no previous value.**

- **Question:** what the row says before the arrow when the invoice is updated. The invoice number
  is always the quote's invoice number, so "the previous number" would equal the new one.
- **Options:** "Invoice {number}" as the previous value; leave "None".
- **User's answer, in their words:** for a QuickBooks update, write that the invoice was updated,
  without a previous value.

**Readings to confirm:**

- **R1:** "update" means the two results of the Update invoice button, `updated` ("Updated
  (invoice 123)") and `linked` ("Linked and updated (invoice 123)"). `created` ("Created (invoice
  123)") and `recreated` ("Created again (the previous invoice was not found)") keep "None", because
  an invoice is made.
- **R2:** "no previous value" is a null `prev_value`, not a text.
- **R3:** the Log tab draws a `qbo_invoice` row with a null `prev_value` as the new value alone:
  in the list "Updated (invoice 123)" with no "— →" in front, and in the detail window only the
  "New" block, over the full width. Every other row is drawn as now.
- **R4:** old rows keep "None" (plan D11); only new ones change.
- **R5:** `permissionPageData.ts` is not edited.

## 2. Research findings

- `quickbooks-integration/invoice/logInvoiceChange.ts`: `logInvoiceChange({ eventId, userUuid,
kind, docNumber })` writes `field_name: "qbo_invoice"`, `prev_value: "None"`, `action_type:
"update"` and a `next_value` per `kind`, with the service role. `createInvoice.ts` and
  `updateInvoice.ts` call it.
- It is documented in [qbo-invoice-04-create.md](qbo-invoice-04-create.md) §6 and
  [qbo-invoice-05-update.md](qbo-invoice-05-update.md) §6 ("`prev_value` 'None', as `created`
  does"). This spec changes that sentence for the update kinds.
- `LogTab.tsx` draws an `update` row's list line as `formatValue(prev) → formatValue(next)` when
  either is set, and the detail window has a "Previous" and a "New" block. `formatValue(null)` is "—".

## 3. Design

**`logInvoiceChange.ts`.** `prev_value` is `"None"` for `created` and `recreated`, and `null` for
`updated` and `linked`. Nothing else changes: the texts of `NEXT_VALUES` and the `is_qbo` row
(`logIsQboSet`) stay.

**`LogTab.tsx`.** In the list line and in `ChangeDetailModal`, a row whose `field_name` is
`qbo_invoice` and whose `prev_value` is null shows the new value only (R3).

The two QuickBooks specs get a one-line note pointing to this spec; nothing else in them changes.

No database change and no sync rules change.

## 4. Behaviour scenarios (Playwright, written, not run)

- **S1:** Create invoice: the Log shows "None → Created (invoice N)" (unchanged).
- **S2:** Update invoice: the Log shows "Updated (invoice N)" with no previous value.
- **S3:** Update invoice that overwrites an invoice found by number: "Linked and updated
  (invoice N)" with no previous value.
- **S4:** the detail window of an update row shows only the new value.

## 5. Tests (Vitest)

- `logInvoiceChange.test.ts`: `prev_value` for each of the four kinds.
- `LogTab.test.ts`: the list line and the modal for a `qbo_invoice` row with and without a
  previous value; an ordinary `update` row with a null previous value is still drawn "— → …".

## 6. Files

Production, 2: `quickbooks-integration/invoice/logInvoiceChange.ts`,
`components/quoteDetail/tabs/LogTab.tsx`.
Tests: the two of §5, and `e2e/qboInvoiceLog.admin.spec.ts` (new; it needs QuickBooks to be
reachable, so it is written for the sandbox like the existing `qboInvoice*` specs).

## 7. Edge cases and error handling

- **Old rows.** Still "None → Updated (...)". They are not rewritten.
- **The Log insert fails.** Unchanged: `logInvoiceChange` throws and the route answers as it does today.
- **`is_qbo`.** Its row, "No → Yes", is unchanged.

## 8. Out of scope

- QuickBooks "Check again" (plan D1). The numbers of the invoice (they never differ).
- Rewriting old rows (plan D11).
