# QuickBooks invoice — the link columns and the mismatch flag

(The file keeps its old name, `…link-and-hash`, by the user's choice of 2026-10-23: the hash it
once described is gone.)

Status: **AMENDED TWICE 2026-10-23 — approved and implemented.** 0 open decisions. The earlier version
(five columns and a current hash kept by a trigger) was implemented on 2026-10-22; the user then
asked to remove the hashes (§1), and then to remove `qbo_invoice_connection_uuid` (§1, "One source
for the QuickBooks file"). The migration `20261022140000_qbo_invoice_link_and_hash.sql` is
edited in place — the feature is not in production.
Implementation order: **01** (see the plan, §3). Plan: [qbo-invoice-plan.md](qbo-invoice-plan.md).
Branch: `q4-sprint1-finance-role`.
Builds on: [accountant-quotes-05-is-qbo-column.md](accountant-quotes-05-is-qbo-column.md)
(the accountant guard on `Events`).

## 0. The request, and what it is not

The app keeps, on each quote, which QuickBooks invoice it made and whether that invoice still
matches the quote. This spec is the storage for that:

- the link: the invoice's id. The QuickBooks file it lives in is not stored: it is the file of
  the quote's sales office, `Events.sales_office_uuid` → `SalesOffices.quickbook_uuid`;
- the **mismatch flag** and the **reasons** behind it.

The user's request of 2026-10-23: **remove the hashes from `Events`** (`qbo_invoice_hash`,
`qbo_invoice_sent_hash`) and everything that writes or reads them. Instead of a fingerprint kept in
the database, the app asks QuickBooks: it reads the invoice over the network, compares it with the
quote and stores the answer (spec 06). The flag is `qbo_invoice_mismatch`.

**Not part of this spec:** any route, screen or QuickBooks call; the comparison itself (06); the
customer link (02); who may read these columns beyond what `Events` already gives.

## 1. Decisions (all taken by the user)

**D1 — where the link lives and who writes it** (unchanged)

- **Option A — `Events` columns, written with the service role.** No change to the accountant
  guard; no `sync_rules.yaml` edit. **Option B** — user's token, guard widened. **Option C** — a
  new table `EventQboInvoices`.
- **User's answer: A.**

**D2 — may a browser write these columns** (unchanged)

- **User's answer: A — leave them like any other `Events` column.** Admin and account manager can
  PATCH them; only the accountant is fenced. No guard trigger is added.

**D3 — does the hash include the tax fields: VOID.** There is no hash any more. A tax that
differs is found by the comparison (spec 06).

**From the user's own words, 2026-10-23 (not options):**

- **Remove the hashes** from the `Events` table and from the migration, and with them everything
  that writes or reads a hash.
- **Compare with a request to QuickBooks.** Equal → `qbo_invoice_mismatch = false`; any
  difference → `qbo_invoice_mismatch = true` (spec 06, which says when it runs).
- **The Need attention list shows the real reason** (for example "Dates do not match"), not one
  fixed text (spec 10). So the reasons must be kept, which is why the table gains a column (§3).
- **The card shows when the quote was last checked** (user's answer, 2026-10-23), so a check that
  did not run is not mistaken for a clean invoice. Two timestamps are kept for it (§3).
- **One source for the QuickBooks file** (2026-10-23). `Events` had a second copy of it,
  `qbo_invoice_connection_uuid`, beside the one the sales office already has. **Remove the column**
  and send every QuickBooks call — create, update, check, PDF — to the connection of the quote's
  sales office (`sales_office_uuid` → `quickbook_uuid`).
- **The "office moved" case is not detected** (user's answer, 2026-10-23, to the question of what
  replaces spec 05's refusal: "just remove it"). Without a stored file there is nothing to compare
  the office's connection with, so Update no longer refuses and nothing replaces the refusal. What
  follows from it is in §8 and R3.

## 2. Research findings

- **What the first version did, and so what is removed.** `20261022140000` added five columns,
  rebuilt `recompute_quote_hashes()` with a third jsonb document hashed into `qbo_invoice_hash`,
  widened `trg_recompute_quote_hashes_contacts` to the finance contact, and backfilled every event
  under a disabled signature-invalidation trigger. All of that except the columns existed only
  for the hash.
- **`recompute_quote_hashes` after the edit.** The migration no longer touches it: the function
  stays exactly as `20260922120000_percentage_payment_schedules.sql` left it, and the Contacts
  trigger stays as it was before. `content_hash` and `contract_hash` are not affected.
- **The guard.** `guard_events_accountant_columns` refuses an accountant's change to any column
  but `is_qbo`, and skips every caller whose `current_user` is not `authenticated` — the service
  role included. That is why the invoice route can write these columns.
- **Sync.** `Events` already syncs whole-row to admin, account manager and accountant.

## 3. Database — `supabase/migrations/20261022140000_qbo_invoice_link_and_hash.sql` (edited)

Five columns on `public."Events"`, each with a `COMMENT`:

- `qbo_invoice_id` — `text`, null. QuickBooks' own id of the invoice, in the QuickBooks file of
  the quote's sales office. The comment says so.
- `qbo_invoice_mismatch` — `boolean`, not null, `false`. True while the last comparison found a
  difference between the quote and its QuickBooks invoice.
- `qbo_invoice_mismatch_reasons` — `text`, null. **New.** A JSON array of reason codes (spec 06,
  §4), for example `["dates","totals"]`. Null whenever the flag is false. Written in the same
  statement as the flag.
- `qbo_invoice_checked_at` — `timestamptz`, null. **New.** When the last check that read the
  invoice finished (spec 06). Null until the first check.
- `qbo_invoice_check_failed_at` — `timestamptz`, null. **New.** When the last check that could not
  finish was tried (QuickBooks unreachable, the invoice missing, the quote not comparable). Cleared
  by the next successful check. Only the time is kept, not the message.

**Removed from the file:** the columns `qbo_invoice_hash` and `qbo_invoice_sent_hash`; the
`CREATE OR REPLACE` of `recompute_quote_hashes`; the `CREATE OR REPLACE` of
`trg_recompute_quote_hashes_contacts`; the backfill and its drift check. What is left is the
`ALTER TABLE … ADD COLUMN` and the comments, and the header comment is rewritten to say so.
The column `qbo_invoice_connection_uuid` and its foreign key to `QboConnections` are removed too
(2026-10-23); the header comment says where the file comes from instead.

**Deliberately not changed:** every RLS policy, `guard_events_accountant_columns`,
`sync_rules.yaml`, `content_hash`, `contract_hash` and the triggers that keep them.

## 4. App changes

- `src/lib/powersync/AppSchema.ts`: five columns in `EventsCols` — `qbo_invoice_id`,
  `qbo_invoice_mismatch_reasons`, `qbo_invoice_checked_at` and `qbo_invoice_check_failed_at` as
  `column.text` (timestamps are text locally); `qbo_invoice_mismatch` as `column.integer`
  (booleans are 0/1 locally). The two hash columns and `qbo_invoice_connection_uuid` are taken
  out, and the comment above them is corrected.
- `database.types.ts`: by hand (`gtl` is not used: the local database lags the migrations) — the
  two hash columns and `qbo_invoice_connection_uuid` out of `Events` `Row`, `Insert` and `Update`,
  the three new columns in, and the foreign key `Events_qbo_invoice_connection_uuid_fkey` out of
  `Relationships`.
- **Every reader and writer of the two hashes is removed** — they live in specs 03, 04, 05, 09, 10
  and 11, which say how, and in the e2e specs and tests listed there. Nothing outside the
  QuickBooks invoice feature reads them.

## 5. Behaviour scenarios

No screen changes, so there is no Playwright scenario. The behaviour is asserted in the SQL test
of §7.1.

## 6. Files

**Counted — 3 files** (limit 10):

1. `supabase/migrations/20261022140000_qbo_invoice_link_and_hash.sql` — changed (§3)
2. `database.types.ts` — changed: the columns of §4
3. `src/lib/powersync/AppSchema.ts` — changed: the columns of §4

**Not counted:** `supabase/tests/qbo_invoice_hash.test.sql` — rewritten (§7.1); its file name and
the script `test:db:qboinvoicehash` in `package.json` keep their names (the user's choice), so
`package.json` is not edited. No `sync_rules.yaml`, no `permissionPageData.ts` (no role gains or
loses anything here).

## 7. Tests and implementation sequence

Red first. Playwright: not applicable. Prettier only on touched files.

**7.1 Database** — `qbo_invoice_hash.test.sql` keeps only what still has a meaning:

- the five columns exist with the right types and defaults: a new event has `qbo_invoice_id`,
  `qbo_invoice_mismatch_reasons`, `qbo_invoice_checked_at` and `qbo_invoice_check_failed_at` null
  and `qbo_invoice_mismatch` false;
- the two hash columns and `qbo_invoice_connection_uuid` **do not exist**
  (`information_schema.columns` has no row for them);
- writing the five columns as the table owner raises no error and does not change
  `content_hash` or `contract_hash` (no trigger recursion);
- `content_hash` and `contract_hash` of a sample of events are identical before and after the
  migration;
- a change to the invoice columns leaves an active signature active;
- an accountant-only user cannot change `qbo_invoice_id`, `qbo_invoice_mismatch`,
  `qbo_invoice_mismatch_reasons`, `qbo_invoice_checked_at` or `qbo_invoice_check_failed_at` (the
  guard refuses with `42501`) and the row is read back unchanged.

All the "each field flips the hash" assertions of the first version are deleted with the hash.

- **Gate:** dry-run in `BEGIN … ROLLBACK` through the `supabase_db_bleacher_rentals` container,
  with the pending migrations applied inside the same pipe; the rewritten test passes and
  `quote_content_hash.test.sql`, `contract_signature_invalidation.test.sql`,
  `accountant_events_is_qbo.test.sql` stay green.

**7.2 Types**

- **Gate:** `npm run tc` shows no new error from `AppSchema.ts` or `database.types.ts`;
  `npx vitest run` green. E2E: SKIPPED (not run locally, by instruction).

## 8. Edge cases and error handling

- **A database that already ran the first version of the migration** has the two hash columns,
  the third document in `recompute_quote_hashes` and the widened Contacts trigger, and editing the
  file does not undo them. Such a database (the user's local one, and any shared dev one) must be
  rebuilt (`npx supabase db reset`) or have the three changes reverted by hand; otherwise the old
  function keeps writing a column the app no longer reads. A database that never ran it needs
  nothing. The same holds for `qbo_invoice_connection_uuid`: a database that ran an earlier
  version still has the column (and its foreign key to `QboConnections`), which the app no longer
  reads or writes; the reset removes it.
- **The office's QuickBooks file changes, or the quote moves to another office.** The invoice id is
  then looked up in the new file (user's answer, §1). If the invoice is not there, the app reports
  it as missing, as for any invoice deleted in QuickBooks (spec 05 case 3, spec 06 `missing`). If
  the new file has an invoice with the same id, that one is read, compared or updated as the
  quote's: QuickBooks ids are unique only within a company (R3).
- **A flag with no reasons.** The flag is the truth and the reasons explain it. A browser may PATCH
  one column without the other (D2), and rows written before the reasons existed have none: a
  reader's rule in spec 09 shows a generic text for a set flag with no reasons.
- **A deleted event** keeps its link and its flag.
- **Offline.** The columns sync down read-only; this app never writes them from the client.
- **Clerk.** Nothing new: no route, token or webhook is touched.

## 9. Risks

- **R1 — applied copies of an edited migration** (§8). The edit is safe only because the feature
  is not in production; the shared databases that ran it need the reset.
- **R2 — columns that can disagree** (§8): the flag and its reasons are written together by the
  server and apart by a hand PATCH; the check times only by the server.
- **R3 — the QuickBooks file is not remembered** (§1, §8). `qbo_invoice_id` is read in whatever file
  the quote's office points at now. An office moved to another file, or a quote moved to another
  office, can make a call land on an invoice of the same id in the wrong company — an Update then
  rewrites it, and a check compares it. The user accepted this when asking to remove the column.

## 10. Out of scope

- Any route, screen, hook or QuickBooks call.
- The customer link table (spec 02).
- Writing the flag, the reasons and the check times (specs 04–06).
- A guard trigger that stops browsers writing the new columns (D2).
