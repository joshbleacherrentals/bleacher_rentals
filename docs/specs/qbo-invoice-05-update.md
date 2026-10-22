# QuickBooks invoice — the update route

Status: **DRAFT 2026-10-22 — awaiting "Approved".** 0 open decisions; one reading to confirm
(§1, last paragraph).
Implementation order: **05** (see the plan, §3). Plan: [qbo-invoice-plan.md](qbo-invoice-plan.md).
Branch: `q4-sprint1-finance-role`.
Needs: [04](qbo-invoice-04-create.md) (the route and the create flow), which in turn needs
[03a](qbo-invoice-03a-province-tax-codes.md) and [03b](qbo-invoice-03b-zone-class.md).

## 0. The request, and what it is not

The same route, `POST /api/quickbooks/invoice`, now also **updates** an invoice: it replaces
the QuickBooks invoice's content with the quote's current data. It also handles the three
awkward cases the user described: the invoice number is already in QuickBooks, the linked
invoice is gone from QuickBooks, and the quote's office moved to the other QuickBooks file.

**Not part of this spec:** the "are you sure?" question (the screen asks, spec 07); the
totals comparison (spec 06); any screen; deleting or voiding invoices.

## 1. Decisions (all taken by the user)

**From the user's own words (not options):**

- **Update replaces the content** with the quote's data, even when the invoice was changed
  by hand in QuickBooks or was made by the app.
- **Update is available whatever the status**, once an invoice exists (plan, "when Create
  is offered").
- **The same number already in QuickBooks:** the user is told, and may overwrite it;
  overwriting **links that invoice to the quote and replaces its content** with the quote's
  data (user's answer).
- **The linked invoice is not found in QuickBooks:** the app says so and offers to create a
  new one. If the user says no, it is probably a bug and they go to the developer. This spec
  returns the state and, on the user's yes, creates the new invoice.
- **The quote's office moved to the other QuickBooks file:** Update is refused with a message,
  nothing is written (user's answer).
- **A new PDF replaces the old one**, which disappears.
- **A PDF that fails to attach** is a warning; Update retries it.
- **Log:** updating an invoice is written to the quote's Log.

**Reading to confirm at review.** "Replace the invoice's content" is read as: replace every
field the app sets (customer, number, dates, addresses, memo and the one line). Fields the
app never sets (terms, custom fields) stay as they are. The line list, however, is replaced
as a whole, so a line the accountant added by hand is removed.

## 2. Research findings

- **QuickBooks needs the current version.** An update must carry the invoice's `Id` and its
  `SyncToken`, which changes on every edit, so the invoice is read first. A sparse update
  changes only the fields sent; a `Line` array replaces the lines. To verify in a sandbox,
  with whether a customer can be changed on an invoice that already has a payment.
- **A deleted invoice** is reported by QuickBooks as an object-not-found fault when read.
- **Attachments.** An invoice's attachments are listed by their reference to the invoice; the
  app's own file is the one named `{invoice number}.pdf`. A file the accountant attached
  keeps its own name and is left alone.
- **The link columns** are spec 01's; the saved hash rule is spec 04 step 4.
- **Connection names.** `QboConnections.display_name` names a company in a message.

## 3. The contract (additions to spec 04's)

**Request body:** `{ eventId, customerChoice?, replaceMissing?: boolean,
overwriteInvoiceId?: string }`.

**New `status` values, HTTP 200:**

- `updated` — `docNumber`, `qboInvoiceId`, `warnings`, and `linkedExisting` true when the
  update came from an overwrite.
- `invoice_missing` — the linked invoice is not in QuickBooks. Nothing was written.

**New error:** 409 `wrong_company` — the message of §4 case 1.

## 4. The cases — `…/invoice/updateInvoice.ts` (new) and `createInvoice.ts` (changed)

The route decides by the event's state:

- **No link, no `overwriteInvoiceId`** → the create flow of spec 04.
- **No link, with `overwriteInvoiceId`** → case 2.
- **A link** → case 1, or case 3 when `replaceMissing` is true.

**Case 1 — Update.** In this order; a failing step ends the request.

1. `loadInvoiceSource`. The stored `qbo_invoice_connection_uuid` must equal the connection of
   the quote's sales office, else 409: "This invoice is in the {old} QuickBooks company, but
   this quote's office now uses {new}. Nothing was changed. Fix it by hand in QuickBooks."
2. `validateInvoiceSource`. The **booked** rule is not applied.
3. Remember the current `qbo_invoice_hash` (as spec 04 step 4).
4. `findQboItem`.
5. Read the invoice by the stored id. Not found and `replaceMissing` is not true →
   `invoice_missing`, stop.
6. `resolveInvoiceCustomer` (the billed contact may have changed); `choose` →
   `choose_customer`, stop.
7. Resolve the Class (spec 03b) and, for a taxed Canadian quote, the province's tax code
   (spec 03a); `buildInvoicePayload` with those refs; a sparse update with the invoice's `Id`
   and `SyncToken`. Their warnings (`class_missing`, `tax_code_missing`) go into `warnings`. A
   QuickBooks refusal → 502.
8. Save `qbo_invoice_sent_hash` (step 3); `UPDATE Events … WHERE id = ?`. `is_qbo` is **not**
   touched (an accountant who unticked it by hand is not overruled).
9. Write the Log (§6): "Updated".
10. _Hook for spec 06: the totals check._
11. Replace the PDF (§5). A failure is the `pdf_not_attached` warning.
12. Return `updated`.

**Case 2 — Overwrite by number.** The booked rule and the validation of spec 04 apply (it is
a first link). The invoice with `overwriteInvoiceId` is read from this connection's QuickBooks
file; it must exist and its `DocNumber` must equal the quote's invoice number, else 400 (the
id may not point at any invoice). Then steps 3–12 of case 1, except: step 8 saves the id, the
connection and `is_qbo` true as well, guarded by `qbo_invoice_id IS NULL`; the Log says
"Linked and updated"; the result has `linkedExisting` true.

**Case 3 — Create a new one after "not found".** `replaceMissing` is true and the read of
step 5 found nothing. The create flow of spec 04 runs from its step 5 (Item, number check,
customer, create, save), with these differences: the booked rule is not applied; the saved
link replaces the old one with `WHERE qbo_invoice_id = {the old id}`; the Log says "Created
again (the previous invoice was not found)"; the result is `created`.

## 5. The PDF — `attachQuotePdf.tsx` (changed)

A second function, `replaceQuotePdf(connectionId, qboInvoiceId, eventId)`: it lists the
invoice's attachments, deletes the ones named `{invoice number}.pdf`, then attaches the new
PDF as in spec 04. Other attachments are left alone. It throws on failure.

## 6. The Log — `logInvoiceChange.ts` (changed)

`kind` gains `updated`, `linked` and `recreated`. All write `field_name` `qbo_invoice`,
`action_type` `update`, `prev_value` and `next_value` as named in §4. The case-2 and case-3
flows that set `is_qbo` write its second row as spec 04 does.

## 7. Edge cases and error handling

- **Invoice paid, voided or closed in QuickBooks.** QuickBooks' own refusal is passed on
  (502). Nothing is written to `Events`.
- **The billed contact changed since the invoice was made.** Step 6 finds another customer
  (or asks); whether QuickBooks lets the customer change: to verify in a sandbox.
- **Two accountants press Update at once.** The second sends a stale `SyncToken` because it
  read first; QuickBooks refuses with a stale-object fault; the user presses again.
- **`overwriteInvoiceId` of an invoice in another company or with another number:** 400.
- **A deleted invoice and a new one with the same number.** Case 3's number check (spec 04
  step 6) finds it and the user is offered the overwrite instead.
- **Timeout after step 7.** The invoice changed; the sent hash may not be saved, so the quote
  still reads "outdated"; pressing Update again is harmless.
- **Offline / PowerSync, Clerk.** As spec 04.

## 8. Behaviour scenarios

Playwright, written, **not run** (the route is replaced by a fake):

- **S1** a quote with an invoice: the response is `updated`; the sent hash now equals the
  current hash.
- **S2** the fake says the invoice is gone: `invoice_missing`; with `replaceMissing` the
  response is `created` and the link is the new id.
- **S3** a quote with no link and an `overwriteInvoiceId` of the right number: `updated` with
  `linkedExisting`; the link is saved and `is_qbo` is ticked.
- **S4** the same with a wrong number: 400, nothing saved.
- **S5** an office moved to the other company: 409 with the message, nothing saved.
- **S6** a quote that is no longer `booked` but has an invoice: Update still works.
- **S7** a viewer and an account manager: 403.

## 9. Files

**Counted — 6 files** (limit 10):

1. `src/app/api/quickbooks/invoice/route.ts` — changed: the new body fields and the routing
2. `src/features/quickbooks-integration/invoice/updateInvoice.ts` — new
3. `src/features/quickbooks-integration/invoice/createInvoice.ts` — changed: case 3
4. `src/features/quickbooks-integration/invoice/qboInvoiceApi.ts` — changed: read by id,
   sparse update
5. `src/features/quickbooks-integration/invoice/attachQuotePdf.tsx` — changed: replace
6. `src/features/quickbooks-integration/invoice/logInvoiceChange.ts` — changed: three kinds

**Not counted:** the tests of §10; the Playwright spec of §8. No migration, no
`AppSchema.ts`, no `database.types.ts`, no `permissionPageData.ts`.

## 10. Tests and implementation sequence

Red first. Prettier only on touched files.

- **`updateInvoice.test.ts`** (fakes as in spec 04): the order of case 1; a moved office
  writes nothing and names both companies; a missing invoice returns `invoice_missing` and
  writes nothing; `is_qbo` is untouched by an update and set by case 2; the sparse body
  carries the `Id` and `SyncToken`; the saved sent hash is the one read first; case 2 refuses
  a wrong number and an unknown id; case 3 replaces only the old id's link; each case writes
  the right Log text; the booked rule applies to case 2 and not to cases 1 and 3.
- **Warnings:** an update of a quote with no Class, or a taxed Canadian quote with no mapped
  code, returns `updated` with the matching warning.
- **`attachQuotePdf.test.ts`:** replace deletes only the app's own file name, then uploads;
  a failure throws.
- **`createInvoice.test.ts`** (extended): the create flow is unchanged.
- **`route.test.ts`** (extended): the routing table of §4; 409 `wrong_company`.
- **Gate:** `npm run tc`, `npx vitest run`, `prettier --check` on the touched files. E2E:
  SKIPPED (not run locally, by instruction). A QuickBooks sandbox run is the user's.

## 11. Risks

- **R1 — an update overwrites hand work.** That is the decision; the screen asks first
  (spec 07), every time.
- **R2 — replacing the line list** (§1, reading) removes a line the accountant added.
- **R3 — "missing" is read from a fault code.** If QuickBooks words that fault differently
  from what is expected, a deleted invoice is reported as an ordinary 502.

## 12. Out of scope

- The confirmation question and every dialog (spec 07).
- The totals check (spec 06).
- Deleting, voiding or restoring an invoice in QuickBooks.
- Updating an invoice whose quote is in another company automatically.
- Merging the accountant's hand edits with the quote's data.
