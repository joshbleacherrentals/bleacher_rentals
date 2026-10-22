# QuickBooks invoice — the Canadian line carries a real tax code

Status: **Implemented 2026-10-22.** 0 open decisions; two readings to confirm
(§1, last paragraph). Specs 03 and 04 now carry the amended text.
Implementation order: **03d**, after [03c](qbo-invoice-03c-no-tax-code.md) (the setting it reads).
Plan: [qbo-invoice-plan.md](qbo-invoice-plan.md).
Branch: `q4-sprint1-finance-role`.
Amends: [03](qbo-invoice-03-payload.md) (§1, §2, §3, §5, §9) and [04](qbo-invoice-04-create.md)
(§4 step 8, §11). Both are implemented; their text is brought in line after this spec is approved.

## 0. The request, and what it is not

Spec 03 puts `TAX` or `NON` on the invoice line and, for Canada, adds a transaction tax code
(`TxnTaxDetail`). The first sandbox run (2026-10-22) showed that a Canadian QuickBooks file refuses
this: it wants the **real tax code on the line**. This spec changes the Canadian branch of the
builder and of the create route; nothing else.

**Not part of this spec:** the setting that holds the no-tax code (03c); the US path, which stays
as it is; the province mapping (03a); the totals check (spec 06).

## 1. Decisions (all taken by the user)

**From the user's own words (not options):**

- **Canada is supported**, and a taxed Canadian quote whose province has no code mapped is created
  **untaxed, with a warning** (earlier decisions, unchanged).
- **The code of a line with no tax** is the connection's **no-tax code**, set by an admin on
  `/quickbooks` (spec 03c; the user chose Exempt).

**What the sandbox showed (2026-10-22).** An invoice in the Canadian file with one line whose
`TaxCodeRef` was `5` (HST ON) and with no `TxnTaxDetail` was created: `TotalAmt` 113, `TotalTax` 13
for an amount of 100.00. QuickBooks built the tax lines itself. The American file refused any line
code but `TAX` or `NON`.

**Readings to confirm at review.**

- That sandbox run was made **without** a `TxnTaxDetail` in the request (user to confirm), so this
  spec stops sending it for Canada.
- A Canadian invoice that needs the no-tax code while the connection has none is **refused with a
  message** (400), because QuickBooks would refuse any other code on the line.

## 2. The change to spec 03 and spec 04

**Types (`invoiceTypes.ts`).**

- `QboInvoiceLine.SalesItemLineDetail.TaxCodeRef` is `{ value: string }` (it was
  `"TAX" | "NON"`); `QboInvoiceBody` loses its optional `TxnTaxDetail`.
- `InvoiceRefs` gains `noTaxCodeId: string | null` (the connection's, spec 03c).
  `canadianTaxCodeId` keeps its meaning (the province's code, spec 03a).
- `InvoiceBuildWarning` is unchanged: `tax_code_missing` with the province.

**Builder (`buildInvoicePayload.ts`).**

- **United States** (the venue's state is not a Canadian province): unchanged — `TAX` when
  `taxCents` is above 0, `NON` when it is 0; no `TxnTaxDetail`.
- **Canada, taxed, province code mapped:** the line's `TaxCodeRef` is `refs.canadianTaxCodeId`.
- **Canada, taxed, province code not mapped:** the line's `TaxCodeRef` is `refs.noTaxCodeId` and
  `warnings` holds `tax_code_missing` with the province.
- **Canada, untaxed:** the line's `TaxCodeRef` is `refs.noTaxCodeId`; no warning.
- **Canada, no `TxnTaxDetail` in any case.**
- A Canadian quote that needs `noTaxCodeId` and is given null makes the builder throw: the create
  route has refused it before.

**Create route (`createInvoice.ts`, step 8).** For a Canadian quote the route also reads
`resolveNoTaxCode(connectionId)` (spec 03c). When the quote needs the no-tax code (untaxed, or taxed
with no province code) and the connection has none, the request ends with a 400 and the message
"This QuickBooks connection has no 'no tax' code for Canadian invoices. Ask an admin to choose one
on the QuickBooks page.", before anything is created in QuickBooks. Everything else in §4 of spec 04
is as it was.

## 3. Behaviour scenarios

No screen changes, so there is no Playwright scenario. Asserted by the unit tests of §5.

## 4. Files

**Counted — 3 files** (limit 10), all changed:

1. `src/features/quickbooks-integration/invoice/invoiceTypes.ts`
2. `src/features/quickbooks-integration/invoice/buildInvoicePayload.ts`
3. `src/features/quickbooks-integration/invoice/createInvoice.ts`

**Not counted:** the tests of §5. No migration, no `AppSchema.ts`, no `database.types.ts`, no
`permissionPageData.ts` (03c carries the matrix note). After approval the texts of specs 03 and 04
named under "Amends" are corrected to match; they are documents, not code.

## 5. Tests and implementation sequence

Red first. Prettier only on touched files.

- **`buildInvoicePayload.test.ts`** — the Canadian cases are rewritten:
  - taxed, code mapped: the line's `TaxCodeRef` is the province's code; the body has no
    `TxnTaxDetail`; no warning;
  - taxed, code not mapped: the line carries the no-tax code, no `TxnTaxDetail`, the
    `tax_code_missing` warning;
  - untaxed: the line carries the no-tax code, no warning;
  - United States: still `TAX` and `NON`, never a `TxnTaxDetail`;
  - a Canadian quote that needs the no-tax code, given null, throws.
- **`createInvoice.test.ts`:**
  - a Canadian quote reads the no-tax code and a US quote does not;
  - the body sent for a taxed Canadian quote carries the province's code on the line and no
    `TxnTaxDetail`; with no mapped code it carries the no-tax code and the warning;
  - a Canadian quote that needs the no-tax code while the connection has none is refused with 400
    and the message of §2, and nothing is created in QuickBooks, written to `Events` or logged;
  - a Canadian quote whose province code is mapped does not need the no-tax code, so a missing one
    does not stop it.
- **`invoiceHashParity.test.ts`:** unchanged unless it names `TxnTaxDetail` (then that mention is
  removed).
- **Gate:** `npm run tc`, `npx vitest run`, `prettier --check` on the touched files. E2E: SKIPPED
  (not run locally, by instruction). A sandbox re-run is the user's: a taxed Canadian quote and an
  untaxed one, both created and shown with the right tax.

## 6. Edge cases and error handling

- **A province code that is not a code of the file.** QuickBooks refuses the invoice; the message
  passes on (spec 04).
- **A province code whose rate differs from the calculator's.** The invoice carries QuickBooks'
  tax; the totals check (spec 06) reports the mismatch (03a, R1).
- **A taxed quote with no province code.** Created with the no-tax code and the warning; its tax
  in QuickBooks is zero until the province is mapped and the invoice updated (spec 05).
- **A Canadian file that still wants a transaction-level code.** Not expected after the sandbox
  run; if it happens, QuickBooks' own message passes on.
- **The invoice's currency.** The sandbox invoice came back in USD although the file's tax codes
  are Canadian; the body does not set a currency. To verify in the real Canadian company.
- **The hash.** The codes come from settings, not from the quote, so changing a mapping does not
  make an invoice "outdated" (as before).
- **Offline / PowerSync.** Not applicable: server-only.
- **Clerk.** The route that calls this code checks the role (spec 04).

## 7. Risks

- **R1 — one sandbox run.** The line-code rule is confirmed once, in one file, for one province;
  other provinces and the no-tax code are for the user's sandbox run (§5).
- **R2 — a missing no-tax code** blocks Canadian invoices that need it until an admin sets it.

## 8. Out of scope

- The setting itself (03c) and the province mapping (03a).
- Any change to the US path.
- Sending a currency, or any other field, on the invoice.
- Updating invoices already made with the old Canadian body (none exist: it never succeeded).
