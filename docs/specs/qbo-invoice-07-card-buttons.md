# QuickBooks invoice — Create and Update on the Billing tab

Status: **Implemented 2026-10-23** (approved in chat). 0 open decisions; one reading to confirm
(§1, last paragraph). **Amended 2026-10-23 by [06](qbo-invoice-06-totals-check.md)
(awaiting "Approved"):** the warning `totals_check_failed` is renamed `invoice_check_failed` and
its toast reads "The invoice could not be checked against the quote." (§4, S9).
Implementation order: **07** (see the plan, §3). Plan: [qbo-invoice-plan.md](qbo-invoice-plan.md).
Branch: `q4-sprint1-finance-role`.
Needs: [04](qbo-invoice-04-create.md) and [05](qbo-invoice-05-update.md) (the route and its
answers). This is the first spec a person can use.

## 0. The request, and what it is not

On the Billing tab of `/quotes-bookings/{id}`, in the QuickBooks section next to the
QuickBooks Invoice checkbox, an admin or an accountant sees **Create invoice** (a booked quote
with no invoice) or **Update invoice** (a quote with one). The screen asks what the route
asks about, and the user stays on the quote page.

**Not part of this spec:** View in QuickBooks, Check again (spec 08); the banner (spec 09); the Need
attention tab, the counts and the marks (specs 10–11); the route and the invoice check.

## 1. Decisions (all taken by the user)

**From the user's own words (not options):**

- **Where:** the Billing tab, next to the QuickBooks Invoice checkbox.
- **Who:** admin and accountant. An accountant sees the button on a quote of any office.
- **When:** Create only when the status is exactly `booked`. Update whenever an invoice
  exists, whatever the status.
- **Update always asks first**, even when the invoice was changed by hand or made by the app.
- **Several matching customers:** a window lets the accountant pick the right one; it opens
  only when the app cannot tell.
- **Number already in QuickBooks:** the user is told, and a button overwrites it anyway.
- **Invoice not found when updating:** the app says so and offers a new one; if the user
  says no, the message says it is probably a bug for the developer.
- **The user stays on the quote page.**

**Reading to confirm at review.**

- A button that is not allowed is **not drawn** (the way Record Payment is), not disabled.
- The customer window also offers "Create a new customer" (spec 02).
- The texts of §4 are drafts; the user may reword them.

## 2. Research findings

- **The place.** `BillingTab.tsx` has a "QuickBooks" section holding the checkbox, gated by
  `can.setQuickBooksFlag`. Its `can` prop is a `Pick` of `QuotesBookingsCapabilities`.
- **Capabilities.** `getQuotesBookingsCapabilities` is the one place that answers "can this
  user do X?"; components read the answers and never ask who the user is.
- **What the screen reads.** The card reads `Events` from the local database; spec 01's
  columns arrive through sync.
- **Sync lags.** After the route answers, the new link reaches the local database a little
  later. If the screen waited for it, the button would still say "Create" and a second press
  would get a 409.
- **Components.** `ConfirmDialog`, the dialog primitives in `src/components/ui/dialog.tsx`,
  `createSuccessToast` and `createErrorToast` already exist.
- **Access rows.** The matrix is `permissionPageData.ts`; its `QuickBooks Invoice Flag` row
  says the flag "does not push anything to QuickBooks", which is no longer the whole truth.

## 3. Types and the capability

- `getQuotesBookingsCapabilities.ts` gains **`manageQuickBooksInvoice`**: true for an admin or
  an accountant, on any quote; false for every other role. Roles are additive, as the rest
  of the table.
- `InvoiceResult` (in `invoiceActions.ts`) — the union of spec 04 and 05's answers:
  `created`, `updated`, `choose_customer`, `invoice_number_exists`, `invoice_missing`.
- `InvoiceRequest` — `{ eventId, customerChoice?, replaceMissing?, overwriteInvoiceId? }`.

## 4. The screen

Folder `src/features/quotesAndBookings/components/quoteDetail/invoice/`.

**`useInvoiceState.ts`** (new) reads, reactively, the event's `event_status` and
`qbo_invoice_id`. It also remembers, in component state, the invoice number from a
`created`/`updated` answer, so the button flips at once without waiting for sync. It returns
`hasInvoice` and `canCreate` (`status === "booked"` and no invoice).

**`invoiceActions.ts`** (new) — `postInvoice(request)` calls `POST /api/quickbooks/invoice`
and returns an `InvoiceResult`; an HTTP error becomes an exception carrying the route's
message; a network failure becomes "Could not reach the server. Check your connection and
try again."

**`InvoiceButtons.tsx`** (new), drawn in the QuickBooks section of `BillingTab` only when
`can.manageQuickBooksInvoice`:

- no invoice and `canCreate` → **Create invoice**;
- an invoice → **Update invoice**;
- otherwise nothing is drawn;
- while a request is open the button shows "Creating…" / "Updating…" and cannot be pressed
  again.

**The flows** (the component keeps the request it sent, so a dialog's answer re-sends it with
one more field):

- **Create** → `postInvoice({ eventId })`:
  - `created` → success toast "Invoice {number} created in QuickBooks"; each warning is its
    own toast (`pdf_not_attached`: "The PDF was not attached ({reason}). Press Update
    invoice to try again."; `invoice_check_failed` (once `totals_check_failed`): "The invoice could not be checked against the quote."; `class_missing`: "No QuickBooks Class was found for {state}. The invoice was made without one; set the Class in QuickBooks."; `tax_code_missing`: "No QuickBooks tax code is mapped for {province}. The invoice was made without tax; map the code on the QuickBooks page, then press Update invoice.").
  - `choose_customer` → the customer window; its answer is sent as `customerChoice`.
  - `invoice_number_exists` → the number window; **Overwrite** sends `overwriteInvoiceId`.
- **Update** → the confirmation "Update the QuickBooks invoice? This replaces its content with
  this quote's current data, including any change made by hand in QuickBooks." → on
  confirm, `postInvoice({ eventId })`:
  - `updated` → success toast "Invoice {number} updated", the same warning toasts;
  - `choose_customer` → the customer window, as above;
  - `invoice_missing` → the not-found window; **Yes** sends `replaceMissing: true`; **No**
    closes it with the toast "If the invoice was not deleted in QuickBooks, this is probably
    a bug — please tell the developer."
- Any error → `createErrorToast` with the route's message.

**Windows** (new, built on the dialog primitives; each shows nothing it was not given):

- `CustomerChoiceDialog.tsx` — a list of the candidates (name, company, email), a **Use this
  customer** button on each, a **Create a new customer** button, **Cancel**.
- `InvoiceNumberExistsDialog.tsx` — "An invoice numbered {number} already exists in
  QuickBooks (customer {name}, total {amount})." **Overwrite with this quote's data**,
  **Cancel**.
- `InvoiceNotFoundDialog.tsx` — "The invoice linked to this quote was not found in
  QuickBooks. Create a new one?" **Yes**, **No**.

`BillingTab.tsx` (changed) draws `InvoiceButtons` under the checkbox; its `can` Pick gains
`manageQuickBooksInvoice`.

## 5. Permissions — `src/features/userAccess/permissionPageData.ts`

**A new row**, label **QuickBooks Invoice (create and update)**, category "Day to Day
Operations". Description: "The Create invoice and Update invoice buttons on the Billing tab of
a quote or booking. Create makes the invoice in QuickBooks from the quote, for a booked
quote that has none; Update replaces the invoice's content with the quote's current data. The
invoice is saved in QuickBooks for the books and is never sent to the client."

- **admin:** `full` — "Can create the invoice of any booked quote and update any invoice."
- **account_manager:** `none` — "Cannot create or update a QuickBooks invoice. They can still
  tick the QuickBooks Invoice Flag."
- **developer:** `none` — the existing developer note about quotes.
- **viewer:** `none` — "Cannot create or update a QuickBooks invoice."
- **driver:** `none` — "Drivers only have access to the Driver Mobile App."
- **maintainer:** `none` — `MAINTAINER_NO_ACCESS_NOTE`.
- **accountant:** `full` — "Can create the invoice of any booked quote, on a quote of any
  office, and update any invoice. Update always asks first."

**Changed rows:**

- **QuickBooks Invoice Flag** — description ends: "It is also ticked automatically when an
  invoice is created from the quote (see QuickBooks Invoice (create and update))." The "does
  not push anything to QuickBooks" sentence is removed.
- **Accountant role description** — gains: "and create or update a quote's QuickBooks
  invoice".
- **The accountant's note on Quotes & Bookings** — "What they can change is the QuickBooks
  Invoice Flag and the payments" gains "and the QuickBooks invoice (see those rows)".
- `permissionPageData.test.ts` — the accountant guard and the new row's levels.

## 6. Behaviour scenarios

Playwright, written, **not run**; the route is replaced by a fake with `page.route`.

- **S1** admin, booked quote, no invoice: **Create invoice** is drawn; pressing it shows the
  success toast and the button becomes **Update invoice** at once.
- **S2** admin, a quote that is not booked and has no invoice: no button.
- **S3** accountant on a quote of another office: the button is drawn.
- **S4** account manager and viewer: no button; the QuickBooks Invoice Flag is as before.
- **S5** the fake answers `choose_customer`: the window lists the candidates; **Use this
  customer** re-sends with `customerChoice`; **Create a new customer** sends `{ kind: "new" }`.
- **S6** the fake answers `invoice_number_exists`: the window shows number, customer and
  total; **Overwrite** sends `overwriteInvoiceId`.
- **S7** a quote with an invoice and any status: **Update invoice** is drawn; pressing it
  asks first; **Cancel** sends nothing.
- **S8** the fake answers `invoice_missing`: **Yes** sends `replaceMissing`; **No** shows the
  developer message and sends nothing.
- **S9** each warning (`pdf_not_attached`, `invoice_check_failed`, `class_missing`,
  `tax_code_missing`) shows its own toast.
- **S10** a route error shows its message.

## 7. Files

**Counted — 9 files** (limit 10):

1. `src/features/quotesAndBookings/components/quoteDetail/tabs/BillingTab.tsx` — changed
2. `src/features/quotesAndBookings/components/quoteDetail/invoice/InvoiceButtons.tsx` — new
3. `src/features/quotesAndBookings/components/quoteDetail/invoice/useInvoiceState.ts` — new
4. `src/features/quotesAndBookings/components/quoteDetail/invoice/invoiceActions.ts` — new
5. `src/features/quotesAndBookings/components/quoteDetail/invoice/CustomerChoiceDialog.tsx`
   — new
6. `src/features/quotesAndBookings/components/quoteDetail/invoice/InvoiceNumberExistsDialog.tsx`
   — new
7. `src/features/quotesAndBookings/components/quoteDetail/invoice/InvoiceNotFoundDialog.tsx`
   — new
8. `src/features/userAccess/logic/getQuotesBookingsCapabilities.ts` — changed
9. `src/features/userAccess/permissionPageData.ts` — changed (§5)

**Not counted:** `getQuotesBookingsCapabilities.test.ts`, `permissionPageData.test.ts`,
`BillingTab.test.tsx` (edited); tests for the new components; the Playwright spec of §6. No
migration, no `AppSchema.ts`, no `database.types.ts`, no `sync_rules.yaml`.

## 8. Tests and implementation sequence

Red first. Prettier only on touched files.

- **`getQuotesBookingsCapabilities.test.ts`:** `manageQuickBooksInvoice` is true for an admin
  and an accountant, false for every other role, including a viewer and an account manager;
  roles are additive (an accountant who is also an account manager gets it); every other
  capability is unchanged.
- **`useInvoiceState` test:** `canCreate` for booked with no invoice; false for each other
  status; `hasInvoice` from the local row; `hasInvoice` flips from a remembered answer before
  sync.
- **`InvoiceButtons` / dialog tests:** the draw rules; the busy state; each flow of §4 sends
  the right request and shows the right toast or window; **Cancel** sends nothing; the
  confirmation always appears before an update.
- **`BillingTab.test.tsx`:** the buttons appear only with the capability.
- **Gate:** `npm run tc`, `npx vitest run`, `prettier --check` on the touched files. E2E:
  SKIPPED (not run locally, by instruction).

## 9. Edge cases and error handling

- **Offline.** The route is online-only. A failed request shows the "Could not reach the
  server" message and writes nothing.
- **A second press before sync.** The remembered answer turns **Create** into **Update**
  immediately, so a second Create is not offered; a stale 409 is shown as the route's message.
- **Closing a window** by clicking outside is **Cancel**; nothing is sent.
- **Clerk.** A 401 or 403 from the route is shown as its message; no redirect.
- **A quote with an invoice whose status leaves `booked`.** Update stays drawn (the
  user's decision).
- **Two accountants on the same quote.** The second one's press gets whatever the route
  answers (409, or a stale-object error); the message says what to do.

## 10. Risks

- **R1 — Update overwrites hand work.** The decision; the confirmation names it.
- **R2 — the remembered answer can be wrong** if the route's write was rolled back; the next
  sync corrects it and the button follows the synced value.

## 11. Out of scope

- View in QuickBooks and Check again (spec 08); the banner (spec 09).
- Anything on `/accountant`, the sidebar or the lists (specs 10–11).
- Showing the check's result as a toast after a create or update (the banner of spec 09 is the
  signal; Check again of spec 08 is the only place a result is shown as a toast).
- Deleting an invoice, or unlinking one from the quote.
