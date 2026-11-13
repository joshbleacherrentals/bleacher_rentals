# Event change log: plan

Status: **DRAFT 2026-11-05, waiting for "Approved"** (0 open decisions; readings to confirm in §5).
Seven specs follow from it; each is its own logic, its own "Approved" and its own commit. Pages
audited: `/accountant/invoice?id={id}` and `/quotes-bookings/{id}`. The Log is the `EventChangeLog`
table shown on the Log tab of a quote.
Branch: `q4-sprint3-finance`.

## 0. The request

User, 2026-11-05 (translated):

- Refactor. Before a spec is written, check the pages `/accountant/invoice?id={id}` and
  `/quotes-bookings/{id}`, see what is not written to the event change log, tell the user which
  events are not written and ask which of them must be.
- "Record payment" is not written to the change log and must be.
- Files: "upload file" and "delete file" are not written and must be.
- Two versions of each spec: English in the repository, and a full Ukrainian copy as an artifact
  that is not stored in the repository. The user takes every decision; a question is asked, never
  guessed.

## 1. What the audit found (2026-11-05)

**Written to the Log today:**

- A status change from the status button, and deleting a quote.
- Send To Client, and the files added in the send dialog (`file_add`).
- The QuickBooks Invoice checkbox (`is_qbo`), and Create / Update invoice in QuickBooks
  (`qbo_invoice`).
- Editing and deleting a payment (`payment_edit`, `payment_delete`).
- On the Edit page: the changed fields and the changed line items.
- The customer's signature and the customer's activity on the public page (`client_*`).

**Not written, and the user's verdict:**

- Record payment (both pages, one function): **in**, asked by the user.
- Upload file and Delete file (both pages, one pair of helpers): **in**, asked by the user.
- Lost reason and note, set with the status button (the status row is written, the reason is
  not): **in**.
- A payment received through Stripe (the webhook writes the payment, the Log only has "customer
  started a payment"): **in**.
- Payment Schedule changes on the Edit page: **in** (outside the two pages, the user included it).
- Responded / Awaiting response (`hide_lead_alert`): **out**.
- Internal chat messages (the chat has its own history): **out**.
- New Task, Done / Next Task (`ArEventTasks`, shown in Task History): **out**.
- QuickBooks "Check again" (writes only a check time and a match flag): **out**.

**Only reading, nothing to log:** Open / View PDF, Customer view, download and open a file, Show
deleted, Open in Dashboard, the history panels, Previous / Next Task, View in QuickBooks, tabs.

## 2. The seven specs

- **01, payment recorded:** [event-change-log-01-payment-recorded.md](event-change-log-01-payment-recorded.md).
  The Record payment row, written in the same transaction as the payment; the shared row builder.
- **02, files uploaded and deleted:** [event-change-log-02-file-upload-delete.md](event-change-log-02-file-upload-delete.md).
  Two new row types, written from the two shared file helpers.
- **03, status change on PowerSync, with the Lost reason:**
  [event-change-log-03-status-change-local.md](event-change-log-03-status-change-local.md). The
  status update and its row in one local transaction; the reason inside the row.
- **04, the Edit page: fields and line items on PowerSync:**
  [event-change-log-04-edit-fields-line-items-local.md](event-change-log-04-edit-fields-line-items-local.md).
  Their rows move off Supabase; Venue and Address are written by name.
- **05, the Edit page: Payment Schedule rows:**
  [event-change-log-05-payment-schedule-rows.md](event-change-log-05-payment-schedule-rows.md).
  Needs 04.
- **06, Stripe payment received:**
  [event-change-log-06-stripe-payment-trigger.md](event-change-log-06-stripe-payment-trigger.md).
  A database trigger; the row shows on the Customer Activity tab.
- **07, the QuickBooks invoice row:**
  [event-change-log-07-qbo-invoice-row.md](event-change-log-07-qbo-invoice-row.md). "Updated"
  stops saying "previous: None".

Build order: 01, 02, 03, 04, 05, 06, 07. Only 05 needs another (04); the others stand alone. Each
spec repeats the shared context, so it can run in a chat of its own.

## 3. Decisions taken (all by the user, 2026-11-05)

**D1: which events are written.** Options were each gap of §1. Answer: **in** are Record payment,
Upload file, Delete file (the request), Lost reason and note, Stripe payment received, Payment
Schedule on Edit. **Out** are Responded / Awaiting, Internal chat, New Task, Check again.

**D2: how many specs.** Options: one, or several small. Answer: **several small**, then, of 4
or 7, **7** (§2).

**D3: the Record payment row.** Options: amount, method, date; plus payer and Applied to; plus
Reference. Answer: **amount · method · date.** Notes are never written. Example:
"Payment recorded: $100.00 · Check · Aug 14, 2026".

**D4: file rows.** Options: new row types; reuse `file_add` and add only a delete type. Answer:
**new types**, `file_upload` and `file_delete`; `file_add` stays for the send dialog and its text
does not change. One file is one row.

**D5: where the Stripe row is shown.** Options: Internal Activity; Customer Activity. Answer:
**Customer Activity**, next to "Initiated payment". The author is "System".

**D6: Lost reason and note.** Options: separate rows as the Edit page writes them; inside the
status row. Answer: **inside the status row**, for example "quoted → lost (Price too high)".

**D7: Payment Schedule.** Options: a row per installment; one row per save with the whole
schedule. Answer: **a row per installment** (added, removed, changed).

**D8: how the Edit save is grouped.** Options: three transactions (fields, line items, schedule),
each with its own rows; one transaction for the whole save. Answer: **three transactions.** The
user's wish: a quote changed through Edit leaves all of it in the Log; what did not change leaves
nothing.

**D9: Delete quote.** Options: only its row moves to PowerSync; the delete and its row both
move. Answer, in the user's words: since the delete is a direct request to Supabase, the Log row
is also **a direct request to Supabase.** Nothing changes in `softDeleteEvent`.

**D10: the reliability gap.** The Log rows of a status change, a delete and the Edit page are
written with a direct request after the local save, so offline, or after a failed request, the
change stays and its row is lost. Answer: **move them to PowerSync.** D9 takes Delete quote out
of this.

**D11: old data.** Options: nothing; a one-time fill from `PaymentHistory` and `EventFiles`.
Answer: **nothing.** The Log starts at the release.

**D12: small faults found on the way.** Answer: fix both. (a) Venue and Address changes on Edit
are written as raw ids; write names. (b) The QuickBooks "Updated" row says "previous: None".

**D13: how the Stripe row is written.** Options: the webhook code writes it after the payment;
a database trigger writes it in the payment's transaction. Answer: **a database trigger.**

**D14: the QuickBooks "previous" value.** The invoice number is always the quote's invoice
number, so "the previous number" equals the new one. Options: write "Invoice {number}" as the
previous value; leave "None". Answer, in the user's words: for a QuickBooks update, **write that
the invoice was updated, with no previous value.**

## 4. Findings that shape the plan

**F1: the Log is written in three ways today.** (1) Through PowerSync, in the same transaction as
the change: `editManualPayment`, `deleteManualPayment` (spec accountant-quotes-09, D1). (2)
Through PowerSync, after the change: `setEventIsQbo`, `logQuoteSentLocal`, `createQuoteEvent`.
(3) Through a direct Supabase request after the change: `logEventChanges`, `logLineItemChanges`,
`logSingleChange` (status change, delete, Edit). The server writes with the service role:
`logInvoiceChange`, the contract signature, the customer's activity.

**F2: a refused upload discards its whole transaction** (`editManualPayment.ts` header). A Log
row in another transaction stays without its change, or the reverse. This is why D8 groups each
change with its rows.

**F3: this series replaces D4 of [quote-detail-reactive-plan.md](quote-detail-reactive-plan.md).**
That plan kept the change-log writes as direct Supabase writes. It stays true for Delete quote
(D9) and for the server routes; it no longer holds for the status change (03) and the Edit
page (04, 05).

**F4: who reads the Log.** The same four roles that read Payment History: admin, account manager,
viewer, accountant. A Log row with an amount shows it to nobody who could not already see it.
Anyone signed in may insert into the Log (policy `event_change_log_insert`); nobody can update or
delete a row.

**F5: the customer's public endpoint** `POST /api/quotes/{id}/activity` writes whatever
`client_*` type is on its allowlist, for anyone. The Stripe row (06) must not be added to that
list, or anyone could forge "payment received". The trigger writes it.

**F6: the QuickBooks "None"** is the design of [qbo-invoice-04-create.md](qbo-invoice-04-create.md)
§6 and [qbo-invoice-05-update.md](qbo-invoice-05-update.md) §6, not a slip. Spec 07 changes it.

**F7: Venue and Address in the Log.** `logEventChanges.ts` resolves ids to names for contacts,
sales offices, event types, terms and users, and has no branch for `venue_uuid` or
`address_uuid`, so the raw id is written.

## 5. Readings to confirm (for the whole series)

- **R1:** one shared row builder, `eventLogInsert`, is added in spec 01 and used by 01 to 05. The
  inserts that are already hand-built (payment edit and delete, `is_qbo`, send) are not moved to it.
- **R2:** "no previous value" (D14) is applied to the results `updated` and `linked` of the
  Update invoice button. `created` and `recreated` keep "None", because an invoice is made.
- **R3:** `logSingleChange` stays for Delete quote and for the contract signature route.
- **R4:** `permissionPageData.ts` is not edited by any spec: no role gains or loses an ability and
  the readers of the Log are the same.
- **R5:** on the Edit page the `Addresses` row is still written before the three transactions, as
  now. It is not a Log row; the address change is written through `address_uuid`.
- **R6:** the specs are Approved one by one; E2E is written, not run (the user's rule).

## 6. Not in scope of any spec

- Responded / Awaiting, Internal chat, New Task, QuickBooks "Check again" (D1).
- Filling the Log for payments and files made before the release (D11).
- Stripe refunds and disputes (the webhook handles only a completed checkout).
- Moving `softDeleteEvent` to PowerSync (D9).
- A new Log tab, a filter or a search on the Log.
