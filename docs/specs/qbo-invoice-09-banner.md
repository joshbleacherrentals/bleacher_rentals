# QuickBooks invoice — the attention rule and the banner on the quote card

Status: **DRAFT 2026-10-22 — awaiting "Approved".** 0 open decisions; one reading to confirm
(§1, last paragraph).
Implementation order: **09 of 11**. Plan: [qbo-invoice-plan.md](qbo-invoice-plan.md).
Branch: `q4-sprint1-finance-role`.
Needs: [01](qbo-invoice-01-link-and-hash.md) (the hashes and the flag),
[06](qbo-invoice-06-totals-check.md) (the flag is written),
[07](qbo-invoice-07-card-buttons.md) (the capability table's new entry).

## 0. The request, and what it is not

An accountant must be told when a quote's QuickBooks invoice needs attention. This spec adds:

- **the rule** that says when an invoice needs attention and why — used by this spec, and by
  specs 10 and 11;
- **the banner** on the quote card, drawn for accountants only.

**Not part of this spec:** the Need attention tab, the sidebar counts, the tab counts and the
row marks (specs 10–11).

## 1. Decisions (all taken by the user)

**From the user's own words (not options):**

- **A quote needs attention in two cases:** its invoice is **outdated** (the quote changed
  since the invoice was last written) or its totals **do not match** (spec 06).
- **Outdated** is decided by comparing the two hashes of spec 01: the hash the quote has now
  against the hash that was sent.
- **Who sees the signals: accountants only.** An admin who is not an accountant sees none of
  them.
- **Places:** the user picked all four — sidebar counts, tab counts, a row mark and a card
  banner. This spec is the banner.
- **Whatever the status:** once an invoice exists, its alerts stay (plan: "Keep everything").

**Reading to confirm at review.**

- The banner is **not drawn on a deleted quote** (a deleted quote already has its own
  notice and no actions).
- An invoice whose sent hash is empty counts as outdated.
- Both reasons can show at once, one line each.

## 2. Research findings

- **The two hashes and the flag** are `qbo_invoice_hash`, `qbo_invoice_sent_hash` and
  `qbo_invoice_mismatch` on `Events`, synced to the card (spec 01).
- **Where the card draws its notices.** `QuoteDetailView.tsx` draws a deleted-quote notice
  above the tab bar and gets its permissions from `useQuotesBookingsCapabilities`.
- **Mismatch and outdated are independent** (spec 06, §6): a quote edited after the invoice
  was written can show "mismatch" for an invoice that is also outdated.
- **The pattern.** `/work-trackers` keeps every number, mark and count it shows in one
  function over the same rows (`attentionTrackers.ts`), so the numbers cannot disagree.

## 3. The rule — `src/features/quotesAndBookings/utils/invoiceAttention.ts` (new)

Pure.

- `InvoiceAttentionInput` — `qboInvoiceId`, `hash` (the current hash), `sentHash`, `mismatch`
  (0, 1, true, false or null), all as the local database gives them.
- `InvoiceAttentionReason` — `"outdated"` or `"mismatch"`.
- `invoiceAttentionReasons(input)` returns the reasons, in the order outdated, mismatch:
  - no `qboInvoiceId` → none, whatever else is set;
  - **outdated** when `sentHash` is empty, or differs from `hash`;
  - **mismatch** when the flag is set.
- `INVOICE_ATTENTION_TEXT` — for each reason a **short** text for lists (`Invoice out of date`,
  `Totals do not match`) and a **long** text for the banner (§4). One place, so no surface
  words it differently.

## 4. The banner

**`useInvoiceAttention.ts`** (new, in `quoteDetail/invoice/`) reads the four columns of the
event from the local database, reactively, and returns `invoiceAttentionReasons(…)`.

**`InvoiceAttentionBanner.tsx`** (new) draws one line per reason, in the red the attention
marks of `/work-trackers` use:

- **outdated:** "The quote has changed since its QuickBooks invoice was last updated. Press
  Update invoice on the Billing tab."
- **mismatch:** "The totals in QuickBooks do not match this quote. Review the invoice in
  QuickBooks and correct it, then press Check again on the Billing tab."

It draws nothing when there are no reasons.

**`QuoteDetailView.tsx`** (changed) draws the banner above the tab bar, next to the
deleted-quote notice, only when `can.seeInvoiceAlerts` and the quote is not deleted.

**`getQuotesBookingsCapabilities.ts`** (changed) gains **`seeInvoiceAlerts`**: true for an
accountant, on any quote; false for an admin who is not an accountant and for every other
role. Roles are additive: an admin who is also an accountant gets it.

## 5. Permissions — `src/features/userAccess/permissionPageData.ts`

**A new row**, label **QuickBooks Invoice Alerts**, category "Day to Day Operations".
Description: "The red notice on a quote whose QuickBooks invoice needs attention: either the
quote changed since the invoice was last updated, or QuickBooks' total or tax does not match
the quote's."

- **admin:** `none` — "Does not see the invoice alerts. They can still create and update the
  invoice."
- **account_manager:** `none` — "Does not see the invoice alerts."
- **developer:** `none` — the existing developer note about quotes.
- **viewer:** `none` — "Does not see the invoice alerts."
- **driver:** `none` — "Drivers only have access to the Driver Mobile App."
- **maintainer:** `none` — `MAINTAINER_NO_ACCESS_NOTE`.
- **accountant:** `full` — "Sees the notice on any quote with a QuickBooks invoice, deleted
  quotes excepted."

`permissionPageData.test.ts` gains the row's levels.

## 6. Behaviour scenarios

Playwright, written, **not run**; the data is seeded by writing the columns of `Events`.

- **S1** accountant, a quote whose sent hash equals its hash and whose flag is false: no
  banner.
- **S2** accountant, a quote whose two hashes differ: the outdated line.
- **S3** accountant, a quote whose flag is set: the mismatch line.
- **S4** both: two lines.
- **S5** an admin who is not an accountant, the same quote as S4: no banner.
- **S6** an accountant, a quote with no invoice but two different hashes: no banner.
- **S7** an accountant, a deleted quote that needs attention: no banner.
- **S8** after **Update invoice** (a fake route that saves the sent hash): the outdated line
  disappears without a reload.

## 7. Files

**Counted — 6 files** (limit 10):

1. `src/features/quotesAndBookings/utils/invoiceAttention.ts` — new
2. `src/features/quotesAndBookings/components/quoteDetail/invoice/useInvoiceAttention.ts` —
   new
3. `src/features/quotesAndBookings/components/quoteDetail/invoice/InvoiceAttentionBanner.tsx`
   — new
4. `src/features/quotesAndBookings/components/quoteDetail/QuoteDetailView.tsx` — changed
5. `src/features/userAccess/logic/getQuotesBookingsCapabilities.ts` — changed
6. `src/features/userAccess/permissionPageData.ts` — changed (§5)

**Not counted:** `invoiceAttention.test.ts` (new); `getQuotesBookingsCapabilities.test.ts`,
`permissionPageData.test.ts`, `QuoteDetailView.test.tsx` (edited); the banner and hook tests;
the Playwright spec of §6. No migration, no `AppSchema.ts`, no `database.types.ts`, no
`sync_rules.yaml`.

## 8. Tests and implementation sequence

Red first. Prettier only on touched files.

- **`invoiceAttention.test.ts`:** no invoice id gives none even with a set flag and different
  hashes; equal hashes and no flag give none; different hashes give `outdated`; an empty sent
  hash gives `outdated`; the flag as 1, as true, as 0, as null; both reasons in order; the
  short and long texts exist for each reason.
- **`getQuotesBookingsCapabilities.test.ts`:** `seeInvoiceAlerts` true for an accountant and
  for an admin who is also an accountant; false for an admin alone, an account manager, a
  viewer, a developer, a driver, a maintainer; every other capability unchanged.
- **Banner and `QuoteDetailView` tests:** one line per reason; none when no reason; none for
  an admin alone; none on a deleted quote; the banner follows a change of the local row.
- **Gate:** `npm run tc`, `npx vitest run`, `prettier --check` on the touched files. E2E:
  SKIPPED (not run locally, by instruction).

## 9. Edge cases and error handling

- **Sync lag.** The banner follows the synced columns. For a few seconds after an Update the
  outdated line may still show; it clears when the sent hash arrives.
- **A quote edited right after an Update** is outdated again at once: its hash moved on.
- **Offline.** The banner reads the local database and works offline.
- **A role added or removed while signed in.** The capability follows the permissions store
  and changes with it.
- **Clerk.** Nothing new: no route, token or webhook is touched.

## 10. Risks

- **R1 — a quote that is outdated and mismatched** shows two lines; the second is only
  trustworthy after a Check again, because the flag was set against the older quote
  (spec 06, §6).
- **R2 — an admin who is also an accountant** sees the alerts; one who is not does not. The
  difference is the user's decision, and the matrix row says it.

## 11. Out of scope

- The Need attention tab (spec 10); the sidebar counts, tab counts and row marks (spec 11).
- Any alert for an admin who is not an accountant.
- Any email, push or other notification outside the app.
- A way to dismiss or snooze the banner.
