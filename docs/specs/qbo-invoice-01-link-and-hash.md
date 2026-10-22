# QuickBooks invoice — the link columns and the current hash

Status: **DRAFT 2026-10-22 — awaiting "Approved".** 0 open decisions.
Implementation order: **01 of 10**. Plan: [qbo-invoice-plan.md](qbo-invoice-plan.md).
Branch: `q4-sprint1-finance-role`.
Builds on: [quote-staleness-detection.md](quote-staleness-detection.md) (the same trigger
machinery), [accountant-quotes-05-is-qbo-column.md](accountant-quotes-05-is-qbo-column.md)
(the accountant guard on `Events`).

## 0. The request, and what it is not

The app will keep, on each quote, which QuickBooks invoice it made and whether that invoice
still matches the quote. This spec adds the storage and the one value the database can keep
by itself:

- five columns on `Events`;
- a **current hash** — a fingerprint of everything the invoice is built from — kept up to
  date by the same triggers that keep `content_hash` and `contract_hash`.

The **sent hash** (what the invoice was built from when it was last written) is a column
here but is written by later specs. "Outdated" will mean: current hash is not the sent hash.

**Not part of this spec:** any route, screen or QuickBooks call; the customer link (spec 02);
who may read these columns beyond what `Events` already gives.

## 1. Decisions (all taken by the user)

**D1 — where the link lives and who writes it**

- **Question:** the invoice id, the sent hash and the mismatch flag need a home, and the
  invoice route needs a way to write them.
- **Option A — `Events` columns, written with the service role.** No change to the accountant
  guard; no `sync_rules.yaml` edit.
- **Option B — `Events` columns, written with the user's token;** the guard is widened.
- **Option C — a new table `EventQboInvoices`;** RLS, `AppSchema.ts` and a sync rule.
- **User's answer: A.**

**D2 — may a browser write these columns**

- **Option A — leave them like any other `Events` column:** admin and account manager can
  PATCH them; only the accountant is fenced. **Option B — a guard trigger** refusing every
  `authenticated` write to them.
- **User's answer: A — leave as any column.** No guard trigger is added.

**D3 — does the hash include the tax fields**

- **Option A — include `tax_percent`, `tax_amount_cents`, `is_tax_overridden`.** Any tax edit
  makes the invoice outdated. **Option B — exclude them.**
- **User's answer: A — include.**

**From the user's own words (not options):** two hash columns on `Events`, "like
`content_hash`", kept by a trigger. The hashed fields: the event type, the amount, the
client, the venue address, the invoice number, the Event Start, the due date, the title.

## 2. Research findings

- **The function and its triggers.** `recompute_quote_hashes(p_event_id)` builds two jsonb
  documents and writes `content_hash` and `contract_hash` only when one differs. Its latest
  body is in `20260922120000_percentage_payment_schedules.sql`. It is called from triggers on
  `Events`, `EventLineItems`, `PaymentInstallments`, `ContractSignatures`, `Contacts`,
  `TermsAndConditions`, `SalesOffices` and `Addresses`.
- **The Contacts trigger reads one column.** `trg_recompute_quote_hashes_contacts` recomputes
  events with `contact_uuid = NEW.id` only. The quote document shows the **finance contact**
  first (`financeContact ?? contact`), but neither existing hash reads
  `finance_contact_uuid`. Not fixed here for `content_hash`; the new hash needs it (§3.3).
- **Signatures are safe.** `trg_invalidate_signature_on_contract_change` compares the
  signature's stored hash with the new `contract_hash`. A write that leaves `contract_hash`
  as it was cannot invalidate anything, even though it names the column.
- **Which address.** The quote document's venue is `Events.address_uuid`, not `venue_uuid`.
- **Line items.** `EventLineItems.quantity` is a nullable integer (null means 1); discounts
  are lines with a negative `value_cents`; soft-deleted lines have `deleted = true`.
- **The guard.** `guard_events_accountant_columns` refuses an accountant's change to any
  column but `is_qbo`, but skips every caller whose `current_user` is not `authenticated` —
  the service role included. That is why the invoice route can write these columns.
- **Sync.** `Events` already syncs whole-row to admin, account manager and accountant.

## 3. Database — `supabase/migrations/20261022120000_qbo_invoice_link_and_hash.sql`

(After `20261020130000`; renumber if `develop` has moved.)

**3.1 Columns on `public."Events"`.**

- `qbo_invoice_id` — `text`, null. QuickBooks' own id of the invoice.
- `qbo_invoice_connection_uuid` — `uuid`, null, `references "QboConnections"(id)` with
  `ON DELETE RESTRICT` (as `Vendors.qbo_connection_uuid`). The QuickBooks file the invoice
  lives in.
- `qbo_invoice_hash` — `text`, null. The current hash. Written only by the trigger.
- `qbo_invoice_sent_hash` — `text`, null. The value `qbo_invoice_hash` had when the invoice
  was last written. Written by the server.
- `qbo_invoice_mismatch` — `boolean`, not null, `false`. True while QuickBooks' totals
  disagree with the quote's. Written by the server.

Each column gets a `COMMENT`.

**3.2 The third document in `recompute_quote_hashes`.** `CREATE OR REPLACE` with the body of
`20260922120000`, plus a third canonical jsonb document hashed with SHA-256 the same way and
written to `qbo_invoice_hash`. Fixed key order; its members:

- **eventType:** `event_type_uuid`.
- **amountCents:** the sum of `coalesce(quantity, 1) * value_cents` over the event's
  non-deleted line items — the price after discounts, before tax.
- **taxPercent, taxAmountCents, isTaxOverridden:** the three `Events` columns (D3).
- **customer:** the billed contact — the finance contact when `finance_contact_uuid` is set,
  otherwise the contact: its id, first name and last name.
- **venue:** street, city, state and zip of `address_uuid`.
- **invoiceNumber:** `invoice_number`.
- **invoiceDate:** `event_start`.
- **dueDate:** the latest `PaymentInstallments.due_date` of the event; `event_start` when it
  has none.
- **title:** `event_name`.

The function still writes only when a hash differs. `content_hash` and `contract_hash` must
come out **exactly as before** for every event (§7.1 checks this).

**3.3 The Contacts trigger.** `CREATE OR REPLACE` of `trg_recompute_quote_hashes_contacts` so
it recomputes every event where `contact_uuid = NEW.id` **or** `finance_contact_uuid = NEW.id`.

**3.4 Backfill.** As in `20260903120000`: disable `invalidate_signature_on_contract_change`,
run `recompute_quote_hashes` for every event, enable it again, and abort the migration if any
active signature then disagrees with its event.

**3.5 Deliberately not changed:** every RLS policy, `guard_events_accountant_columns`,
`sync_rules.yaml`, the existing two hashes' fields.

## 4. App changes

- `src/lib/powersync/AppSchema.ts`: the five columns in `EventsCols` — four `column.text`
  and `qbo_invoice_mismatch` as `column.integer` (booleans are 0/1 locally).
- `database.types.ts`: the five columns by hand on `Events` `Row`, `Insert` and `Update`
  (`gtl` is not used: the local database lags the migrations), and the foreign key to
  `QboConnections` in `Relationships`.
- No component, hook or route reads these columns yet.

## 5. Behaviour scenarios

No screen changes, so there is no Playwright scenario. The behaviour is asserted in the SQL
test of §7.1.

## 6. Files

**Counted — 4 files** (limit 10):

1. `supabase/migrations/20261022120000_qbo_invoice_link_and_hash.sql` — new
2. `database.types.ts` — changed: the five `Events` columns and the foreign key
3. `src/lib/powersync/AppSchema.ts` — changed: the five columns
4. `package.json` — changed: `test:db:qboinvoicehash`, added to `test:db:all`

**Not counted:** `supabase/tests/qbo_invoice_hash.test.sql` — new. No `sync_rules.yaml`, no
`permissionPageData.ts` (no role gains or loses anything here).

## 7. Tests and implementation sequence

Red first. Playwright: not applicable. Prettier only on touched files.

**7.1 Database**

- **Test asserts, each its own assertion:**
  - a new event has a non-null `qbo_invoice_hash`; `qbo_invoice_id`, `…_sent_hash`,
    `…_connection_uuid` are null and `qbo_invoice_mismatch` is false;
  - each of these changes flips `qbo_invoice_hash`: a line item's price; its quantity; a line
    soft-deleted; `tax_percent`; `tax_amount_cents`; `is_tax_overridden`; the contact's first
    name; the contact's last name; `finance_contact_uuid` set; the finance contact's name; the
    address's street; `invoice_number`; `event_start`; `event_name`; the last installment's
    `due_date`; `event_type_uuid`;
  - with a finance contact set, renaming the **plain contact** does not flip it, and renaming
    the **finance contact** does;
  - with no installment the due date is `event_start`; adding one that is later changes it;
  - these changes leave it alone: `external_notes`, `po_number`, `internal_notes`,
    `quote_valid_till`, the contact's email and phone, a company's name, `event_end`;
  - reverting a change restores the original hash (deterministic);
  - writing `qbo_invoice_id`, `qbo_invoice_connection_uuid`, `qbo_invoice_sent_hash` and
    `qbo_invoice_mismatch` as the table owner does not change `qbo_invoice_hash` and raises
    no error (no trigger recursion);
  - `content_hash` and `contract_hash` of a sample of events are identical before and after
    the migration's function change;
  - a change that flips only `qbo_invoice_hash` (`is_tax_overridden`) leaves an active
    signature active;
  - an accountant-only user cannot change `qbo_invoice_id` or `qbo_invoice_mismatch` (the
    guard refuses with `42501`) and the row is read back unchanged;
  - after the backfill no event has a null `qbo_invoice_hash`.
- **Gate:** dry-run in `BEGIN … ROLLBACK` through the `supabase_db_bleacher_rentals`
  container, with the pending migrations applied inside the same pipe; the new test passes
  and `quote_content_hash.test.sql`, `contract_signature_invalidation.test.sql`,
  `accountant_events_is_qbo.test.sql` stay green. A mutation run (a hash member removed)
  goes red.

**7.2 Types**

- **Gate:** `npm run tc` shows no new error from `AppSchema.ts` or `database.types.ts`;
  `npx vitest run` green. E2E: SKIPPED (not run locally, by instruction).

## 8. Edge cases and error handling

- **A contact edited in the address book.** The Contacts trigger recomputes the events that
  use it as contact or finance contact; the cost is one hash per such event.
- **An event with no address, contact or line items.** The document carries nulls and zero;
  the hash exists. Whether such an event can be invoiced is spec 04's rule.
- **`qbo_invoice_sent_hash` null while `qbo_invoice_id` is set.** Cannot happen through the
  route (spec 04 writes both together). If it does, specs 09–11 read it as outdated.
- **A deleted event** keeps its hash and its link.
- **Offline.** The columns sync down read-only; this app never writes them from the client.
- **Clerk.** Nothing new: no route, token or webhook is touched.

## 9. Risks

- **R1 — one more document on the hot function.** `recompute_quote_hashes` runs on every
  quote-related write; it now builds and hashes a third document. The cost is small but
  real.
- **R2 — parity with the payload.** The hash says "outdated" only for fields it lists. If the
  payload of spec 03 ever reads another field, the hash must grow with it; spec 03's test
  pins the list.
- **R3 — the widened Contacts trigger** also recomputes `content_hash` for events that use
  the edited contact as finance contact. That hash's own document does not read the finance
  contact, so its value does not change; only the work is added.
- **R4 — the finance-contact gap in `content_hash`** (§2) is left as it is.

## 10. Out of scope

- Any route, screen, hook or QuickBooks call.
- The customer link table (spec 02).
- Writing the sent hash or the mismatch flag (specs 04–06).
- Fixing `content_hash` and `contract_hash` for the finance contact.
- A guard trigger that stops browsers writing the new columns (D2).
