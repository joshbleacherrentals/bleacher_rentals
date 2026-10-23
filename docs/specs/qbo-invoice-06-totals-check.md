# QuickBooks invoice — the invoice check (once the totals check)

(The file keeps its old name, `…totals-check`, by the user's choice of 2026-10-23.)

Status: **AMENDED 2026-10-23 — approved and implemented.** 0 open decisions; four readings to confirm
(§1, last paragraph). The earlier version compared QuickBooks' total and tax only and was
implemented on 2026-10-23; the user then asked to compare the whole invoice and to drop the hash
(§1). Everything here replaces that code. **A second amendment of 2026-10-23** drops the stored
connection (spec 01: `Events.qbo_invoice_connection_uuid` is gone): the invoice is read, and every
reference looked up, in the connection of the quote's sales office (§2, §3 step 1, §7).
Implementation order: **06** (see the plan, §3). Plan: [qbo-invoice-plan.md](qbo-invoice-plan.md).
Branch: `q4-sprint1-finance-role`.
Needs: [01](qbo-invoice-01-link-and-hash.md) (the flag and the reasons),
[04](qbo-invoice-04-create.md) and [05](qbo-invoice-05-update.md) (the hooks).
Followed by: [06a](qbo-invoice-06a-check-on-save.md) (who calls the check, and when).

## 0. The request, and what it is not

With the hashes gone (spec 01) the app finds out whether a quote and its QuickBooks invoice still
agree by **asking QuickBooks**: it reads the invoice over the network, works out the invoice it
would write from the quote today, compares the two field by field and stores the answer on the
quote — the flag `qbo_invoice_mismatch`, the reasons behind it and the time of the check. This spec
is that comparison and the route that runs it. Spec 06a says who calls it besides a create or an
update.

**Not part of this spec:** any screen, banner, count or button (specs 07–11); who may call the
route and when it is called besides after a create or update (06a); correcting the invoice or
the quote; a tolerance (the user said none).

## 1. Decisions (all taken by the user)

**From the user's own words (not options):**

- **Compare the invoice itself, not a hash.** Equal → `qbo_invoice_mismatch = false`; any
  difference → `qbo_invoice_mismatch = true` (user, 2026-10-23).
- **What is compared: every field the app writes into the invoice** (user's answer, 2026-10-23;
  the alternative was the total and tax only). So this one flag also covers what the hash called
  "outdated".
- **Tolerance on money: none.** One cent apart is a difference.
- **A difference is a notification for accountants** that the invoice must be reviewed and
  corrected. Where it shows is specs 09–11.
- **The reasons are kept**, so the lists can say what differs (user's answer, spec 10).
- **When it runs:** after a create, after an update (this spec, §5) and, per spec 06a, after a
  quote's Save. Nothing else: opening a quote checks nothing, and QuickBooks is not asked to
  notify the app (user's answers, 2026-10-23, after the request limits were explained).
  **Check again** stays (spec 08).
- **The card shows when the quote was last checked** (user's answer; spec 08), so a check that did
  not run is not mistaken for a clean invoice.

**Readings to confirm at review.**

- **The reasons** are the eleven of §4, each covering the fields listed there. "Invoice out of
  date" no longer exists as a reason: a quote that changed shows what changed.
- **The line's own Description** counts (reason `service`), because the app writes it. An Item
  whose description is edited in QuickBooks therefore flags every invoice made with it until each
  is updated.
- **`totals` is reported only when nothing else on the money lines differs** (§4): an amount or
  tax code that differs already makes the total differ, and the user should not read the same
  mistake twice.
- **A quote that cannot be invoiced right now** — deleted, or failing spec 03's validation (no
  venue street, no contact name, …) — is **not compared**: the flag and reasons stay as they
  are and the answer is `skipped` with the message.

## 2. Research findings

- **What QuickBooks returns for an invoice:** `DocNumber`, `TxnDate`, `DueDate`,
  `CustomerRef.value`, `BillAddr.Line1`, `ShipAddr` (`Line1`, `City`, `CountrySubDivisionCode`,
  `PostalCode`), `PrivateNote`, `TotalAmt`, `TxnTaxDetail.TotalTax` (absent when there is no tax,
  which reads as 0) and `Line[]`. A line the app wrote is `DetailType: "SalesItemLineDetail"`
  with `Amount`, `Description` and `SalesItemLineDetail` (`ItemRef.value`, `TaxCodeRef.value`,
  `ClassRef.value`). QuickBooks adds its own subtotal and discount lines, which are not the app's
  and are ignored.
- **What the app already has.** `buildInvoicePayload(source, refs)` (spec 03) turns the quote into
  exactly the body the app writes, so "the invoice we would write today" needs no new logic: it is
  that body, built with read-only lookups of its references.
- **The references, read without side effects.** The Item by name (`findQboItem`, one QuickBooks
  query); the Class (`resolveZoneClass`, database); the province's tax code and the connection's
  no-tax code (database); the customer from the contact's stored link (`ContactQboCustomers`,
  database). The create and update routes may also create a customer or ask the accountant to
  pick one; the check never does either.
- **The connection.** The invoice is read, and every reference looked up, in the connection of the
  quote's sales office (`InvoiceSource.connectionId`, from `sales_office_uuid` →
  `quickbook_uuid`). `Events` stores no connection of its own (spec 01).
- **The earlier totals check** lives in `checkInvoiceTotals.ts` (`dollarsToCents`,
  `compareInvoiceTotals`, `runTotalsCheck`, `QboReadError`) and in the check route; `dollarsToCents`
  and `QboReadError` are kept.

## 3. The comparison

**`…/invoice/compareInvoice.ts` (new) — pure.**

`compareInvoice({ expected, quote, actual })` returns `{ matches, reasons, differences }`.

- `expected` is the body of `buildInvoicePayload` (spec 03).
- `quote` is `{ totalCents, taxCents }`: the amount after discounts plus the tax, and the tax
  (`source.amountCents + source.taxCents`, `source.taxCents`).
- `actual` is the snapshot of the QuickBooks invoice (`QboInvoiceSnapshot`, §3 below): every value
  already as text or whole cents.
- `reasons` is the list of reason codes of §4, in that order, without repeats. `matches` is true
  when it is empty.
- `differences` is one entry per differing field: `{ reason, field, quote, qbo }`, where `field`
  is a label ("Due date", "Amount") and `quote` and `qbo` are the two values as text (money as
  dollars with two decimals). The route returns them; nothing stores them.

How each value is compared:

- **Text** is trimmed; a missing value and an empty one are equal; case is kept.
- **Dates** are compared as `YYYY-MM-DD`.
- **Money** is compared in whole cents (`dollarsToCents`).
- **The customer.** `expected.CustomerRef.value` is the id from the contact's stored link. A
  contact with **no stored link** has no expected customer, so it always differs.
- **The line.** Only the invoice's `SalesItemLineDetail` lines count. Anything but exactly one is
  reason `lines`, and the line's own fields are then not compared.

**`…/invoice/qboInvoiceApi.ts` (changed).** `readQboInvoice` returns, beside the `id`, `syncToken`
and `docNumber` an update needs, a `snapshot: QboInvoiceSnapshot` with all the values above:
`txnDate`, `dueDate`, `customerId`, `billToLine1`, `ship` (street, city, state, zip), `memo`,
`lines` (for each sales-item line: `amountCents`, `itemId`, `description`, `taxCodeId`, `classId`),
`totalCents` and `taxCents`. It still returns null for an invoice QuickBooks does not have.
`QboInvoiceTotals` and the `totals` member go (the snapshot replaces them).

**`…/customers.ts` (changed).** `readLinkedCustomerId(connectionId, contactId)` reads the contact's
link for that connection (spec 02's table, service role) and returns the QuickBooks customer id or
null. It does not look the customer up in QuickBooks, create it or drop a stale link.

**`…/invoice/checkInvoice.ts` (new; it replaces `checkInvoiceTotals.ts`, which is deleted).**
`runInvoiceCheck(eventId, source)` — server-only, service role:

1. The quote must have `qboInvoiceId` (the route and the hooks give it), else an error.
2. `validateInvoiceSource(source)` (spec 03). Any issue → `skipped` with the messages joined. An
   office with no QuickBooks connection is one of them (`no_connection`), so from here on
   `source.connectionId` is set; every lookup below uses it.
3. `findQboItem(connection, eventTypeName)`; then `readQboInvoice(connection, id)`. No invoice →
   `missing`. A failure of either is a `QboReadError` (QuickBooks' side).
4. The references: `readLinkedCustomerId`, `resolveZoneClass`, and for a Canadian quote
   `resolveProvinceTaxCode` and `resolveNoTaxCode`. A Canadian quote that needs the no-tax code
   and has none (spec 03d) → `skipped` with that message.
5. `buildInvoicePayload`, then `compareInvoice`.
6. Store the result with the service role: `qbo_invoice_mismatch`, `qbo_invoice_mismatch_reasons`
   (the reasons as a JSON array, null when none), `qbo_invoice_checked_at` = now and
   `qbo_invoice_check_failed_at` = null. Every successful check writes the row, with the same values
   or not.
7. Return `{ status: "checked", matches, reasons, differences }`.

An outcome that is not `checked` — `missing`, `skipped`, or a `QboReadError` (QuickBooks, or the
Item, could not be read) — sets `qbo_invoice_check_failed_at` = now and leaves the flag, the
reasons and the check time as they were; a `QboReadError` is then re-thrown. The failure time is
the only thing stored about a failed check; its message is not.

## 4. The reasons

Each has a code (stored), a **short text** (lists, the row mark, the Reason column) and the fields
it covers. The long texts of the banner are spec 09's.

- **`number`** — "Invoice number does not match": `DocNumber`.
- **`dates`** — "Dates do not match": `TxnDate` (invoice date, the Event Start) and `DueDate`.
- **`customer`** — "Customer does not match": `CustomerRef` and `BillAddr.Line1` (the client's
  name).
- **`address`** — "Location of sale does not match": `ShipAddr`.
- **`memo`** — "Memo does not match": `PrivateNote` (the quote's title).
- **`lines`** — "Invoice lines do not match": the number of sales-item lines is not one.
- **`service`** — "Service does not match": the line's `ItemRef` (the event type) and its
  `Description`.
- **`amount`** — "Amount does not match": the line's `Amount`.
- **`tax_code`** — "Tax code does not match": the line's `TaxCodeRef`.
- **`class`** — "Class does not match": the line's `ClassRef`, where "no Class" equals "no Class".
- **`totals`** — "Totals do not match": `TotalAmt` and `TotalTax` against the quote's. Reported
  **only when `amount`, `tax_code` and `lines` are all absent** (§1, reading).

The codes live in one place (`invoiceTypes.ts`), with their texts, so no surface words a reason
differently.

## 5. The hooks (changes to specs 04 and 05)

- `createInvoice.ts` and `updateInvoice.ts` call `runInvoiceCheck` where they called the totals
  check: after the link and the Log are written and before the PDF. `checkTotalsAfterWrite` is
  renamed `checkInvoiceAfterWrite`; it still passes the source with the just-written link,
  because the loaded source is stale.
- The response's `totals` field becomes `check`: `{ matches, reasons, differences }`.
- A check that itself fails — QuickBooks unreachable, an unreadable reply, `missing`, `skipped` —
  does **not** fail the request: the response carries the warning **`invoice_check_failed`**
  (once `totals_check_failed`) with a `reason`, and the stored flag stays as it was.
- `invoiceActions.ts` (spec 07): the warning's text becomes "The invoice could not be checked
  against the quote."; nothing else on the screen changes.

## 6. The route — `src/app/api/quickbooks/invoice/check/route.ts` (changed)

`POST` with `{ eventId }`. Who may call it is spec 06a's; the contract is:

- 400 for a missing or non-uuid `eventId`; 404 for no such event (or one the caller cannot
  read, 06a).
- 409 when the event has no invoice: "This quote has no QuickBooks invoice yet."
- 200 `{ status: "checked", matches, reasons, differences }`.
- 200 `{ status: "invoice_missing" }` when QuickBooks no longer has it; nothing is stored.
- 200 `{ status: "skipped", message }` (§3 step 2 and 4); nothing is stored.
- 502 when QuickBooks cannot be reached or the Item is not found, with its readable message.
- Any other error is the generic 500.

## 7. Edge cases and error handling

- **The check runs on the quote as it is now.** After a create or update it compares what was just
  written with the same data, so only QuickBooks' own work (tax, normalising text) can differ.
  After a Save (06a) it compares with the quote as edited.
- **A quote edited in the address book** (a contact renamed, an address changed) is seen at the
  next check, not when the edit is made.
- **A US file that is not on Automated Sales Tax.** QuickBooks adds no tax to a line marked
  taxable (spec 03, §10); the check reports `totals`.
- **A Canadian invoice.** A province whose mapped code carries another rate than the calculator,
  a province with no code (the invoice was made untaxed, with a warning) and a tax typed by hand
  on the quote all show as `totals` (or `tax_code`, when the code on the line is not the one the
  settings give).
- **The office moved to the other QuickBooks file, or the quote to another office.** Nothing
  notices it (spec 01 §1 and R3). The stored invoice id is looked up in the office's current file:
  not there → `missing`, a failed check (the failure time is stored, the flag is left as it was); an
  invoice of the same id there → that invoice is compared, and will most likely show `customer` and
  other reasons.
- **Sub-cent rounding.** QuickBooks rounds tax per line; with one line the totals can still
  differ by a cent from the quote's. That is reported: there is no tolerance.
- **Invoice paid or voided.** QuickBooks' fields are read as they are.
- **A contact with no stored customer link** always shows `customer` until Update links one.
- **Offline / PowerSync.** The route is online-only. The flag and reasons sync down to every
  client.
- **Clerk.** The 401 of spec 06a; nothing else is touched.

## 8. Behaviour scenarios

Playwright, written, **not run** (the routes are replaced by fakes):

- **S1** an invoice equal to the quote: `matches` true, the flag false, no reasons.
- **S2** the due date differs: `dates`, the flag true, the reasons `["dates"]`.
- **S3** the line's amount and the total both differ: `amount` only, not `totals`.
- **S4** only QuickBooks' tax is one cent off: `totals` only.
- **S5** Check again after the fake now returns an equal invoice: the flag becomes false and the
  reasons null.
- **S6** an event with no invoice: 409.
- **S7** the fake says the invoice is gone: `invoice_missing`, the flag unchanged.
- **S8** a deleted quote: `skipped`, the flag unchanged.
- **S9** a check that finds what is already stored writes only its time; a failed check writes only
  the failure time.

## 9. Files

**Counted — 10 files** (limit 10):

1. `src/features/quickbooks-integration/invoice/compareInvoice.ts` — new
2. `src/features/quickbooks-integration/invoice/checkInvoice.ts` — new (replaces
   `checkInvoiceTotals.ts`, deleted)
3. `src/features/quickbooks-integration/invoice/qboInvoiceApi.ts` — changed: the snapshot
4. `src/features/quickbooks-integration/invoice/invoiceTypes.ts` — changed: the reason codes and
   texts, `QboInvoiceSnapshot`, `InvoiceSource` (the hashes out, the reasons in)
5. `src/features/quickbooks-integration/invoice/loadInvoiceSource.ts` — changed: the same fields
6. `src/features/quickbooks-integration/customers.ts` — changed: `readLinkedCustomerId`
7. `src/app/api/quickbooks/invoice/check/route.ts` — changed
8. `src/features/quickbooks-integration/invoice/createInvoice.ts` — changed: the hook
9. `src/features/quickbooks-integration/invoice/updateInvoice.ts` — changed: the hook
10. `src/features/quotesAndBookings/components/quoteDetail/invoice/invoiceActions.ts` — changed:
    the warning's text and the `check` field

(The hash removal in `createInvoice.ts`, `updateInvoice.ts` and `loadInvoiceSource.ts` is spec 04
and 05's amendment; the same files, one commit.)

**Not counted:** the tests of §10; the Playwright spec of §8 (`qboInvoiceCheck.admin.spec.ts` is
rewritten). No migration, no `AppSchema.ts`, no `database.types.ts`, no `permissionPageData.ts`
(06a).

## 10. Tests and implementation sequence

Red first. Prettier only on touched files.

- **`compareInvoice.test.ts`:** an equal invoice matches; each reason of §4 alone, with its
  fields (both dates; both customer fields; each of the four address fields; item and
  description); trimming and missing-versus-empty; two reasons together come in the order of §4;
  `totals` is absent when `amount`, `tax_code` or `lines` is present and present when only the
  totals differ; one cent apart differs; two sales-item lines, none, and a QuickBooks subtotal
  line that is ignored; no stored customer link always gives `customer`; "no Class" equals "no
  Class".
- **Coverage test (`compareCoverage.test.ts`, replaces `invoiceHashParity.test.ts`):** a static
  list maps every member of the body that `buildInvoicePayload` writes to the reason that covers
  it; the test fails when the builder writes a member that is not on the list, and each listed
  member, changed alone, changes the result of `compareInvoice`.
- **`checkInvoice.test.ts`:** the order of §3; `missing` and `skipped` write only the failure time;
  a successful check writes the flag, the reasons and the check time together and clears the
  failure time; a match after a mismatch writes false and null; a QuickBooks failure is a
  `QboReadError`, writes only the failure time and leaves the rest; the invoice is read and every
  reference looked up in the connection of the quote's sales office; the lookups never create
  anything.
- **`qboInvoiceApi` tests:** the snapshot of a full invoice; a missing `TxnTaxDetail` is tax 0;
  a non-sales-item line is left out; a fault 610 is still null.
- **`route.test.ts` (check):** 400, 404, 409, `checked`, `invoice_missing`, `skipped`, 502.
- **`createInvoice.test.ts` and `updateInvoice.test.ts`** (extended): the check runs after the
  link and Log and before the PDF; a failing check returns `invoice_check_failed` and does not
  fail the request; `check` is in the response.
- **`readLinkedCustomerId` test:** the stored id; null when none; a read error throws.
- **Gate:** `npm run tc`, `npx vitest run`, `prettier --check` on the touched files. E2E:
  SKIPPED (not run locally, by instruction). A QuickBooks sandbox run is the user's (§11, R1).

## 11. Risks

- **R1 — false differences from QuickBooks normalising text.** If QuickBooks returns an address,
  a memo or a document number altered (case, abbreviations, trimmed length), the invoice shows a
  difference that Update cannot clear. Only a sandbox run shows whether it does; the comparison
  trims whitespace and nothing more. **To verify.**
- **R2 — every check is two QuickBooks calls** (the invoice and the Item) plus database reads.
  QuickBooks allows a company 500 requests a minute and 10 a second, and Intuit's free partner tier
  500,000 metered reads a month; the checks of 06a (a Save) are far fewer than a check
  on every open would have been, and the user left the two calls as they are.
- **R3 — the non-AST US case is reported, not solved.** A file that is not on Automated Sales Tax
  shows `totals` on every taxed invoice.
- **R4 — "customer" depends on a stored link.** An invoice whose contact link was never written
  (made outside the app) differs until Update.
- **R5 — the token refresh has no lock** (`getQboAccessTokenAndRealmId`). Several requests that find
  the access token expired at the same moment each ask Intuit for a new one with the same refresh
  token; Intuit changes the refresh token from time to time, so the pair that ends up saved can be
  a stale one and the next refresh then fails with `invalid_grant` until an admin presses
  Re-authenticate, which stops every QuickBooks feature of that company. The weakness is older than
  these checks and the user chose to leave it as it is (2026-10-23); the checks add a few more
  requests to the same connection.

## 12. Out of scope

- Any screen or notification (specs 07–11); when the screens call the check (06a).
- Correcting the invoice or the quote automatically.
- A tolerance, or comparing a field the app does not write (terms, custom fields, attachments).
- Checking on a timer, or when QuickBooks changes (no webhook, by the user's decision).
