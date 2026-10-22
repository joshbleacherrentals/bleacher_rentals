# QuickBooks invoice — loading the quote and building the invoice body

Status: **DRAFT 2026-10-22 — awaiting "Approved".** 0 open decisions in this spec (the
QuickBooks Class is spec 03b, BLOCKED).
Implementation order: **03 of 10**. Plan: [qbo-invoice-plan.md](qbo-invoice-plan.md).
Branch: `q4-sprint1-finance-role`.
Builds on: [qbo-invoice-01-link-and-hash.md](qbo-invoice-01-link-and-hash.md) (the hash this
payload must stay in step with). Reads, but does not change, `buildQuoteDocumentData`.

## 0. The request, and what it is not

Everything on the QuickBooks invoice comes from the quote; the user types nothing. This spec
turns a quote into the body of a QuickBooks invoice — nothing is sent to QuickBooks except an
Item lookup. It is a pure builder plus a loader, with no route and no screen.

**Not part of this spec:** the customer (spec 02), the QuickBooks Class (spec 03b), writing
or updating an invoice (specs 04–05), the totals comparison (spec 06).

## 1. Decisions (all taken by the user)

**From the user's own words (not options):**

- **One line.** Product/service `Bleacher Rental - {event type}`; Qty 1; Amount the price
  after discounts, without tax. Event types: City, Corporate, Rural (Sale later).
- **Description** of the line: the QuickBooks Item's own Description (user's answer to
  "what goes into the Description").
- **Bill to:** the client's full name. **Location of Sale:** the quote's venue address.
- **Invoice no.:** the quote's invoice number. **Invoice date:** the Event Start.
- **Due date:** the last due date of the payment schedule; the Event Start when the schedule
  is empty. It may be earlier than the invoice date.
- **Memo on statement:** the quote's title.
- **Tax:** calculated by QuickBooks; a state without tax has the Tax box unchecked.
- **Canada:** not supported yet; an event whose currency is CAD is refused.
- **Not sent:** the invoice is saved, never emailed.

**Reading to confirm at review.** The amount, the dates, the venue and the client's name are
read from `buildQuoteDocumentData` — the same figures the client's own quote page and PDF
show, so the invoice cannot disagree with them. The amount is `subtotalCents +
discountsCents` (discounts are negative), the tax is `taxAmountCents`.

## 2. Research findings

- **What the quote document already holds** (`QuoteDocumentData`): `quoteNumber` (the invoice
  number, or the event id when there is none); `contact` — the finance contact when set,
  otherwise the contact — as `name`, `email`, `phone`; `venue` with `name` (= the event's
  title) and street, city, state, zip of `Events.address_uuid`; `dates.eventStart` as the raw
  date; `subtotalCents`, `discountsCents` (≤ 0), `taxAmountCents`, `totalCents`;
  `paymentSchedule[].dueDate`; `currency` (resolved from the sales office).
- **What it lacks:** the event type, the event status, `invoice_number` as a number, the
  sales office's QuickBooks connection, and the billed contact's id and separate names.
- **The shape QuickBooks accepts**, from the temporary Estimate in
  `api/quickbooks/tax-percent/route.ts`: a `SalesItemLineDetail` line with `Qty`,
  `UnitPrice`, `ItemRef` and a line-level `TaxCodeRef` that **must** be `TAX` or `NON`;
  `ShipAddr` with `Line1`, `City`, `CountrySubDivisionCode`, `PostalCode`. With Automated Sales
  Tax, QuickBooks finds the rate from the shipping address.
- **Event types** are the `EventTypes` rows named `Rural`, `City`, `Corporate`.
- **Hash parity.** Spec 01's current hash lists what the payload may read. A payload member
  with no hash member would never light "outdated".

## 3. Types — `src/features/quickbooks-integration/invoice/invoiceTypes.ts` (new)

- `InvoiceSource` — the quote as the invoice needs it: `eventId`, `eventStatus`,
  `invoiceNumber`, `title`, `eventTypeName`, `eventStart`, `dueDate`, `venue` (street, city,
  state, zip), `billedContact` (id, first name, last name, email, company name),
  `billToName`, `amountCents`, `taxCents`, `currency`, `connectionId` (the sales office's
  QuickBooks connection), plus the link columns of spec 01 (`qboInvoiceId`, …).
- `InvoiceIssue` — `{ code, message }`. Codes: `deleted`, `no_invoice_number`, `no_event_type`,
  `no_sales_office`, `no_connection`, `no_contact`, `no_venue`, `currency_not_supported`.
- `QboItemRef` — `{ id, name, description }`.
- `QboInvoiceBody` — the body, field for field as in §5.

## 4. The loader — `…/invoice/loadInvoiceSource.ts` (new)

`loadInvoiceSource(eventId, origin)` (server, service role) returns `InvoiceSource` or null
when the event does not exist.

- It calls `buildQuoteDocumentData` for the amount, tax, dates, venue, bill-to name and
  currency (§1, reading).
- It then reads what the document lacks with **one table per query, merged in JS** (no query
  with several joins): the event row (`invoice_number`, `event_status`, `event_type_uuid`,
  `event_name`, `sales_office_uuid`, `contact_uuid`, `finance_contact_uuid`, `deleted` and
  the link columns of spec 01); the event type's name; the sales office's `quickbook_uuid`;
  the billed contact (finance contact when set, else contact) and, when it has one, its
  company's name.
- `dueDate` is the latest `paymentSchedule[].dueDate`, or `dates.eventStart` when empty.
- `amountCents` is `subtotalCents + discountsCents`; `taxCents` is `taxAmountCents`.

## 5. The builder — `…/invoice/buildInvoicePayload.ts` (new)

Pure. Two functions.

**`validateInvoiceSource(source)`** returns the list of `InvoiceIssue`:

- the event is deleted;
- `invoiceNumber` is null (old events have none);
- no event type; no sales office; the sales office has no connection;
- no billed contact, or a billed contact with no name;
- no venue street or no venue state;
- `currency` is CAD (Canada is not supported yet).

Each message is written for the person who pressed the button and says what to fix.

**`buildInvoicePayload(source, item, customerId)`** returns the invoice body:

- `DocNumber` — the invoice number as text.
- `TxnDate` — the Event Start. `DueDate` — `dueDate` (§4).
- `CustomerRef` — `customerId`.
- `BillAddr` — `Line1` the client's full name.
- `ShipAddr` — `Line1` street, `City`, `CountrySubDivisionCode` state, `PostalCode` zip.
- `PrivateNote` — the title (the "Memo on statement" box).
- `GlobalTaxCalculation` — `TaxExcluded`.
- `Line` — exactly one `SalesItemLineDetail` line: `Amount` and `UnitPrice` the amount in
  dollars, `Qty` 1, `ItemRef` the Item's id and name, `Description` the Item's own
  Description (omitted when the Item has none), `TaxCodeRef` `TAX` when `taxCents` is above 0,
  `NON` when it is 0.
- No `ClassRef` (spec 03b), no `BillEmail`, no email status: nothing is sent.

The amount in dollars is made from the cents by integer arithmetic into a two-decimal
string, never by floating point.

## 6. The Item — `…/invoice/findQboItem.ts` (new)

`findQboItem(connectionId, eventTypeName)` asks QuickBooks for the active Item named
`Bleacher Rental - {eventTypeName}` (the name is escaped as in spec 02) and returns a
`QboItemRef`. No Item → an error "QuickBooks has no active Item named … in this company";
more than one → "more than one". It never creates an Item.

## 7. Behaviour scenarios

No screen changes, so there is no Playwright scenario. Asserted by the unit tests of §9.

## 8. Files

**Counted — 4 files** (limit 10), all new:

1. `src/features/quickbooks-integration/invoice/invoiceTypes.ts`
2. `src/features/quickbooks-integration/invoice/loadInvoiceSource.ts`
3. `src/features/quickbooks-integration/invoice/buildInvoicePayload.ts`
4. `src/features/quickbooks-integration/invoice/findQboItem.ts`

**Not counted:** the four test files named in §9. No migration, no `AppSchema.ts`, no
`database.types.ts`, no `permissionPageData.ts`.

## 9. Tests and implementation sequence

Red first. Prettier only on touched files.

- **`buildInvoicePayload.test.ts`:**
  - the example `SC - CLEMSON - RALLY` quote, Corporate, $7,500.00: the body has the expected
    `DocNumber`, dates, `ShipAddr`, `PrivateNote`, one line of Qty 1 and Amount `7500.00`;
  - the amount after a discount is subtotal plus the negative discount;
  - cents become dollars exactly (1 cent, 99 cents, 100,000.01) with no float error;
  - `taxCents` above 0 gives `TAX`; 0 gives `NON`;
  - the Item's Description is used; absent Description is omitted;
  - the body has no `ClassRef`, no `BillEmail`.
- **`validateInvoiceSource.test.ts`:** one case per code of §3; a complete source gives no
  issue; CAD gives `currency_not_supported`, USD does not.
- **`loadInvoiceSource.test.ts`:** with `buildQuoteDocumentData` and the client replaced:
  the finance contact is the billed contact when set; the due date is the latest installment
  and falls back to the Event Start; no query joins more than one table; a missing event
  gives null.
- **`findQboItem.test.ts`:** found; none; two; a name with an apostrophe is escaped.
- **Parity test (`invoiceHashParity.test.ts`):** a static list maps every `InvoiceSource`
  field the builder reads to the matching member of spec 01's hash document; the test fails
  when a field is read that is not on the list. Changing each listed input changes the body.
- **Gate:** `npm run tc`, `npx vitest run`, `prettier --check` on the touched files. E2E:
  SKIPPED (not run locally, by instruction).

## 10. Edge cases and error handling

- **A quote whose total is 0.** The body is built with Amount `0.00`; QuickBooks decides.
- **A street that already holds a whole composed address** (see `combineAddressLine`) goes in
  `Line1` as stored. Whether QuickBooks' tax engine reads it correctly: to verify in a sandbox.
- **A company file not on Automated Sales Tax.** The body has no transaction tax code, so
  QuickBooks adds no tax and the totals check (spec 06) reports a mismatch. Not handled here.
- **QuickBooks field names** (`PrivateNote` for "Memo on statement", `ShipAddr` for "Location of
  Sale", `BillAddr.Line1` for "Bill to"): to verify in a sandbox before the feature ships.
- **An Item renamed in QuickBooks** is not found; the message names the wanted Item.
- **Offline / PowerSync.** Not applicable: server-only.
- **Clerk.** The route that calls this code checks the role (spec 04).

## 11. Risks

- **R1 — two sources of truth for one invoice.** The hash is computed in SQL, the payload in
  TypeScript. The parity test and spec 01's SQL test are what keep them in step.
- **R2 — `buildQuoteDocumentData` is a large read** (it also loads terms and signature).
  Using it keeps the invoice equal to the quote; it costs one extra read per press.

## 12. Out of scope

- The QuickBooks Class (spec 03b).
- Creating Items, or using any Item but the one named after the event type.
- Itemising the quote's line items on the invoice.
- Canada, and the Sale event type.
- Any QuickBooks write.
