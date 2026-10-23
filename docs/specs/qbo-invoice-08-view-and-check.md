# QuickBooks invoice — View in QuickBooks and Check again

Status: **Implemented 2026-10-23** (approved in chat, with the 2026-10-23 amendment). 0 open
decisions. The amendment followed spec 06's new comparison (the whole invoice, not only the totals): Check again
stays as a button (the user's answer of 2026-10-23, although the check now also runs after a Save,
[06a](qbo-invoice-06a-check-on-save.md), and not when a quote is opened or QuickBooks changes), what it reports changes (§4), and the card shows when the quote was last checked (§4).
Implementation order: **08** (see the plan, §3). Plan: [qbo-invoice-plan.md](qbo-invoice-plan.md).
Branch: `q4-sprint1-finance-role`.
Needs: [06](qbo-invoice-06-totals-check.md) (the check route) and
[07](qbo-invoice-07-card-buttons.md) (the buttons' place and the capability).

## 0. The request, and what it is not

Next to Create / Update, a quote that has an invoice gets two more buttons on the Billing
tab: **View in QuickBooks**, which opens the invoice in QuickBooks, and **Check again**, which
re-runs the invoice comparison of spec 06.

**Not part of this spec:** the banner and the attention rule (spec 09); counts and marks
(specs 10–11); the check route itself (spec 06).

## 1. Decisions (all taken by the user)

**From the user's own words (not options):**

- **View in QuickBooks** is a button beside Create / Update, **shown when the invoice exists**.
  The user stays on the quote page: the invoice opens in another tab.
- **Check again** is a button on the card (the user chose "Both": this button and the check
  on every Update). **It stays** (user's answer, 2026-10-23) although the check now also runs when
  the quote is opened or saved: it lets an accountant re-run it at once, for example after fixing
  the invoice in QuickBooks.
- **Who:** admin and accountant, the same people as Create and Update.
- **Whatever the status:** with an invoice, both stay (plan: "Keep everything").

## 2. Research findings

- **The environment.** The server already reads `QBO_ENVIRONMENT` (`sandbox` or
  `production`) to build its API client; the browser does not know it. A link built in the
  browser would need a second, public variable, so the server builds it and redirects.
- **The address of an invoice's page** in the QuickBooks web app is
  `https://app.qbo.intuit.com/app/invoice?txnId={id}` in production, and the same path on
  `app.sandbox.qbo.intuit.com` in the sandbox. **To verify in a sandbox**, together with which
  company it opens in when the browser is signed in to several.
- **The check route** answers `checked` (with `matches`, `reasons` and `differences`),
  `invoice_missing`, `skipped` (with a message) or an error (spec 06).
- **The link column** `qbo_invoice_id` is spec 01's. `Events` stores no QuickBooks connection;
  the view route needs none (the URL of an invoice carries only its id).

## 3. The view route — `src/app/api/quickbooks/invoice/view/route.ts` (new)

`GET ?eventId=…`.

- Admin or accountant only (`requireAdminOrAccountant`): 401, 403.
- 400 for a missing or non-uuid `eventId`; 404 for no such event; 404 with
  "This quote has no QuickBooks invoice yet." when it has no link.
- Otherwise a **302** to the URL of §4. The link is read with the service role; the route
  returns nothing else.

`…/invoice/qboInvoiceUrl.ts` (new) is the pure function `qboInvoiceUrl(environment,
qboInvoiceId)` returning the URL of §2. Only the two known environments are accepted; any
other value throws.

## 4. The buttons and the check time — `InvoiceButtons.tsx` (changed), `invoiceActions.ts` (changed)

- **View in QuickBooks** — drawn when `hasInvoice`. A link to
  `/api/quickbooks/invoice/view?eventId=…` that opens in a **new tab**, without giving the new
  tab access to this one.
- **Check again** — drawn when `hasInvoice`. It sends `postCheck(eventId)` and shows:
  - `checked` and `matches`: success toast "The invoice matches the quote.";
  - `checked` and not `matches`: an error toast with one line per difference, each starting with
    the reason's short text (spec 06 §4), for example "Dates do not match — Due date: QuickBooks
    2026-11-01, quote 2026-11-14.";
  - `invoice_missing`: "The invoice was not found in QuickBooks.";
  - `skipped`: the route's message (for example that the quote has no venue street yet);
  - an error: the route's message.
    While it runs the button is busy and cannot be pressed again.
- `invoiceActions.ts` gains `postCheck(eventId)` and a `CheckResult` type
  (`checked` | `invoice_missing` | `skipped`).

Both buttons sit in the QuickBooks section, drawn only when `can.manageQuickBooksInvoice`.

**The check time** (user's answer, 2026-10-23) — under the buttons, drawn when `hasInvoice`, so
that a check that did not run is not mistaken for a clean invoice. `InvoiceCheckTime.tsx` (new) reads
`qbo_invoice_checked_at` and `qbo_invoice_check_failed_at` of the event from the local database,
reactively, and `describeInvoiceCheck(checkedAt, failedAt)` (pure, new, `utils/invoiceCheckTime.ts`)
decides what to say, in the viewer's local time:

- neither is set: "Not checked yet";
- a check time and no later failure: "Checked 23 Oct 2026, 14:05";
- a failure that is later than the check time, or with no check time: a red "The last check failed
  (23 Oct 2026, 14:30). Press Check again.", followed, when there is one, by "Last successful check
  23 Oct 2026, 14:05".

## 5. Permissions — `src/features/userAccess/permissionPageData.ts`

- **QuickBooks Invoice (create and update)** — the description gains: "A quote that has an
  invoice also gets View in QuickBooks, which opens the invoice, and Check again, which
  re-compares the QuickBooks invoice with the quote; the card also shows when the quote was last
  checked." The roles' levels do not change.

## 6. Behaviour scenarios

Playwright, written, **not run**; the routes are replaced by fakes.

- **S1** a quote with an invoice: both buttons are drawn for an admin and for an accountant.
- **S2** a quote with no invoice: neither is drawn.
- **S3** a quote that is not booked but has an invoice: both are drawn.
- **S4** **View in QuickBooks** opens a new tab on the view route and the quote page stays.
- **S5** **Check again** with an equal invoice: the success toast; with a different one: the
  error toast naming each reason; with `invoice_missing` or `skipped`: that message.
- **S6** account manager and viewer: neither button is drawn.
- **S7** the check time: a quote never checked says "Not checked yet"; one checked says when; one
  whose last attempt failed shows the red line (seeded by writing the two columns); after
  **Check again** succeeds the red line is gone without a reload.

## 7. Files

**Counted — 7 files** (limit 10):

1. `src/app/api/quickbooks/invoice/view/route.ts` — new
2. `src/features/quickbooks-integration/invoice/qboInvoiceUrl.ts` — new
3. `src/features/quotesAndBookings/components/quoteDetail/invoice/InvoiceButtons.tsx` —
   changed
4. `src/features/quotesAndBookings/components/quoteDetail/invoice/invoiceActions.ts` — changed
5. `src/features/userAccess/permissionPageData.ts` — changed (§5)
6. `src/features/quotesAndBookings/components/quoteDetail/invoice/InvoiceCheckTime.tsx` — new
7. `src/features/quotesAndBookings/utils/invoiceCheckTime.ts` — new

**Not counted:** `permissionPageData.test.ts`, `InvoiceButtons` tests (edited); the tests of
§8; the Playwright spec of §6. No migration, no `AppSchema.ts`, no `database.types.ts`, no
`sync_rules.yaml`.

## 8. Tests and implementation sequence

Red first. Prettier only on touched files.

- **`qboInvoiceUrl.test.ts`:** the production and sandbox URLs; an unknown environment throws;
  an id with unusual characters is encoded.
- **`view/route.test.ts`:** 401, 403, 400, 404 (no event, no link), 302 with the right
  `Location` for each environment; the link is read with the service role.
- **`InvoiceButtons` tests:** the draw rules of §4; the outcomes of Check again (matches, differs, missing, skipped, error) and the
  busy state; View opens in a new tab with `noopener`.
- **`invoiceCheckTime.test.ts`:** each of the three messages; a failure earlier than the check
  time is not shown; equal times count as checked; a failure with no check time; invalid or
  missing timestamps say "Not checked yet".
- **`InvoiceCheckTime` test:** it follows a change of the local row.
- **Gate:** `npm run tc`, `npx vitest run`, `prettier --check` on the touched files. E2E:
  SKIPPED (not run locally, by instruction).

## 9. Edge cases and error handling

- **The page opens in the wrong QuickBooks company** if the browser is signed in to another
  one. Not handled; to verify (§2).
- **A popup blocker.** The link is an ordinary link, opened by the user's click, not a script.
- **Offline.** Both buttons need the network; a failure is the route's or the network message.
- **Clerk.** A 401 or 403 from the view route shows the JSON in the new tab; nothing is
  leaked: the body is only `{ error }`.
- **An invoice that was deleted in QuickBooks.** View opens QuickBooks' own "not found"
  page; Check again says "not found" and Update offers a new one (spec 05).

## 10. Out of scope

- The banner and the attention rule (spec 09); counts and marks (specs 10–11).
- A copy-link button, or showing the invoice's QuickBooks status inside this app.
- Opening the invoice in the same tab.
