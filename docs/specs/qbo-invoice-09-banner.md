# QuickBooks invoice — the attention rule and the banner on the quote card

Status: **Implemented 2026-10-22** 0 open decisions; four
readings to confirm (§1, last paragraph). The amendment follows spec 01 and spec 06: there is no
"outdated" any more (it was decided by the hashes); a quote needs attention when the last
comparison with QuickBooks found a difference, and the reasons are stored.
Implementation order: **09** (see the plan, §3). Plan: [qbo-invoice-plan.md](qbo-invoice-plan.md).
Branch: `q4-sprint1-finance-role`.
Needs: [01](qbo-invoice-01-link-and-hash.md) (the flag and the reasons),
[06](qbo-invoice-06-totals-check.md) (the reason codes and who writes the flag),
[06a](qbo-invoice-06a-check-on-save.md) (when it is refreshed),
[07](qbo-invoice-07-card-buttons.md) (the capability table's new entry).

## 0. The request, and what it is not

An accountant must be told when a quote's QuickBooks invoice needs attention. This spec adds:

- **the rule** that says when an invoice needs attention and why — used by this spec, and by
  specs 10 and 11;
- **the banner** on the quote card, drawn for accountants only.

**Not part of this spec:** the Need attention tab, the sidebar counts, the tab counts and the
row marks (specs 10–11); the comparison that writes the flag (06).

## 1. Decisions (all taken by the user)

**From the user's own words (not options):**

- **A quote needs attention when its invoice and the quote differ** (spec 06): the flag
  `qbo_invoice_mismatch` is set. The user's earlier second case, "outdated", is gone with the
  hashes (2026-10-23).
- **The reasons are shown as they are** — "Dates do not match", "Totals do not match", "Service
  does not match" and so on (user's answer, 2026-10-23), from the codes of spec 06 §4.
- **Who sees the signals: accountants only.** An admin who is not an accountant sees none of
  them.
- **Places:** the user picked all four — sidebar counts, tab counts, a row mark and a card
  banner. This spec is the banner.
- **Whatever the status:** once an invoice exists, its alerts stay (plan: "Keep everything").

**Readings to confirm at review.**

- The banner is **not drawn on a deleted quote** (a deleted quote already has its own notice and
  no actions).
- **A set flag with no usable reasons** — the reasons column is empty or holds only codes this
  version does not know (a browser PATCHed one column, or the row is older than the reasons) —
  shows the generic reason `unspecified`: "The invoice does not match the quote".
- One line per reason, each in the banner's own words (§4); the banner ends with one line that
  says what to press.
- The banner is only as fresh as the last check: it follows the stored flag, which is refreshed
  after a Save, a Create, an Update and Check again (specs 04–06a, 08), not when the quote is
  opened and not when QuickBooks changes. The card's check time (spec 08) says how fresh (§9).

## 2. Research findings

- **The flag and the reasons** are `qbo_invoice_mismatch` and `qbo_invoice_mismatch_reasons`
  (a JSON array of codes) on `Events`, synced to the card (spec 01).
- **Where the card draws its notices.** `QuoteDetailView.tsx` draws a deleted-quote notice
  above the tab bar and gets its permissions from `useQuotesBookingsCapabilities`.
- **The pattern.** `/work-trackers` keeps every number, mark and count it shows in one
  function over the same rows (`attentionTrackers.ts`), so the numbers cannot disagree.

## 3. The rule — `src/features/quotesAndBookings/utils/invoiceAttention.ts` (new)

Pure.

- `InvoiceAttentionInput` — `qboInvoiceId`, `mismatch` (0, 1, true, false or null) and `reasons`
  (the stored text, or null), all as the local database gives them.
- `InvoiceAttentionReason` — one of spec 06's codes, or `"unspecified"`.
- `invoiceAttentionReasons(input)` returns the reasons, in spec 06's order:
  - no `qboInvoiceId` → none, whatever else is set;
  - the flag not set → none, whatever `reasons` holds;
  - the flag set → the codes in `reasons` that this version knows, without repeats; when the
    text is empty, does not parse as a JSON array or holds nothing known → `["unspecified"]`.
- `INVOICE_REASON_TEXT` — for each reason a **short** text for lists (spec 06 §4; `unspecified`:
  "Invoice does not match the quote") and a **long** text for the banner (§4). One place, so no
  surface words a reason differently.

## 4. The banner

**`useInvoiceAttention.ts`** (new, in `quoteDetail/invoice/`) reads the three columns of the
event from the local database, reactively, and returns `invoiceAttentionReasons(…)`.

**`InvoiceAttentionBanner.tsx`** (new) draws, in the red the attention marks of `/work-trackers`
use, a heading "The QuickBooks invoice does not match this quote.", one line per reason (the long
texts below), and the closing line "Press Update invoice on the Billing tab, or correct the
invoice in QuickBooks and press Check again." It draws nothing when there are no reasons.

The long texts:

- **number:** "The invoice number in QuickBooks is not this quote's invoice number."
- **dates:** "The invoice date or the due date in QuickBooks does not match this quote."
- **customer:** "The customer or the Bill to name in QuickBooks does not match this quote's
  client."
- **address:** "The Location of Sale in QuickBooks does not match this quote's venue address."
- **memo:** "The memo on the QuickBooks invoice does not match this quote's title."
- **lines:** "The QuickBooks invoice does not have exactly one line."
- **service:** "The service (event type) or its description on the QuickBooks invoice does not
  match this quote."
- **amount:** "The amount on the QuickBooks invoice does not match this quote."
- **tax_code:** "The tax code on the QuickBooks invoice is not the one set for this quote."
- **class:** "The Class on the QuickBooks invoice does not match this quote's zone."
- **totals:** "QuickBooks' total or tax does not match this quote's."
- **unspecified:** "The QuickBooks invoice does not match this quote."

**`QuoteDetailView.tsx`** (changed) draws the banner above the tab bar, next to the
deleted-quote notice, only when `can.seeInvoiceAlerts` and the quote is not deleted.

**`getQuotesBookingsCapabilities.ts`** (changed) gains **`seeInvoiceAlerts`**: true for an
accountant, on any quote; false for an admin who is not an accountant and for every other
role. Roles are additive: an admin who is also an accountant gets it.

## 5. Permissions — `src/features/userAccess/permissionPageData.ts`

**A new row**, label **QuickBooks Invoice Alerts**, category "Day to Day Operations".
Description: "The red notice on a quote whose QuickBooks invoice needs attention: the invoice in
QuickBooks no longer matches the quote, and the notice says what differs. The check is refreshed
when the quote is saved, whatever the role of the person who saves it, and when someone presses
Check again, but only the roles below see the result."

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

- **S1** accountant, a quote whose flag is false: no banner.
- **S2** accountant, a quote whose flag is set with the reasons `["dates"]`: the heading, the
  dates line and the closing line.
- **S3** accountant, reasons `["dates","totals"]`: both lines, in that order.
- **S4** accountant, the flag set and no reasons: the generic line.
- **S5** an admin who is not an accountant, the same quote as S3: no banner.
- **S6** an accountant, a quote with no invoice but a set flag: no banner.
- **S7** an accountant, a deleted quote that needs attention: no banner.
- **S8** after **Update invoice** (a fake route that clears the flag): the banner disappears
  without a reload.

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
the Playwright spec of §6. No migration, no `AppSchema.ts` (spec 01 added the column), no
`database.types.ts`, no `sync_rules.yaml`.

## 8. Tests and implementation sequence

Red first. Prettier only on touched files.

- **`invoiceAttention.test.ts`:** no invoice id gives none even with a set flag; a false flag
  gives none even with reasons; the flag as 1, as true, as 0, as null; the reasons parsed in
  spec 06's order and without repeats; an unknown code is dropped; an empty text, `null`,
  `"not json"`, `"{}"` and `"[]"` with a set flag give `unspecified`; the short and long texts
  exist for each reason, including `unspecified`.
- **`getQuotesBookingsCapabilities.test.ts`:** `seeInvoiceAlerts` true for an accountant and
  for an admin who is also an accountant; false for an admin alone, an account manager, a
  viewer, a developer, a driver, a maintainer; every other capability unchanged.
- **Banner and `QuoteDetailView` tests:** the heading, one line per reason and the closing line;
  none when no reason; none for an admin alone; none on a deleted quote; the banner follows a
  change of the local row.
- **Gate:** `npm run tc`, `npx vitest run`, `prettier --check` on the touched files. E2E:
  SKIPPED (not run locally, by instruction).

## 9. Edge cases and error handling

- **Sync lag.** The banner follows the synced columns. For a few seconds after an Update or a
  check the old lines may still show; they clear when the new flag arrives.
- **A quote edited right after a check** shows the old answer until the next check (a Save, spec 06a,
  an Update or Check again); there is no hash to say it moved on. An edit made outside Save (the
  address book, settings) and one made by hand in QuickBooks wait for the next of those.
- **A quote whose last check could not run** (QuickBooks unreachable, the invoice deleted, the
  quote not valid for an invoice) keeps what it showed.
- **Offline.** The banner reads the local database and works offline.
- **A role added or removed while signed in.** The capability follows the permissions store
  and changes with it.
- **Clerk.** Nothing new: no route, token or webhook is touched.

## 10. Risks

- **R1 — a stale banner.** Without a hash, the banner can be out of date between a quote's
  change and the next check, and a hand edit in QuickBooks stays unseen until someone checks
  (06a, R1). The card's check time (spec 08) is how an accountant tells.
- **R2 — an admin who is also an accountant** sees the alerts; one who is not does not. The
  difference is the user's decision, and the matrix row says it.

## 11. Out of scope

- The Need attention tab (spec 10); the sidebar counts, tab counts and row marks (spec 11).
- Any alert for an admin who is not an accountant.
- Any email, push or other notification outside the app.
- A way to dismiss or snooze the banner.
