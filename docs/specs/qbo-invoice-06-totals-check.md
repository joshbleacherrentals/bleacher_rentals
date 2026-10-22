# QuickBooks invoice — the totals check

Status: **DRAFT 2026-10-22 — awaiting "Approved".** 0 open decisions.
Implementation order: **06** (see the plan, §3). Plan: [qbo-invoice-plan.md](qbo-invoice-plan.md).
Branch: `q4-sprint1-finance-role`.
Needs: [01](qbo-invoice-01-link-and-hash.md) (`qbo_invoice_mismatch`),
[04](qbo-invoice-04-create.md) and [05](qbo-invoice-05-update.md) (the hooks).

## 0. The request, and what it is not

QuickBooks calculates the tax itself. After every create and update the app reads the invoice
back and checks that QuickBooks' **total** and **tax** are exactly the quote's. A difference
is stored on the quote as a flag, which later specs show to accountants. A **Check again**
route lets someone re-run the comparison after the invoice was corrected by hand.

**Not part of this spec:** any screen, banner, count or button (specs 07–11); correcting the
invoice or the quote; a tolerance (the user said none).

## 1. Decisions (all taken by the user)

**From the user's own words (not options):**

- **What is compared:** the sums and the taxes of the QuickBooks invoice against the quote's.
- **Tolerance:** none. One cent apart is a mismatch.
- **When:** after creating or updating the invoice, and again on demand ("Both": a Check again
  button and the check on every Update).
- **A mismatch is a notification for accountants** that the invoice must be reviewed and
  corrected. Where it shows is specs 09–11.

## 2. Research findings

- **What QuickBooks returns.** An invoice carries `TotalAmt` and `TxnTaxDetail.TotalTax` in
  dollars. An invoice with no tax has no `TxnTaxDetail`, which reads as 0.
- **What the quote says.** `totalCents` and `taxAmountCents` of `QuoteDocumentData`: the
  amount after discounts plus the tax, where the tax is `tax_amount_cents` when set, else the
  rate on the amount. Spec 03 loads both into `InvoiceSource` (`amountCents`, `taxCents`;
  the total is their sum).
- **The flag** `qbo_invoice_mismatch` and the sent hash are columns of spec 01.
- **The hooks.** Spec 04 step 11 and spec 05 case 1 step 10 are where this runs.

## 3. The comparison — `…/invoice/checkInvoiceTotals.ts` (new)

Pure part:

- `dollarsToCents(value)` — QuickBooks' decimal (a number or a string) to whole cents, with
  no float error (`8032.5` is 803250).
- `compareInvoiceTotals({ quote: { totalCents, taxCents }, qbo: { totalCents, taxCents } })`
  returns `{ matches, differences }`. `differences` is a list of `{ field, quoteCents,
qboCents }` with `field` either `total` or `tax`; `matches` is true when the list is empty.

Server part:

- `runTotalsCheck(eventId, source)` reads the invoice from QuickBooks by the stored id and
  connection (spec 05's read), compares, and sets `Events.qbo_invoice_mismatch` to
  `!matches` with the service role. It returns the comparison. An invoice not found in
  QuickBooks returns `missing` and leaves the flag as it is.

## 4. The hooks (changes to specs 04 and 05)

- `createInvoice.ts` and `updateInvoice.ts` call `runTotalsCheck` at the marked step, after
  the link and Log are written and before the PDF.
- The response gains a `totals` field: `{ matches, differences }`.
- A check that itself fails (QuickBooks unreachable, an unreadable reply) does **not** fail
  the request: the response carries the warning `totals_check_failed` and the flag stays as
  it was.

## 5. The route — `src/app/api/quickbooks/invoice/check/route.ts` (new)

`POST` with `{ eventId }`.

- Admin or accountant only (`requireAdminOrAccountant`): 401, 403.
- 400 for a missing or non-uuid `eventId`; 404 for no such event.
- 409 when the event has no invoice: "This quote has no QuickBooks invoice yet."
- 200 `{ status: "checked", matches, differences }` and the flag is stored.
- 200 `{ status: "invoice_missing" }` when QuickBooks no longer has it; nothing is stored.
- 502 when QuickBooks cannot be reached, with its readable message.

It reads the invoice in the connection stored on the quote, not the office's current one.

## 6. Edge cases and error handling

- **The check runs on data older than the quote.** If the quote changed after the invoice was
  written, the check compares QuickBooks with the **current** quote, so the flag can say
  "mismatch" for an invoice that is merely outdated. The two signals are independent; spec 09
  shows both.
- **A US file that is not on Automated Sales Tax.** QuickBooks adds no tax to a line marked
  taxable (spec 03, §10); the check reports a tax difference.
- **A Canadian invoice.** QuickBooks applies the province's mapped code (spec 03a); a code
  whose rate differs from the calculator's, a province with no code (the invoice was made
  untaxed, with a warning) and a tax typed by hand on the quote all show as a tax difference.
- **Sub-cent rounding.** QuickBooks rounds tax per line; with one line the totals can still
  differ by a cent from the quote's. That is reported: there is no tolerance.
- **Check again on an invoice paid or voided.** QuickBooks' totals are read as they are.
- **Offline / PowerSync.** The route is online-only. The flag syncs down to every client.
- **Clerk.** The 401 above; nothing else is touched.

## 7. Behaviour scenarios

Playwright, written, **not run** (the routes are replaced by fakes):

- **S1** an invoice whose totals equal the quote: `matches` true, the flag false.
- **S2** QuickBooks' tax is one cent off: `matches` false, one `tax` difference, the flag
  true.
- **S3** Check again after the fake now returns equal totals: the flag becomes false.
- **S4** an event with no invoice: 409.
- **S5** the fake says the invoice is gone: `invoice_missing`, the flag unchanged.
- **S6** a viewer and an account manager: 403.

## 8. Files

**Counted — 5 files** (limit 10):

1. `src/features/quickbooks-integration/invoice/checkInvoiceTotals.ts` — new
2. `src/app/api/quickbooks/invoice/check/route.ts` — new
3. `src/features/quickbooks-integration/invoice/qboInvoiceApi.ts` — changed: read the totals
4. `src/features/quickbooks-integration/invoice/createInvoice.ts` — changed: the hook
5. `src/features/quickbooks-integration/invoice/updateInvoice.ts` — changed: the hook

**Not counted:** the tests of §9; the Playwright spec of §7. No migration, no
`AppSchema.ts`, no `database.types.ts`, no `permissionPageData.ts`.

## 9. Tests and implementation sequence

Red first. Prettier only on touched files.

- **`checkInvoiceTotals.test.ts`:** `dollarsToCents` for whole, one-decimal and two-decimal
  values and a string; equal totals match; each of total and tax alone differing; both
  differing give two differences; a missing `TxnTaxDetail` is tax 0; a one-cent difference is
  a mismatch; `runTotalsCheck` writes the flag true, then false on a later match; `missing`
  writes nothing.
- **`route.test.ts` (check):** 401, 403, 400, 404, 409, `checked`, `invoice_missing`, 502; the
  invoice is read in the stored connection.
- **`createInvoice.test.ts` and `updateInvoice.test.ts`** (extended): the check runs after the
  link and Log and before the PDF; a failing check returns the warning and does not fail
  the request; `totals` is in the response.
- **Gate:** `npm run tc`, `npx vitest run`, `prettier --check` on the touched files. E2E:
  SKIPPED (not run locally, by instruction).

## 10. Risks

- **R1 — the non-AST US case is reported, not solved.** Spec 03 assumes Automated Sales Tax
  for the US file; one that is not on it shows a mismatch on every taxed invoice. Canada is
  covered by spec 03a's mapping; where the mapping is wrong or missing, the check says so.
- **R2 — a flag that nobody clears.** The flag is cleared only by a later check (Check again
  or Update). An accountant who fixes the invoice and does nothing else keeps the flag.

## 11. Out of scope

- Any screen or notification (specs 07–11).
- Correcting the invoice or the quote automatically.
- A tolerance, or comparing the line's Amount alone.
- Checking on a timer, or when QuickBooks changes (no webhook).
