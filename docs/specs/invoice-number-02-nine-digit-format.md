# Invoice number — shown and sent with nine digits

Status: **Implemented 2026-11-04 (approved in chat); amended the same day: QuickBooks gets the
plain number, no zeros (§1a).** 0 open decisions; three
readings to confirm (§1, last paragraph). Pair: [01 — the database assigns it](invoice-number-01-assign-in-database.md); the two
are independent and may ship in either order. Branch: `q4-sprint3-bug-fix`.

## 0. The request, and what it is not

New invoice numbers are 1, 2, 3, …; they must read `000000001`, `000000002`, … wherever a person
sees them (**not** in QuickBooks, §1a). The number stays a **number** in the database (so sorting,
the unique index and every query are unchanged); the zeros are added when it is shown, by **one**
helper used in every place.

## 1a. Amendment 2026-11-04 — QuickBooks gets the plain number

The first version sent `000000043` as the QuickBooks `DocNumber`. The user saw that the database says
`43` while QuickBooks says `000000043`, and that Update invoice then refuses the invoice ("does not
have this quote's invoice number (43)"). **Decision (the user's): QuickBooks carries the number as
stored — `43`, never `000000043`.** Everything a person reads in the app keeps the nine digits.

- `buildInvoicePayload.ts` writes `DocNumber` as `String(invoiceNumber)`; `createInvoice.ts` asks for
  the same text in its duplicate check. `updateInvoice.ts` already compared with `String(...)` and
  does not change.
- An invoice created in QuickBooks under the zero-padded text (only test invoices, made before this
  amendment) no longer matches; its number must be changed in QuickBooks, or the invoice deleted
  there, before Update invoice can link it.
- Old nine-digit numbers are unaffected: `String(483920174)` is the same text as before.

Where the rest of this spec says QuickBooks gets nine digits, §1a wins.

**Not part of this spec:** assigning numbers (01); the column's type, `AppSchema.ts`, sync rules.

## 1. Decisions (all taken by the user)

**Question — how the number with zeros is kept**

- **Option A — stored as a number, padded when shown or sent.** The column does not change; one
  helper is needed and must be used everywhere.
- **Option B — stored as text with the zeros.** What the database holds is what is sent, but the
  column, `AppSchema.ts` and about 23 source files change, and a rule "exactly nine digits" is
  needed so `42` and `000000042` cannot both exist.
- **User's answer: A.**

**From the user's own words (not options):**

- The old nine-digit numbers read as they do now (they already have nine digits).
- No two events share a number (kept by the existing unique index; 01).

**Readings to confirm at review.**

- **Search.** The list search compares what the user types with the **padded** number, so typing
  `000000042` finds that event and typing `42` still does (it is contained in `000000042`, as a
  fragment of a number was matched before).
- **An event with no number** keeps its present look: "—" in the lists, and the event's uuid as the
  quote number on the PDF and public page (`resolveInvoiceDisplay`). After 01 that happens only
  until the first sync.
- **Places.** The list of §4 is what a search of the code found on 2026-11-03; the implementation
  repeats the search (`invoice_number`, `invoiceNumber`) and, if it finds another place that shows
  or sends the number, uses the helper there and says so.

## 2. Research findings

- **Where the number is sent to QuickBooks:** `buildInvoicePayload.ts` (`DocNumber`) and
  `createInvoice.ts` (the duplicate check `findInvoiceByDocNumber`). The invoice check
  (`compareInvoice`) compares the built `DocNumber` with QuickBooks', so it follows the payload.
- **Where it appears through `quoteNumber`** (built once, in `quoteDocumentData.ts`, from
  `resolveInvoiceDisplay`): the quote PDF and its file name (download, e-mail attachment, the copy
  attached to the QuickBooks invoice), the signed-contract PDF name, the contract pages' footer, the
  Checks Payable memo, the public quote page and Pay tab, and the quote e-mail's heading and footer.
  Changing `resolveInvoiceDisplay` covers all of them; none of those files changes.
- **Where it appears on its own:** the Stripe checkout label (`create-checkout/route.ts`,
  `#{number}`), the Accounts Receivable and Need attention lists (`#{number}`), the Contract tab, the
  event history sheet and the quote detail title.
- **The public route** `/api/quotes/[id]/version` takes digits and reads them with `Number(...)`, so
  `000000042` already means 42 there; nothing changes (a test pins it).
- **Existing invoices in QuickBooks** carry the old nine-digit number as text; that text is the same
  as `String(number)`, so the check keeps matching them (§1a).
- **Numbers of ten digits or more** are not cut: padding only adds zeros in front.

## 3. Database

None.

## 4. App changes

- **`utils/invoiceNumber.ts`** (changed): new `formatInvoiceNumber(n: number | null | undefined):
string | null` — the number as text, padded with zeros to nine digits; null for null, undefined or 0.
  `resolveInvoiceDisplay` uses it and keeps its fall-back to the event id.
- **`buildInvoicePayload.ts`, `createInvoice.ts`** (changed, then amended by §1a): `DocNumber` and
  the duplicate-check value are `String(source.invoiceNumber)` — the plain number, no zeros (the
  existing `no_invoice_number` refusal already guarantees the number is set).
- **`create-checkout/route.ts`** (changed): the label is `#{formatted number}`; without a number it
  stays the first eight characters of the id.
- **`utils/searchEvents.ts`** (changed): the invoice-number part of the search compares against the
  padded text.
- **`AccountsReceivableTabs.tsx`, `NeedAttentionTab.tsx`** (changed): `#{formatted}` or "—".
- **`ContractTab.tsx`, `EventHistorySheet.tsx`, `QuoteDetailView.tsx`** (changed): the number is
  shown formatted, with the same "—" or absent behaviour as now.
- **`permissionPageData.ts`**: unchanged; no role's ability changes.

## 5. Behaviour scenarios

Playwright, written, **not run** (by instruction).

- **S1** the quote detail page of an event whose number is 42 reads `#000000042` in its title.
- **S2** the Accounts Receivable list shows `#000000042` for it, and searching `000000042` and `42`
  both find it.

## 6. Files

**Counted — 10 files** (limit 10):

1. `src/features/quotesAndBookings/utils/invoiceNumber.ts` — changed
2. `src/features/quickbooks-integration/invoice/buildInvoicePayload.ts` — changed
3. `src/features/quickbooks-integration/invoice/createInvoice.ts` — changed
4. `src/app/api/payments/create-checkout/route.ts` — changed
5. `src/features/quotesAndBookings/utils/searchEvents.ts` — changed
6. `src/features/quotesAndBookings/components/AccountsReceivableTabs.tsx` — changed
7. `src/features/quotesAndBookings/components/NeedAttentionTab.tsx` — changed
8. `src/features/quotesAndBookings/components/quoteDetail/tabs/ContractTab.tsx` — changed
9. `src/features/quotesAndBookings/components/quoteDetail/tabs/EventHistorySheet.tsx` — changed
10. `src/features/quotesAndBookings/components/quoteDetail/QuoteDetailView.tsx` — changed

**Not counted:** `invoiceNumber.test.ts`, `buildInvoicePayload.test.ts`, `createInvoice.test.ts`,
`searchEvents.test.ts`, `AccountsReceivableTabs.test.tsx`, `NeedAttentionTab.test.tsx`, the test of
`parseVersionIdParam` (edited or added); the Playwright file of §5 (new). No migration, no
`database.types.ts`, no `AppSchema.ts`, no `sync_rules.yaml`.

## 7. Tests and implementation sequence

Red first. Prettier only on touched files.

- **`invoiceNumber.test.ts`:** 1 → `000000001`; 42 → `000000042`; 483920174 → `483920174`;
  1234567890 (ten digits) is not cut; null, undefined and 0 → null; `resolveInvoiceDisplay` returns the
  padded text, and the event id when there is no number.
- **`buildInvoicePayload.test.ts`, `createInvoice.test.ts`** (as amended by §1a): a source with
  number 42 builds `DocNumber` `42` and the duplicate check queries `DocNumber = '42'`; a nine-digit
  number is unchanged.
- **`searchEvents.test.ts`:** `000000042` and `42` both match number 42; a number that does not
  contain the text does not match.
- **List and detail components:** the formatted text appears; no number still shows "—".
- **`parseVersionIdParam`:** `000000042` parses as the invoice number 42.
- **Gate:** `npm run tc`, `npx vitest run`, `prettier --check` on the touched files. E2E: SKIPPED
  (not run locally, by instruction).

## 8. Edge cases and error handling

- **No number yet** (a quote not yet synced): "—" in lists, the id on the PDF, `no_invoice_number` on
  Create invoice; unchanged.
- **A quote invoiced before this change** keeps the number it was created with; an old nine-digit
  one keeps matching. A test invoice created as `000000043` does not (§1a).
- **Offline / PowerSync, Clerk.** Not applicable: display only.

## 9. Risks

- **R1 — a place that shows the number and is not in §4** would show `42` next to `000000042`
  elsewhere. §1 (readings) commits the implementation to repeat the search.

## 10. Out of scope

- Storing the number as text, or changing the column.
- Reformatting the old nine-digit numbers or giving them a common order with the new ones.
