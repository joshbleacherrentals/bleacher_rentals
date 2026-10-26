# QuickBooks invoice from a quote — plan and decisions

Status: **DRAFT 2026-10-22; AMENDED 2026-10-23 — the amended specs await "Approved".** The
amendment of 2026-10-23 (user's request): **the hashes are removed**; the app compares the invoice
with QuickBooks instead (specs 01, 04, 05, 06, 06a, 09, 10, 11), and the Canadian settings on
`/quickbooks` are shown for CAD connections only (03e). None is blocked.
**Amended 2026-10-26 (user's request; approved and implemented):** the line's Product/Service is no longer
built from the event type's name; each event type is **assigned** a QuickBooks Product/Service per
connection, on a new Quote Types page under Configuration (specs 12, 12a, 12b).
Branch: `q4-sprint1-finance-role`.
Specs: `qbo-invoice-01` … `qbo-invoice-11`, plus `03a-province-tax-codes`, `03b-zone-class`,
`03c-no-tax-code`, `03d-canadian-line-tax-code`, `03e-canadian-settings-cad-only`,
`06a-check-on-save`, and `12-event-type-services`, `12a-quote-types-page`,
`12b-use-the-mapping` and `12c-manage-quote-types`.
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
when the invoice in QuickBooks no longer matches the quote, and told what differs.

## 1. The invoice, field by field (decided by the user)

- **Product/service:** one line. ~~`Bleacher Rental - {event type}`, the same names in both
  QuickBooks files.~~ **Amended 2026-10-26 (12, 12a, 12b):** the Product/Service **assigned** to
  the quote's event type for the QuickBooks connection of its sales office, set on the Quote
  Types page. Event types today are City, Corporate and Rural; Sale is added later and then
  needs an assignment too.
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
- **Class:** the quote's zone, through the existing `ZoneQboClasses` (spec 03b). A quote with
  no Class is created without one, with a warning.

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
- **Canada is supported.** The Canadian QuickBooks file applies whatever tax code it is
  handed, so each Canadian province gets its own QuickBooks tax code, mapped per connection
  by an admin on `/quickbooks` (spec 03a). A taxed Canadian quote whose province has no code
  is created without tax, with a warning.
- **No hash (2026-10-23):** `Events` has no invoice hash. The invoice is compared with QuickBooks
  over the network (spec 06) and the answer is stored as `qbo_invoice_mismatch` plus its reasons
  (spec 01). The `requestid` of a create is made from the event alone (spec 04).
- **Customer:** the finance contact when set, otherwise the contact. The search looks at the
  company, the name and the email. One match is used; several open a picker; none creates a
  new flat customer (company in its Company name field). The choice is remembered per
  contact and QuickBooks connection.
- **Invoice number already in QuickBooks:** the user is told and may overwrite it. Overwriting
  links that invoice to the quote and replaces its content with the quote's data.
- **Linked invoice missing in QuickBooks:** the app says it was not found and offers a new
  one. If the user says no, it is probably a bug and they go to the developer.
- **Invoice check:** the whole invoice is compared, every field the app writes (user's answer,
  2026-10-23), with zero tolerance on money. It runs after a create, after an update, after a
  quote's Save, and on **Check again** (06, 06a) — **only these** (user's answer, 2026-10-23, after
  the QuickBooks request limits were explained). Opening a quote checks nothing, and there is no
  QuickBooks webhook. A mismatch is a notification for accountants, with its reasons; the card shows
  when the quote was last checked.
- **Left as they are (user's answers, 2026-10-23):** the two QuickBooks calls per check (no Item
  cache); the token refresh, which has no lock (06, R5); a change made by hand in QuickBooks, or outside
  Save (the address book, settings), which only the next Save, Update or Check again picks up.
- **PDF fails to attach:** the invoice stays, the user sees a warning, Update retries it.
- **One source for the QuickBooks file (2026-10-23):** `Events` has no connection column; every
  QuickBooks call uses the quote's sales office's connection (`sales_office_uuid` →
  `quickbook_uuid`). **Office moved to the other QuickBooks file:** not detected (user's answer);
  the earlier refusal of Update is gone (spec 01 §1, §8, R3).
- **Product/Service assignment (2026-10-26):** a junction table `EventTypeQboServices` (event type,
  connection, `qbo_service_id`); a **Quote Types** page under Configuration, opened by an **admin
  and an accountant**, where **each select saves at once**; the picker lists **every active
  Item that can be sold**; a type with **no assignment is refused** with a message (Create and
  Update do not run, the check is skipped), with no fallback to the old name. The accountant sees
  the Configuration section with Quote Types as its only entry.
- **Notification places:** sidebar counts, tab counts, a row mark in the lists, and a banner
  on the quote card. Accountants only. An admin who is not an accountant sees the Need
  attention tab but none of the signals.
- **Need attention tab:** third tab of `/accountant`, opens newest event first.
- **Log:** creating and updating an invoice is written to the quote's Log.

## 3. The specs, in implementation order

Each one is a separate commit with one logic. Counted files = migrations, `database.types.ts`,
`AppSchema.ts`, `permissionPageData.ts`, `package.json`, and source files.

- **01 — link and flag** (3 counted): the `Events` columns: the invoice id, the mismatch flag
  and its reasons. (The file keeps the name `…link-and-hash`.)
- **02 — customer** (4): the contact-to-customer link table and the customer resolver.
- **03 — payload** (4): loading the quote and building the QuickBooks invoice body.
- **03a — Canadian tax code** (8): the code per province, its table and its screen.
- **03b — zone class** (1): finding the QuickBooks Class of a quote.
- **03c, 03d — no-tax code, Canadian line code:** the setting and its use on a Canadian line.
- **03e — CAD only** (3): the province section and the no-tax row appear only for a CAD
  connection.
- **04 — create** (7): the route, the invoice-number check, create, PDF, log.
- **05 — update** (6): update, overwrite by number, missing invoice.
- **06 — invoice check** (10): the comparison of the whole invoice, the flag and reasons, the
  check route. (The file keeps the name `…totals-check`.)
- **06a — check on save** (3): the Save caller, and the check route open to every role that can
  open a quote.
- **12 — Product/Service mapping** (6): the `EventTypeQboServices` table, the Items route and
  the picker. (Added 2026-10-26.)
- **12a — Quote Types page** (5): the page, the accountant's access and sidebar entry, the matrix.
- **12b — the invoice uses the mapping** (8): the loader, the refusal, the Item looked up by id.
- **12c — manage quote types** (3): an admin adds, renames and deletes the types on the Quote Types page
  (added 2026-10-26, approved and implemented).
- **07 — card: Create and Update** (9): the buttons, the dialogs, the capability, the matrix.
- **08 — card: View, Check again, check time** (7): the two extra buttons, the view route and the
  "last checked" line.
- **09 — card: banner** (6): the attention rule and the banner on the quote card.
- **10 — Need attention tab** (6): the third tab of `/accountant` and its list.
- **11 — counts and marks** (8): sidebar counts, tab counts, row marks.

Specs 01–06 add no screen to the quote workflow; 03a adds a section to the admin-only
`/quickbooks` page. 07 is the first place a person can use the feature on a quote, so the
permission matrix changes in 03a, 07, 08, 09, 10 and 11. The order of work is 01, 02, 03, 03a,
03b, 04 … 11; 03a and 03b only supply references (a tax code, a Class) that 03's builder is
given.

## 4. Facts found in the code that the specs rely on

- A signed-in server route writes with the user's token, and the accountant guard trigger on
  `Events` (spec 05 of the accountant series) refuses every column but `is_qbo`. The service
  role is not checked, which is why the invoice route writes with it.
- The quote form's tax is calculated by `/api/quickbooks/tax-percent`: US addresses through a
  temporary QuickBooks Estimate (Automated Sales Tax), Canadian provinces from a static table.
  Nothing in the app writes a document to QuickBooks Canada today.
- A booked event whose signature is invalidated moves to `unsigned_changes`
  (`20261018150000_unsigned_changes_status.sql`). Booked-only Create therefore excludes it.
- `Events.invoice_number` is nullable (old events have none), nine digits, unique.
- QuickBooks' own rule in `tax-percent`: the line-level tax code must be `TAX` or `NON`; for a
  file without Automated Sales Tax the transaction also carries `TxnTaxDetail.TxnTaxCodeRef`.
- Zones and QuickBooks classes are already joined in `ZoneQboClasses` (zone, connection,
  class id); the USA company has five classes, the Canadian one effectively one. The app
  already finds an event's zone with `zoneOfEvent`.

## 5. Readings to confirm at review

Places where the wording of a decision left a detail, and the spec reads it one way.

- The invoice amount, the tax and the invoice check use the quote document's own figures:
  line items after discounts, and `tax_amount_cents` when set, else the rate on the taxable
  amount (spec 03).
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
- The Class is found from the venue's state, and the Canadian path is chosen by the rule the
  tax calculator uses (the venue's state is a Canadian province) (03, 03b).
- The province tax-code section is shown under every connection on `/quickbooks`, and only an
  admin maintains it (03a).
- A button that is not allowed is not drawn, not disabled (07).
- Create is refused, with a message, when the quote lacks an invoice number, an event type,
  a sales office with a connection, a contact with a name, or a venue street and state (03).
- The banner is not drawn on a deleted quote (09).

## 6. Not in any of these specs

- Sending the invoice to the client, or any QuickBooks email.
- The Sale event type (added to `EventTypes` by the user later; it then appears on the Quote Types
  page and needs an assignment).
- ~~Adding, renaming or deleting event types on the Quote Types page.~~ **Amended by 12c:** an admin does
  these there; restoring a deleted type and a duplicate-name check stay out.
- Reading QuickBooks' tax rates to compare them with the calculator's.
- Creating QuickBooks Items or Classes from the app.
- Merging the contacts and companies tables.
- Payments recorded in QuickBooks, and credit memos.
- Deleting or voiding an invoice in QuickBooks.

## 7. Deploy order

Migrations 01, 02 and 03a, then the app. Migration 01 was **edited in place** on 2026-10-23
(the hashes removed); a database that ran its first version must be reset or reverted by hand
(spec 01, §8). No `sync_rules.yaml` change: `Events` already syncs whole-row
to admin and accountant, and the new tables of specs 02 and 03a are server-only.

**Specs 12 – 12b (2026-10-26):** migration 12, then the app. The table `EventTypeQboServices` is
online-only: no `AppSchema.ts` and no `sync_rules.yaml` change (the Quote Types page lists the
types from `EventTypes`, which already syncs to admin and accountant). **Before anyone creates or
updates an invoice, an admin or an accountant assigns every event type for every connection** on
Quote Types, choosing for each the Item `Bleacher Rental - {type}` that the invoices were made with
so far: until then Create and Update refuse and checks are skipped, and a type assigned to any
other Item shows the reason `service` on the next check of its invoices (12b §1).
