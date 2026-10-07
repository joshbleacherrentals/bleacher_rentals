# Payments — edit, delete and "Show deleted" on the Billing tab

Status: **IMPLEMENTED 2026-10-04, awaiting review** — not checked by hand in a browser (Clerk
sign-in is unavailable here); Playwright specs written, not run. 0 open decisions (D1–D7 answered 2026-10-03;
the behaviour of §0 comes from the request). Approved 2026-10-04 with three answers: the line under the table
(1 A), "Applied To" for a deleted payment (2 A), §7 and R2 corrected (3 A).
Original request: №6, part 3 of 3. Implementation order: **09 of 11**. Needs
[07](accountant-quotes-07-payments-soft-delete-db.md) (the database rules) and
[08](accountant-quotes-08-payments-readers-skip-deleted.md) (the readers skip deleted rows), and
[03](accountant-quotes-03-capabilities.md) / [06](accountant-quotes-06-am-read-only-payments.md) (the `recordPayment`
capability: admin only).
Branch: `q4-sprint1-finance-role`.
Builds on: [manual-payment-entry.md](manual-payment-entry.md). **This spec replaces its rule** that a payment is
"read-only by design … corrected with an offsetting row": a manual payment can now be edited and deleted.

## 0. The request, and what it is not

On the Billing tab of a quote or booking:

- **Open a payment** (the existing dialog). If the user may write payments and the payment is a **manual** one that
  is **not deleted**, the dialog has an **Edit** button and a **Delete** button. **A payment is editable only
  after Edit is pressed.**
- **Edit** opens the payment's fields in a form (the same fields and rules as recording a payment: amount, paid
  date, method, payer, reference, notes, the installment it is applied to) and saves the change.
- **Delete** asks for a **reason** (required, not empty after trimming) and soft-deletes the payment.
- **Stripe payments have neither button** — they cannot be edited or deleted.
- A **"Show deleted"** switch sits next to **+ Record Payment**. Off: deleted payments are hidden. On: they appear
  (D5). It is visible to **every role that reads payments** (spec 08, D3); a deleted payment never counts in any
  total.
- The Edit and Delete buttons exist **only for users who may write payments** — today an admin (specs 06, 07); the
  accountant joins in spec 10.

**Not part of this spec, so not changed:**

- the database rules (spec 07), the readers (spec 08), the accountant's rights (spec 10);
- recording a payment (its dialog keeps working as it does, with one internal change for edit mode, D3);
- the public pages, the PDF and AR — they already skip deleted rows (spec 08);
- restoring a deleted payment (not possible, spec 07 D4).

## 1. Decisions (all taken by the user)

**D1 — how an edit or a delete is written to the change log**

- **Question:** `EventChangeLog` (written by the app, as for `is_qbo`) has `action_type`, `field_name`,
  `prev_value`, `next_value` and no column for a payment's id; `LogTab` draws rows by `action_type`.
- **Option A — two action types, a text summary:** `payment_edit` and `payment_delete`, `field_name = "payment"`,
  values are human-readable text; the payment is recognised only from the text. **Option B — one row per changed
  field,** with new field labels; the payment is identified only by time and author. **Option C — the payment's id
  in `field_name`** (`payment:<id>`); `LogTab` looks the payment up and shows its label.
- **User's answer: C — the payment's id in `field_name`.**

**D2 — one capability or several for payments**

- **Option A — three:** `recordPayment`, `editPayment`, `deletePayment`. **Option B — one:** `recordPayment` governs
  recording, editing and deleting.
- **User's answer: B — one capability, `recordPayment`.**

**D3 — how the edit form is built**

- **Option A — shared fields component and two dialogs.** **Option B — one dialog with a `mode`** (`record` or
  `edit`) and an initial payment; conditions on the mode for the title, the button and the write.
  **Option C — a separate copy,** `EditPaymentForm`.
- **User's answer: B — one dialog with a `mode`.**

**D4 — how many steps deleting takes**

- **Option A — only the reason prompt:** a small dialog asks for the reason; its Delete button is disabled while
  the reason is empty; pressing it deletes. **Option B — the reason and a confirmation:** one more "Delete for
  good? This cannot be undone" step.
- **User's answer: A — only the reason prompt.**

**D5 — where deleted payments appear when "Show deleted" is on**

- **Option A — in the same table:** between the others, greyed, struck through, with a "Deleted" badge.
  **Option B — a separate table** below the ledger.
- **User's answer: A — in the same table.**

**D6 — who sees the reason, the author and the time of a deletion in the dialog**

- **Option A — everyone who sees deleted rows.** **Option B — only those who write payments;** everyone else sees
  the row and the "Deleted" badge.
- **User's answer: B — only those who write payments.**

**D7 — what a deletion writes to the change log**

- **Option A — without the reason:** "Payment deleted" with a description of the payment, the author and the time;
  the Log tab is readable by every role with that tab. **Option B — with the reason:** every role that can open
  the Log tab then sees it, so D6 would hold for the dialog only.
- **User's answer: A — without the reason.**

## 2. Research findings

**Today's screens.**

- `PaymentDetailDialog` is **read-only by design**; its footer says "Payments cannot be edited or deleted. To
  correct one, record a negative amount — both entries stay visible." It shows payer, recorded by, reference,
  status, recorded on, currency, where the payment is applied, notes, the Stripe receipt link.
- `RecordPaymentDialog` holds a draft (`emptyDraft`), validates it with the pure `evaluateRecordPaymentForm`
  (`utils/recordPaymentForm.ts`) and writes with `recordManualPayment`; a write queue stops a double click from
  recording twice; the paid date is anchored at noon so a timezone does not move it.
- `BillingTab` draws "+ Record Payment" (when `can.recordPayment`, spec 06) and the history table; a row click opens
  the detail dialog. Spec 08 made it list `withoutDeleted(payments)`.
- `recordManualPayment` writes **both** `installment_id` and `intended_installment_id` with one choice; edit does the
  same.

**The log.** `LogTab` draws rows by `action_type` from a map (`create`, `update`, `sign`, `send`, `status_change`,
`line_item_*`) and takes labels from `FIELD_LABELS` (`db/logEventChanges.ts`, which also holds the `ActionType`
union). `EventChangeLog` has **no CHECK on `action_type`**, so new types need no migration; its INSERT policy is open
to every signed-in user.

**How the write reaches the server.** The app writes locally (PowerSync); the connector uploads each **write
transaction** and, when the server refuses it with `42501`, discards that **whole transaction** and shows "A change
could not be saved and has been discarded." Two separate writes are two transactions: a refused payment change
would leave its log row behind. So the payment change and its log row are written in **one** transaction.

**Database rules this spec relies on (spec 07):** only an admin updates; only manual rows; the editable columns
are the form's fields; a delete sets `deleted_at`, `deleted_by_user_uuid`, `delete_reason` and nulls
`installment_id`, nothing else; a deleted row is frozen.

## 3. What changes in the app

**The write functions** (new, local-first, each in **one PowerSync write transaction** with its log row):

- `db/editManualPayment.ts` — updates only the changed columns of a manual payment (amount, paid date, method,
  payer, reference, notes, both installment columns); inserts an `EventChangeLog` row: `action_type =
"payment_edit"`, `field_name = "payment:<id>"`, `prev_value` / `next_value` = text of the **changed fields only**
  ("Amount $100.00 · Method Check" → "Amount $120.00 · Method ACH"), `changed_by_user_uuid` = the caller.
- `db/deleteManualPayment.ts` — sets `deleted_at` (now), `deleted_by_user_uuid` (the caller), `delete_reason`
  (trimmed) and `installment_id = null`; inserts the log row: `action_type = "payment_delete"`, `field_name =
"payment:<id>"`, `prev_value` = a description of the payment (amount, method, date), `next_value` empty — **no
  reason** (D7).
- Both refuse locally what the database would refuse (a zero amount, an empty reason, a Stripe row, an already
  deleted row) before writing, as `recordManualPayment` does, because a refused upload is discarded silently.

**Pure helpers** — `utils/paymentEdit.ts` (new): which fields changed between a payment and a draft; the text of the
changed fields for the log; the `payment:<id>` field name and its parser; the description of a payment for the log
and for `LogTab`; the check "is this reason acceptable" (trimmed, not empty).

**The form** — `utils/recordPaymentForm.ts`: a draft can be built from an existing payment; the evaluation in edit mode
adds "nothing changed" (Save disabled) and does not need `currencyResolved` (the payment's currency never changes).
`RecordPaymentDialog.tsx` takes `mode` (`record` | `edit`) and, in edit mode, the payment: title "Edit Payment",
button "Save changes", write through `editManualPayment`, the payer field starts as the payment's own payer.

**The detail dialog** — `PaymentDetailDialog.tsx`:

- gets `canWrite` (= `can.recordPayment`);
- **Edit** and **Delete** buttons only when `canWrite`, the payment is manual and it is not deleted; **Edit** closes
  this dialog and opens the form in edit mode; **Delete** opens the reason prompt;
- a **deleted** payment: a "Deleted" notice; when `canWrite`, also **who deleted it, when, and the reason**; no
  buttons (D6);
- the footer text changes: for a manual payment the "cannot be edited or deleted" line goes; for a Stripe payment it
  reads "Stripe payments cannot be edited or deleted."

**What a deleted payment says in "Applied To"** (added 2026-10-04, "Approved, 2 A"). `allocatePayments` reports
a deleted payment as `excluded: "deleted"` (spec 08), which until now fell into the status sentence:

- the table's **Applied To** cell reads `Not counted (deleted)`;
- the detail dialog's **Applied To** section reads a sentence of its own, not the status one: "Not counted —
  this payment was deleted."

**The reason prompt** — `DeletePaymentDialog.tsx` (new): a short text area; its **Delete** button is disabled while the
reason is empty after trimming; it writes through `deleteManualPayment`; with a write queue against a double click
(D4). No further confirmation step.

**The tab** — `BillingTab.tsx`: the line under the table, "Payments cannot be edited or deleted. To correct one,
record a negative amount — both entries stay visible.", is false for a manual payment from now on. It becomes
"Stripe payments cannot be edited or deleted." and stays under the table (added 2026-10-04, "Approved, 1 A").
A **Show deleted** switch next to **+ Record Payment**, visible to every role that
reads payments, off at start, local to the tab (not in the URL); when on, the table lists deleted payments too, in
place (D5) — greyed, amount struck through, a "Deleted" badge; they never enter the allocation or any total (spec
08). It passes `canWrite` and the name of the user who deleted a payment (from `useUserNames`).

**The Log tab** — `LogTab.tsx` and `db/logEventChanges.ts`: `ActionType` gains `payment_edit` and `payment_delete`;
`LogTab` draws them ("Payment edited" with the changed fields' previous and next text; "Payment deleted" with the
payment's description), and resolves the label from the `payment:<id>` in `field_name` by finding the payment among
the event's payments; if it is not found it falls back to "Payment" with a short id.

**The capability table** — **no change** (D2): `recordPayment` already governs it.

**The matrix** — `src/features/userAccess/permissionPageData.ts` (draft wording, for review):

- **Record a Payment:** the description loses "A recorded payment can never be edited or deleted; a mistake is
  corrected by recording the same amount as a negative" and says: "Entering a payment that did not come through
  Stripe — a check, an ACH transfer, or a card run by hand on a terminal — and correcting it afterwards. A manual
  payment can be edited (amount, date, method, payer, reference, notes, installment) or deleted with a reason; a
  deleted payment stays on the record, no longer counts, and cannot be restored. Stripe payments cannot be edited
  or deleted. A negative amount is still how a refund or a bounced check is recorded."; the admin's note gains
  "Can edit and delete any manual payment on any quote or booking."
- **Payment History:** the description gains "A deleted payment is hidden unless Show deleted is on; the reason it
  was deleted is shown only to those who can record payments." The roles' levels do not change.
- `permissionPageData.test.ts` is updated where it asserts these rows.

## 4. Behaviour scenarios (for Playwright — written, not run)

- **S1** admin opens a manual payment: Edit and Delete are there; a Stripe payment has neither and says it cannot be
  edited or deleted.
- **S2** admin presses Edit, changes the amount and the installment, saves: the row, the received total, the
  installment's status and the AR figures change; the Log tab shows "Payment edited" with the previous and next
  text.
- **S3** Edit with nothing changed: Save is disabled; Cancel leaves everything as it was.
- **S4** admin presses Delete: the button is disabled until a reason is typed; a reason of spaces does not enable
  it; Delete hides the payment, the totals no longer include it; the Log tab shows "Payment deleted" **without**
  the reason.
- **S5** Show deleted on: the deleted payment appears in the same table, greyed and struck through with a "Deleted"
  badge; the totals are unchanged; opening it as an admin shows who deleted it, when and why, and no buttons; off
  again: it disappears.
- **S6** account manager and viewer: no Edit, no Delete; Show deleted is there; a deleted payment opens with a
  "Deleted" notice and **no** reason, author or time.
- **S7** after a deletion the installment the payment had been applied to can be removed from the schedule.
- **S8** a payment edited on a quote of another currency keeps its own currency.

## 5. Files

**Counted — 10 files** (limit 10):

1. `src/features/quotesAndBookings/components/quoteDetail/tabs/BillingTab.tsx` — changed
2. `src/features/quotesAndBookings/components/quoteDetail/tabs/PaymentDetailDialog.tsx` — changed
3. `src/features/quotesAndBookings/components/quoteDetail/tabs/RecordPaymentDialog.tsx` — changed: `mode`
4. `src/features/quotesAndBookings/components/quoteDetail/tabs/DeletePaymentDialog.tsx` — new
5. `src/features/quotesAndBookings/utils/recordPaymentForm.ts` — changed
6. `src/features/quotesAndBookings/utils/paymentEdit.ts` — new
7. `src/features/quotesAndBookings/db/editManualPayment.ts` — new
8. `src/features/quotesAndBookings/db/deleteManualPayment.ts` — new
9. `src/features/quotesAndBookings/components/quoteDetail/tabs/LogTab.tsx` — changed
10. `src/features/quotesAndBookings/db/logEventChanges.ts` — changed: `ActionType`

**Not counted:** `src/features/userAccess/permissionPageData.ts`; tests — `paymentEdit.test.ts`,
`editManualPayment.test.ts`, `deleteManualPayment.test.ts`, `PaymentDetailDialog.test.tsx`,
`DeletePaymentDialog.test.tsx` (new); `recordPaymentForm.test.ts`, `BillingTab.test.tsx`, `LogTab.test.ts`,
`permissionPageData.test.ts` (edited); the Playwright specs of §4 (new);
`src/features/quotesAndBookings/e2e/recordPayment.admin.spec.ts` (edited: its last test, "a recorded payment
offers no way to edit or delete it", looks for the old line under the table and for no Delete button; it
now asserts the Stripe line and that a manual payment opens with Edit and Delete — added 2026-10-04,
"Approved, 1 A"); no migration, `sync_rules.yaml`, `AppSchema.ts` or
`database.types.ts`.

## 6. Tests and implementation sequence

Red first; each step ends at a gate. Playwright is **written, not run**; Prettier only on touched files.

1. **Pure helpers.** `paymentEdit.test.ts` first: the changed fields between a payment and a draft (each editable
   field alone and several together; no change → empty); the log text of the changed fields, money formatted in the
   payment's currency; the `payment:<id>` field name round-trips through the parser and rejects a plain
   `payment`; a reason of `''`, spaces and a tab is refused, `' x '` is accepted trimmed. `recordPaymentForm.test.ts`:
   a draft from a payment; in edit mode "nothing changed" blocks Save, a zero amount blocks, a future date blocks.
2. **The write functions.** `editManualPayment.test.ts` and `deleteManualPayment.test.ts` (as
   `recordManualPayment.test.ts` does, with the typed executor mocked): edit writes only the changed columns, both
   installment columns together, and one log row in the same transaction; delete writes the four columns and one log
   row **with no reason in it**; each refuses locally a zero amount, an empty reason, a Stripe row and an already
   deleted row, and writes nothing.
3. **The screens, by static render.** `PaymentDetailDialog.test.tsx`: Edit and Delete only with `canWrite` on a
   manual, undeleted payment; none on a Stripe payment (with its footer line); a deleted payment shows the notice,
   and the reason, author and time only with `canWrite`. `DeletePaymentDialog.test.tsx`: Delete disabled for an empty
   or space-only reason. `BillingTab.test.tsx`: Show deleted is present for a read-only role, off hides deleted rows,
   on lists them greyed in place, and the totals are identical either way. `LogTab.test.ts`: `payment_edit` and
   `payment_delete` rows draw, the label is resolved from `payment:<id>`, an unknown id falls back to a short id, and
   a delete row shows no reason.
4. **Gate:** `npm run tc`, `npx vitest run`, `prettier --check` on the touched files. E2E: SKIPPED (not run locally, by
   instruction).

## 7. Edge cases and error handling

- **Offline.** Edit and delete are local writes that upload later. There are two kinds of refusal (spec 07, §8):
  - **The guard or a CHECK raises** (`42501`, `23514` — for example the payment was deleted on another device, so
    its row is frozen): the connector discards the whole transaction — payment change and log row together — and
    shows its toast; the local row may differ until the next sync.
  - **The UPDATE policy filters the row out** (the role was removed while the write waited in the queue): the
    statement matches no row and raises nothing, so the transaction completes **without a toast**, the payment
    change is dropped, **and the log row is still written** — the log then says a payment was edited or deleted
    when it was not. It needs a role change while offline with writes queued.
- **A double click.** A write queue in each dialog stops a second submit from overtaking the first, as in the record
  dialog.
- **Editing a payment another device just deleted.** The database refuses it (the row is frozen); the user sees the
  discard toast.
- **Edit and the schedule.** Changing the installment re-allocates the money; changing the amount of a payment that
  was applied across several installments re-flows it. The totals always come from `allocatePayments`.
- **A payment in another currency than the quote.** It stays excluded from the totals; its own currency is never
  edited.
- **A user whose role was just removed.** The buttons disappear on the next render. A write already queued is
  dropped silently by the policy, and its log row is still written (see **Offline**).
- **Clerk.** Nothing new: no route, token or webhook is touched.

## 8. Risks

- **R1 — the reason is hidden by the screen only (D6).** Deleted rows, reason included, sync to every role that reads
  payments (spec 08, D3); anyone inspecting their local database can read it. The Log tab does not carry it (D7).
- **R2 — the log is written by the client (spec 07, D5).** A client can skip it or write a misleading entry; the
  authoritative record is the row itself (who, when, why). It can also be wrong without anyone's intent: a write
  the policy filters out (the role removed while it was queued) leaves its log row behind, because the
  transaction completes (see §7).
- **R3 — `BillingTab.tsx` grows** (518 lines before this spec). The switch, the greyed rows and the dialogs' wiring
  are added to it; nothing is extracted, as nothing was asked for.
- **R4 — the file count is at the limit** (10 of 10).
