# QuickBooks invoice from a quote — plan and decisions

Status: **DRAFT 2026-10-22 — awaiting review.** Eleven specs and one blocked stub, no code.
Branch: `q4-sprint1-finance-role`.
Specs: `qbo-invoice-01` … `qbo-invoice-11`, plus `qbo-invoice-03b-zone-class.md` (BLOCKED).
Builds on: [accountant-quotes-05-is-qbo-column.md](accountant-quotes-05-is-qbo-column.md),
[quote-staleness-detection.md](quote-staleness-detection.md),
[accountant-role.md](accountant-role.md).

## 0. The request

On the Billing tab of `/quotes-bookings/{id}` an admin or an accountant presses
**Create invoice**. The app creates the invoice in QuickBooks Online through the QuickBooks
API, with every value taken from the quote — the user types nothing. The user stays on the
quote page. The invoice is for the accountants' books only: it is saved in QuickBooks and is
**never sent to the client**.

When the quote changes, an **Update invoice** button replaces the invoice's content with the
quote's data. The accountant is warned on the quote card, in the lists and in the sidebar
when an invoice is outdated or its totals do not match the quote.

## 1. The invoice, field by field (decided by the user)

- **Product/service:** one line, `Bleacher Rental - {event type}`. Event types today are
  City, Corporate and Rural; Sale is added later. The names are the same in both QuickBooks
  files.
- **Description:** the QuickBooks Item's own Description.
- **Qty and Rate:** Qty is always 1. Amount is the quote's price after discounts, without tax.
- **Tax:** calculated by QuickBooks. A state with no tax gets the Tax box unchecked, not 0%.
  After the invoice is written the app checks that QuickBooks' total and tax equal the quote's.
- **Customer:** a QuickBooks customer is a contact, usually with a company.
- **Bill to:** the client's full name.
- **Location of Sale:** the quote's venue address.
- **Invoice no.:** the quote's invoice number.
- **Invoice date:** the quote's Event Start.
- **Due date:** the last due date in the payment schedule; the Event Start when there is none.
  It may be earlier than the invoice date.
- **Memo on statement:** the quote's title (for example `SC - CLEMSON - RALLY`).
- **Attachment:** the quote's own PDF, not attached to an email. A new PDF replaces the old one.
- **Class:** the quote's zone. **Not decided** — see spec 03b.

## 2. Decisions (all taken by the user)

Taken in the chat of 2026-10-20 … 2026-10-22:

- **Who:** admin and accountant. An accountant sees the button on a quote of any office.
- **Where:** the Billing tab, next to the QuickBooks Invoice checkbox.
- **One button, safe to press again:** a quote with no invoice gets **Create**; a quote with
  one gets **Update**, which always asks before it writes, even when the invoice was changed by
  hand in QuickBooks. A second button, **View in QuickBooks**, opens the invoice.
- **When Create is offered:** only when the event status is exactly `booked`. Once an invoice
  exists, Update, View and the attention signals stay whatever the status is.
- **Where the link lives:** new columns on `Events`, written by the server with the
  service-role key. They stay writable from a browser like any other `Events` column (an
  admin or account manager could PATCH them); only the accountant is fenced.
- **`is_qbo`:** set to true automatically when an invoice is created; the checkbox stays
  editable by hand.
- **Canada:** not supported yet. Create and Update refuse an event whose currency is CAD.
- **Hash:** two hashes on `Events`, kept by a trigger (current) and by the server (sent). The
  current hash includes `tax_percent`, `tax_amount_cents` and `is_tax_overridden`.
- **Customer:** the finance contact when set, otherwise the contact. The search looks at the
  company, the name and the email. One match is used; several open a picker; none creates a
  new flat customer (company in its Company name field). The choice is remembered per
  contact and QuickBooks connection.
- **Invoice number already in QuickBooks:** the user is told and may overwrite it. Overwriting
  links that invoice to the quote and replaces its content with the quote's data.
- **Linked invoice missing in QuickBooks:** the app says it was not found and offers a new
  one. If the user says no, it is probably a bug and they go to the developer.
- **Totals check:** after every create and update, plus a **Check again** button. Zero
  tolerance. A mismatch is a notification for accountants.
- **PDF fails to attach:** the invoice stays, the user sees a warning, Update retries it.
- **Office moved to the other QuickBooks file:** Update is refused with a message.
- **Notification places:** sidebar counts, tab counts, a row mark in the lists, and a banner
  on the quote card. Accountants only. An admin who is not an accountant sees the Need
  attention tab but none of the signals.
- **Need attention tab:** third tab of `/accountant`, opens newest event first.
- **Log:** creating and updating an invoice is written to the quote's Log.

## 3. The specs, in implementation order

Each one is a separate commit with one logic. Counted files = migrations, `database.types.ts`,
`AppSchema.ts`, `permissionPageData.ts`, `package.json`, and source files.

- **01 — link and hashes** (4 counted): the `Events` columns, the current hash, its trigger.
- **02 — customer** (4): the contact-to-customer link table and the customer resolver.
- **03 — payload** (4): loading the quote and building the QuickBooks invoice body.
- **03b — zone class** (BLOCKED): the QuickBooks Class on the line. Not decided.
- **04 — create** (7): the route, the invoice-number check, create, PDF, log.
- **05 — update** (6): update, overwrite by number, missing invoice, wrong company.
- **06 — totals check** (5): the comparison, the mismatch flag, the Check again route.
- **07 — card: Create and Update** (9): the buttons, the dialogs, the capability, the matrix.
- **08 — card: View and Check again** (5): the two extra buttons and the view route.
- **09 — card: banner** (6): the attention rule and the banner on the quote card.
- **10 — Need attention tab** (6): the third tab of `/accountant` and its list.
- **11 — counts and marks** (8): sidebar counts, tab counts, row marks.

Specs 01–06 add no screen. 07 is the first place a person can use the feature, so the
permission matrix changes in 07, 08, 09, 10 and 11.

## 4. Facts found in the code that the specs rely on

- A signed-in server route writes with the user's token, and the accountant guard trigger on
  `Events` (spec 05 of the accountant series) refuses every column but `is_qbo`. The service
  role is not checked, which is why the invoice route writes with it.
- The existing `content_hash` and `contract_hash` read only `Events.contact_uuid`; they ignore
  `finance_contact_uuid`, although the quote document shows the finance contact first. The new
  hash follows the quote document, so spec 01 also lets a finance-contact edit reach the hash.
- The quote form's tax is calculated by `/api/quickbooks/tax-percent`: US addresses through a
  temporary QuickBooks Estimate (Automated Sales Tax), Canadian provinces from a static table.
  Nothing in the app writes a document to QuickBooks Canada today.
- A booked event whose signature is invalidated moves to `unsigned_changes`
  (`20261018150000_unsigned_changes_status.sql`). Booked-only Create therefore excludes it.
- `Events.invoice_number` is nullable (old events have none), nine digits, unique.
- QuickBooks' own rule in `tax-percent`: the line-level tax code must be `TAX` or `NON`.

## 5. Readings to confirm at review

Places where the wording of a decision left a detail, and the spec reads it one way.

- The invoice amount, the tax and the totals check use the quote document's own figures:
  line items after discounts, and `tax_amount_cents` when set, else the rate on the taxable
  amount (spec 03).
- The "client" part of the hash is the billed contact's id and first and last name — not the
  email or the company (spec 01).
- A company alone does not make a QuickBooks customer a match; a person at an existing
  company who is not in QuickBooks is created as a new flat customer (spec 02).
- The picker also offers "Create a new customer" (spec 02, 07).
- Overwriting replaces the fields the app sets; fields it never sets stay (spec 05).
- The customer link that points at a deleted or inactive customer is dropped and the search
  runs again (spec 02).
- Where the invoice-number check, the Item lookup or a sandbox detail is named "to verify",
  it is something only a QuickBooks sandbox run can confirm (specs 03, 04, 08).
- The Need attention list has the first four columns of the AR tabs plus a Reason column (10).
- The numbers on the three tab labels count that tab's own rows after the page's filters; the
  sidebar count is global over non-deleted quotes (11).
- A button that is not allowed is not drawn, not disabled (07).
- Create is refused, with a message, when the quote lacks an invoice number, an event type,
  a sales office with a connection, a contact with a name, or a venue street and state (03).
- The banner is not drawn on a deleted quote (09).

## 6. Not in any of these specs

- Sending the invoice to the client, or any QuickBooks email.
- Canada, and the Sale event type (added to `EventTypes` by the user later).
- Creating QuickBooks Items or Classes from the app.
- Merging the contacts and companies tables.
- Payments recorded in QuickBooks, and credit memos.
- Deleting or voiding an invoice in QuickBooks.

## 7. Deploy order

Migrations 01 and 02, then the app. No `sync_rules.yaml` change: `Events` already syncs whole-row
to admin and accountant, and the new table of spec 02 is server-only.
