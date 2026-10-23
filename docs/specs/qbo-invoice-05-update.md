# QuickBooks invoice — the update route

Status: **Implemented 2026-10-22** (approved in chat, amended the same day before
implementing); **AMENDED 2026-10-23 — approved and implemented.** 0 open decisions; one reading to
confirm (§1, last paragraph). Three amendments of 2026-10-22, all answered by the
user: the Canadian no-tax code of [03c](qbo-invoice-03c-no-tax-code.md) and
[03d](qbo-invoice-03d-canadian-line-tax-code.md) (§4, case 1 step 7), the Log values (§6), and
the fourth routing row for a link that points at a missing invoice (§4). **The 2026-10-23
amendment removes the hash** (spec 01): no sent hash is remembered or saved, so case 1 writes
nothing to `Events` itself, and the hook of step 10 is the invoice check of
[06](qbo-invoice-06-totals-check.md). **The second 2026-10-23 amendment removes the "office moved"
refusal** (spec 01: `qbo_invoice_connection_uuid` is gone, so the invoice's file is always the
quote's office's and there is nothing to compare it with): step 1 loses its check, the 409
`wrong_company` goes, and so do the connection-name lookup and scenario S5. Step numbers are kept so
that references to them hold.
Implementation order: **05** (see the plan, §3). Plan: [qbo-invoice-plan.md](qbo-invoice-plan.md).
Branch: `q4-sprint1-finance-role`.
Needs: [04](qbo-invoice-04-create.md) (the route and the create flow), which in turn needs
[03a](qbo-invoice-03a-province-tax-codes.md) and [03b](qbo-invoice-03b-zone-class.md).

## 0. The request, and what it is not

The same route, `POST /api/quickbooks/invoice`, now also **updates** an invoice: it replaces
the QuickBooks invoice's content with the quote's current data. It also handles the two
awkward cases the user described: the invoice number is already in QuickBooks, and the linked
invoice is gone from QuickBooks. (A third, the quote's office moving to the other QuickBooks file,
is no longer a case: §1.)

**Not part of this spec:** the "are you sure?" question (the screen asks, spec 07); the
invoice comparison (spec 06); any screen; deleting or voiding invoices.

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
- **The quote's office moved to the other QuickBooks file:** not detected any more (user's answer,
  2026-10-23, spec 01 §1: "just remove it"). The earlier answer — Update refused with a message —
  needed the file the invoice was made in, which `Events` no longer stores. Update reads the
  invoice in the file of the quote's office, as every other call does.
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
- **The link** is spec 01's: `qbo_invoice_id` on `Events`. The QuickBooks file is the sales
  office's (`InvoiceSource.connectionId`).

## 3. The contract (additions to spec 04's)

**Request body:** `{ eventId, customerChoice?, replaceMissing?: boolean,
overwriteInvoiceId?: string }`.

**New `status` values, HTTP 200:**

- `updated` — `docNumber`, `qboInvoiceId`, `warnings`, and `linkedExisting` true when the
  update came from an overwrite.
- `invoice_missing` — the linked invoice is not in QuickBooks (in the file of the quote's
  office). Nothing was written.

_(The 409 `wrong_company` error is removed, 2026-10-23.)_

## 4. The cases — `…/invoice/updateInvoice.ts` (new) and `createInvoice.ts` (changed)

The route decides by the event's state:

- **No link, no `overwriteInvoiceId`** → the create flow of spec 04.
- **No link, with `overwriteInvoiceId`** → case 2.
- **A link, `replaceMissing` true and `overwriteInvoiceId`** → case 2, relinking (below).
  This is the request the screen sends after case 3 answered `invoice_number_exists` (spec 07
  re-sends the request it made, with the id added); without this row it would run case 3 again
  and loop.
- **A link, anything else** → case 1, or case 3 when `replaceMissing` is true.

The route reads the quote's link with `readLinkedInvoiceId` (in `updateInvoice.ts`, service role)
and calls `createInvoice`, `overwriteInvoice` (case 2, with or without relinking) or
`updateInvoice` (cases 1 and 3). Each of them loads the quote itself, so a link that changed in
between is caught by the flow (409).

**Case 1 — Update.** In this order; a failing step ends the request.

1. `loadInvoiceSource`. _(Removed 2026-10-23: the check that the invoice's file is the office's
   current one, with its 409. The file is not stored, so every step below uses the connection of the
   quote's sales office.)_
2. `validateInvoiceSource`. The **booked** rule is not applied.
3. _(Removed 2026-10-23: there is no hash to remember.)_
4. `findQboItem`.
5. Read the invoice by the stored id. Not found and `replaceMissing` is not true →
   `invoice_missing`, stop.
6. `resolveInvoiceCustomer` (the billed contact may have changed); `choose` →
   `choose_customer`, stop.
7. Resolve the Class (spec 03b) and, for a taxed Canadian quote, the province's tax code
   (spec 03a); for any Canadian quote also the connection's no-tax code (spec 03c). When a
   Canadian line needs the no-tax code and the connection has none, the request ends with the
   same 400 as spec 04 step 8 (spec 03d). `buildInvoicePayload` with those refs; a sparse
   update with the invoice's `Id` and `SyncToken`. Their warnings (`class_missing`,
   `tax_code_missing`) go into `warnings`. A QuickBooks refusal → 502.
8. _(Nothing is written to `Events` here since 2026-10-23: the sent hash is gone. The flag and
   its reasons are written by the check of step 10.)_ `is_qbo` is **not** touched (an
   accountant who unticked it by hand is not overruled).
9. Write the Log (§6): "Updated".
10. _Hook for spec 06: the invoice check, which sets `qbo_invoice_mismatch` and its reasons._
11. Replace the PDF (§5). A failure is the `pdf_not_attached` warning.
12. Return `updated`.

**Case 2 — Overwrite by number.** The booked rule and the validation of spec 04 apply (it is
a first link). The invoice with `overwriteInvoiceId` is read from this connection's QuickBooks
file; it must exist and its `DocNumber` must equal the quote's invoice number, else 400 (the
id may not point at any invoice). Then steps 3–12 of case 1, except: step 8 saves the id and
`is_qbo` true as well, guarded by `qbo_invoice_id IS NULL`; the Log says
"Linked and updated"; the result has `linkedExisting` true. The save also sets
`qbo_invoice_mismatch` false, `qbo_invoice_mismatch_reasons` null and both check times null (a
first link has nothing to be compared with yet; spec 06 sets them right after).

**Case 2, relinking.** The quote has a link to an invoice that QuickBooks no longer has, and
the user chose to overwrite the invoice found by number. The booked rule is **not** applied (the quote already had an invoice, as in case 3); the
validation is. The rest is case 2, except the save is guarded by
`WHERE qbo_invoice_id = {the old id}` instead of `IS NULL`. The result is `updated` with
`linkedExisting` true.

**Case 3 — Create a new one after "not found".** `replaceMissing` is true and the read of
step 5 found nothing. The create flow of spec 04 runs from its step 5 (Item, number check,
customer, create, save), with these differences: the booked rule is not applied; the saved
link replaces the old one with `WHERE qbo_invoice_id = {the old id}`; the Log says "Created
again (the previous invoice was not found)"; the result is `created`. The `requestid` also
carries the old invoice's id: the same event made the deleted invoice (its `requestid` is made
from the event alone, spec 04 §2), and QuickBooks must not answer with it.

## 5. The PDF — `attachQuotePdf.tsx` (changed)

A second function, `replaceQuotePdf(connectionId, qboInvoiceId, eventId)`: it lists the
invoice's attachments, deletes the ones named `{invoice number}.pdf`, then attaches the new
PDF as in spec 04. Other attachments are left alone. It throws on failure.

## 6. The Log — `logInvoiceChange.ts` (changed)

`kind` gains `updated`, `linked` and `recreated`. All write `field_name` `qbo_invoice`,
`action_type` `update` and `prev_value` "None", as `created` does. `next_value`:

- `updated` — "Updated (invoice {docNumber})"
- `linked` — "Linked and updated (invoice {docNumber})"
- `recreated` — "Created again (the previous invoice was not found)"

The case-2 and case-3 flows that set `is_qbo` write its second row as spec 04 does.

## 7. Edge cases and error handling

- **Invoice paid, voided or closed in QuickBooks.** QuickBooks' own refusal is passed on
  (502). Nothing is written to `Events`.
- **The office's QuickBooks file changed, or the quote moved to another office, since the invoice
  was made.** Nothing notices (spec 01 §8, R3). Update reads the stored id in the new file: no
  invoice there → `invoice_missing`, and the user is offered a new invoice in the new file (case
  3); an invoice of the same id there → that one is replaced with the quote's content.
- **The billed contact changed since the invoice was made.** Step 6 finds another customer
  (or asks); whether QuickBooks lets the customer change: to verify in a sandbox.
- **Two accountants press Update at once.** The second sends a stale `SyncToken` because it
  read first; QuickBooks refuses with a stale-object fault; the user presses again.
- **`overwriteInvoiceId` of an invoice in another company or with another number:** 400.
- **A deleted invoice and a new one with the same number.** Case 3's number check (spec 04
  step 6) finds it and the user is offered the overwrite instead.
- **Timeout after step 7.** The invoice changed; the check of step 10 may not have run, so the
  stored flag is the one from before. The next Save of the quote (spec 06a) or Check again checks it, and pressing Update again is harmless.
- **Offline / PowerSync, Clerk.** As spec 04.

## 8. Behaviour scenarios

Playwright, written, **not run** (the route is replaced by a fake):

- **S1** a quote with an invoice whose flag was set: the response is `updated` and carries the
  check's result; with the fake now returning an equal invoice the flag is false and its reasons
  are null.
- **S2** the fake says the invoice is gone: `invoice_missing`; with `replaceMissing` the
  response is `created` and the link is the new id.
- **S3** a quote with no link and an `overwriteInvoiceId` of the right number: `updated` with
  `linkedExisting`; the link is saved and `is_qbo` is ticked.
- **S4** the same with a wrong number: 400, nothing saved.
- **S5** _(removed 2026-10-23 with the "office moved" refusal; the number is kept so that the other
  scenarios keep theirs)._
- **S6** a quote that is no longer `booked` but has an invoice: Update still works.
- **S7** a viewer and an account manager: 403.
- **S8** a quote with a link, `replaceMissing` and an `overwriteInvoiceId` of the right number:
  `updated` with `linkedExisting`; the link is the overwritten invoice's id.

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

- **`updateInvoice.test.ts`** (fakes as in spec 04): the order of case 1; the invoice is read,
  updated and its PDF replaced in the connection of the quote's sales office, and no step looks at
  any other connection; a missing invoice returns `invoice_missing` and
  writes nothing; `is_qbo` is untouched by an update and set by case 2; the sparse body
  carries the `Id` and `SyncToken`; case 1 writes nothing to `Events` itself; case 2 refuses
  a wrong number and an unknown id; case 3 replaces only the old id's link; each case writes
  the right Log text; the booked rule applies to case 2 and not to cases 1, 3 and the
  relinking case 2; the relinking case 2 replaces only the old id's link.
- **Warnings:** an update of a quote with no Class, or a taxed Canadian quote with no mapped
  code, returns `updated` with the matching warning.
- **No-tax code:** a Canadian quote that needs the connection's no-tax code and has none is
  refused with 400 and nothing is written, in cases 1, 2 and 3; one that has it carries it on
  the line.
- **`attachQuotePdf.test.ts`:** replace deletes only the app's own file name, then uploads;
  a failure throws.
- **`createInvoice.test.ts`** (extended): the create flow is unchanged.
- **`route.test.ts`** (extended): the routing table of §4.
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
- The invoice check (spec 06).
- Deleting, voiding or restoring an invoice in QuickBooks.
- Noticing that the office's QuickBooks file changed since the invoice was made (spec 01 §1).
- Merging the accountant's hand edits with the quote's data.
