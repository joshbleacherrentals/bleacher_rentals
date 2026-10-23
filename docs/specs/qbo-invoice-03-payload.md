# QuickBooks invoice — loading the quote and building the invoice body

Status: **Implemented 2026-10-22.** 0 open
decisions. The tax code per Canadian province ([03a](qbo-invoice-03a-province-tax-codes.md))
and the QuickBooks Class ([03b](qbo-invoice-03b-zone-class.md)) are separate specs; the
builder here takes both as inputs. **The Canadian branch was amended on 2026-10-22 by
[03c](qbo-invoice-03c-no-tax-code.md) and [03d](qbo-invoice-03d-canadian-line-tax-code.md)**
after the first sandbox run (QuickBooks Canada refuses `TAX` and `NON` on a line): the text
below is the amended one. **Amended 2026-10-23 — awaiting "Approved":** the invoice hash this
builder had to stay in step with is gone (spec 01); the comparison of
[06](qbo-invoice-06-totals-check.md) now covers every member the builder writes (§2, §9, §11).
Implementation order: **03** (see the plan, §3). Plan: [qbo-invoice-plan.md](qbo-invoice-plan.md).
Branch: `q4-sprint1-finance-role`.
Builds on: [qbo-invoice-01-link-and-hash.md](qbo-invoice-01-link-and-hash.md) (the link columns
and the flag). Reads, but does not change, `buildQuoteDocumentData`.

## 0. The request, and what it is not

Everything on the QuickBooks invoice comes from the quote; the user types nothing. This spec
turns a quote into the body of a QuickBooks invoice — nothing is sent to QuickBooks except an
Item lookup. It is a pure builder plus a loader, with no route and no screen.

**Not part of this spec:** the customer (spec 02), finding the province's tax code (03a) and
the Class (03b), writing or updating an invoice (specs 04–05), the invoice comparison
(spec 06).

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
- **Canada is supported.** A Canadian invoice line carries the tax code chosen per province
  (spec 03a), and a line with no tax carries the connection's no-tax code (spec 03c). A taxed
  quote whose province has no code mapped is created **without tax, with a warning** (user's
  answer).
- **Class:** the quote's zone (spec 03b). A quote with no Class is created **without one,
  with a warning** (user's answer).
- **Not sent:** the invoice is saved, never emailed.

**Reading to confirm at review.** The amount, the dates, the venue and the client's name are
read from `buildQuoteDocumentData` — the same figures the client's own quote page and PDF
show, so the invoice cannot disagree with them. The amount is `subtotalCents +
discountsCents` (discounts are negative), the tax is `taxAmountCents`. The Canadian path is
chosen by the rule the quote form's tax calculator uses: the venue's state is a Canadian
province (`normalizeCanadianProvince`).

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
- **The Canadian file** (sandbox run, 2026-10-22): it refuses `TAX` and `NON` on a line (error
  `6000`, "Make sure all your transactions have a GST/HST rate before you save"). An invoice whose
  line carried a real tax code (`5`, HST ON) and no `TxnTaxDetail` was created, and QuickBooks
  built the tax itself (amount 100.00, tax 13.00, total 113.00). The American file takes only
  `TAX` or `NON`.
- **Event types** are the `EventTypes` rows named `Rural`, `City`, `Corporate`.
- **Comparison parity.** Spec 06 compares the invoice with the body this builder produces, member
  by member. A member the builder writes that the comparison does not cover could never light the
  flag; spec 06's coverage test pins the list.

## 3. Types — `src/features/quickbooks-integration/invoice/invoiceTypes.ts` (new)

- `InvoiceSource` — the quote as the invoice needs it: `eventId`, `eventStatus`,
  `invoiceNumber`, `title`, `eventTypeName`, `eventStart`, `dueDate`, `venue` (street, city,
  state, zip), `billedContact` (id, first name, last name, email, company name),
  `billToName`, `amountCents`, `taxCents`, `currency`, `canadianProvince` (a province code, or
  null for any other state), `connectionId` (the sales office's QuickBooks connection), plus
  the link columns of spec 01 (`qboInvoiceId`, …).
- `InvoiceIssue` — `{ code, message }`. Codes: `deleted`, `no_invoice_number`, `no_event_type`,
  `no_sales_office`, `no_connection`, `no_contact`, `no_venue`.
- `QboItemRef` — `{ id, name, description }`.
- `InvoiceRefs` — what the builder is given besides the quote: `item` (a `QboItemRef`),
  `customerId`, `classId` (or null, spec 03b), `canadianTaxCodeId` (or null, spec 03a),
  `noTaxCodeId` (or null, spec 03c).
- `InvoiceBuildWarning` — `{ code: "tax_code_missing", province }`.
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
- `canadianProvince` is `normalizeCanadianProvince(venue.state)`.

## 5. The builder — `…/invoice/buildInvoicePayload.ts` (new)

Pure. Two functions.

**`validateInvoiceSource(source)`** returns the list of `InvoiceIssue`:

- the event is deleted;
- `invoiceNumber` is null (old events have none);
- no event type; no sales office; the sales office has no connection;
- no billed contact, or a billed contact with no name;
- no venue street or no venue state.

Each message is written for the person who pressed the button and says what to fix.

**`buildInvoicePayload(source, refs)`** returns `{ body, warnings }`; `body` is the invoice
body:

- `DocNumber` — the invoice number as text.
- `TxnDate` — the Event Start. `DueDate` — `dueDate` (§4).
- `CustomerRef` — `customerId`.
- `BillAddr` — `Line1` the client's full name.
- `ShipAddr` — `Line1` street, `City`, `CountrySubDivisionCode` state, `PostalCode` zip.
- `PrivateNote` — the title (the "Memo on statement" box).
- `GlobalTaxCalculation` — `TaxExcluded`.
- `Line` — exactly one `SalesItemLineDetail` line: `Amount` and `UnitPrice` the amount in
  dollars, `Qty` 1, `ItemRef` the Item's id and name, `Description` the Item's own
  Description (omitted when the Item has none), `TaxCodeRef` (below), and `ClassRef` when
  `refs.classId` is set.
- **United States.** `TaxCodeRef` is `TAX` when `taxCents` is above 0 and `NON` when it is 0. No
  `TxnTaxDetail`: with Automated Sales Tax QuickBooks calculates the tax from the shipping
  address.
- **Canada** (when `canadianProvince` is set; amended by 03d). `TaxCodeRef` is never `TAX` or
  `NON`: it is `refs.canadianTaxCodeId` when `taxCents` is above 0 and that code is mapped;
  otherwise it is `refs.noTaxCodeId`, and when the quote was taxed but the province has no code
  `warnings` holds `tax_code_missing` with the province. There is no `TxnTaxDetail`. A Canadian
  quote that needs `noTaxCodeId` and is given null makes the builder throw (the create route has
  refused it before). `needsNoTaxCode(source, canadianTaxCodeId)` says when that is.
- No `BillEmail`, no email status: nothing is sent.

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
  - United States: `taxCents` above 0 gives `TAX`; 0 gives `NON`; never a `TxnTaxDetail`;
  - the Item's Description is used; absent Description is omitted;
  - `ClassRef` is present only when `classId` is given; the body has no `BillEmail`;
  - Canada (amended by 03d), taxed, code mapped: the line's `TaxCodeRef` is the province's code;
    taxed, no code: the line carries the no-tax code, no `TxnTaxDetail`, the `tax_code_missing`
    warning; untaxed: the line carries the no-tax code, no warning; never `TAX` or `NON` on a
    Canadian line; a Canadian quote that needs the no-tax code and gets null throws;
    `needsNoTaxCode` is true for an untaxed quote and for a taxed one with no province code.
- **`validateInvoiceSource.test.ts`:** one case per code of §3; a complete source gives no
  issue; a Canadian and a US source both pass.
- **`loadInvoiceSource.test.ts`:** with `buildQuoteDocumentData` and the client replaced:
  the finance contact is the billed contact when set; the due date is the latest installment
  and falls back to the Event Start; `canadianProvince` is set for "ON", "Ontario" and
  "Québec" and null for "SC"; no query joins more than one table; a missing event gives null.
- **`findQboItem.test.ts`:** found; none; two; a name with an apostrophe is escaped.
- **Parity test:** `invoiceHashParity.test.ts` is **deleted** with the hash; spec 06's
  `compareCoverage.test.ts` replaces it (every member of the body mapped to the reason that
  covers it). The builder's own tests above keep checking that each input changes the body.
- **Gate:** `npm run tc`, `npx vitest run`, `prettier --check` on the touched files. E2E:
  SKIPPED (not run locally, by instruction).

## 10. Edge cases and error handling

- **A quote whose total is 0.** The body is built with Amount `0.00`; QuickBooks decides.
- **A street that already holds a whole composed address** (see `combineAddressLine`) goes in
  `Line1` as stored. Whether QuickBooks' tax engine reads it correctly: to verify in a sandbox.
- **A US file that is not on Automated Sales Tax.** The body has no transaction tax code, so
  QuickBooks adds no tax and the invoice check (spec 06) reports a mismatch. Not handled here.
- **A Canadian quote typed with a tax by hand** (`is_tax_overridden`). QuickBooks still
  applies the mapped code's rate to the amount, so a different typed tax shows as a mismatch.
- **QuickBooks field names** (`PrivateNote` for "Memo on statement", `ShipAddr` for "Location of
  Sale", `BillAddr.Line1` for "Bill to"): to verify in a sandbox before the feature ships.
- **An Item renamed in QuickBooks** is not found; the message names the wanted Item.
- **Offline / PowerSync.** Not applicable: server-only.
- **Clerk.** The route that calls this code checks the role (spec 04).

## 11. Risks

- **R1 — the builder and the comparison must stay in step.** The comparison reads the builder's
  body, so a new member the builder writes is compared only once spec 06's list covers it; the
  coverage test fails until it does.
- **R2 — `buildQuoteDocumentData` is a large read** (it also loads terms and signature).
  Using it keeps the invoice equal to the quote; it costs one extra read per press.

## 12. Out of scope

- Finding the province's tax code (03a) and the Class (03b); this spec only places them.
- Creating Items, or using any Item but the one named after the event type.
- Itemising the quote's line items on the invoice.
- The Sale event type.
- Any QuickBooks write.
