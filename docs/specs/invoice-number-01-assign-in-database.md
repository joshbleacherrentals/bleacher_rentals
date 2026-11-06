# Invoice number — the database assigns it when the event is created

> **Amended 2026-11-06 by [03 — start at 300000001](invoice-number-03-start-at-300000001.md):** the counter now runs from 300000001 to 999999999, and the numbers this spec gave (1, 2, 3, …) were moved up by 300000000. Where this text says the counter starts at 1, 03 wins.

Status: **Implemented 2026-11-04 (approved in chat), not committed, not deployed.** 0 open
decisions; six readings to confirm (§1, last paragraph); one change made while implementing
(§2, §3 step 2, R1: the backfill switches the user triggers off). Pair: [02 — nine-digit format](invoice-number-02-nine-digit-format.md); the two are
independent and may ship in either order. Branch: `q4-sprint3-bug-fix`.

## 0. The request, and what it is not

In production 545 rows of `Events` have an `invoice_number` and 1364 have none. For a row without
one the app refuses to create a QuickBooks invoice (`no_invoice_number`, spec 03), so the
accountant cannot invoice those events. Every event must have a **unique** number taken from
**one counter** that only goes up (1, 2, 3, …). The database assigns it when the row is created,
and the 1364 rows without one are numbered once, in the order they were created.

**Not part of this spec:** how the number is written (nine digits, `000000042`: spec 02); the 545
existing numbers (never changed); the QuickBooks code; any change to who may do what.

## 1. Decisions (all taken by the user)

**Question 1 — when the number is assigned**

- **Option A — when the row is created, by the database.** Every quote has a number from the first
  moment; QuickBooks will see gaps, because only some quotes become invoices.
- **Option B — when Create invoice is pressed.** QuickBooks numbers have no gaps; a quote has no
  number until then.
- **User's answer: A.**

**Question 2 — the counter: plain, or without gaps**

- **Option A — plain counter.** Fast. A gap is possible when an insert is cancelled after its number
  was taken. No locks.
- **Option B — counter without gaps.** A cancelled insert gives its number back; event creation
  goes through one queue.
- **User's answer: A.** Gaps in QuickBooks are not critical; gaps in the database are "not very
  critical, but preferably none", so the cheap cases are closed in §3 (rules 2 and 3).

**Question 3 — a number that is already set**

- **Option A — the database ignores a change** (no error). Also protects against an old open
  browser tab, which still sets a random number itself.
- **Option B — no protection:** anyone who may write `Events` may change it.
- **User's answer: A.**

**From the user's own words (not options):**

- The 545 existing numbers are **not changed**. The old random numbers (from 100000000) stay larger
  than the new ones; the user accepts that sorting by number is not by date across old and new.
- **All 1364 rows without a number are numbered**, in order of `created_at`.
- **One counter for every event**, not one per QuickBooks company.
- **No two events ever share a number.**
- The number is stored as a number; spec 02 shows it with nine digits (QuickBooks gets it plain, spec 02 §1a).

**Readings to confirm at review.**

- **An insert that brings its own number keeps it** (the seed, test fixtures and old data do). If
  the counter's next number is already taken by such a row, the counter skips to the next free one,
  which is a gap.
- **`generate_invoice_number()` is dropped** in the same migration. After §4 nothing calls it. An
  old open tab that still calls it gets an error, which its code ignores (it only writes the number
  when one comes back), so it simply writes nothing.
- **The number arrives after the sync.** A quote made on the user's screen has no number until the
  upload reaches the database and the row comes back. Until then the number cell shows "—" and
  Create invoice answers `no_invoice_number`, as for any quote without one today.
- **The backfill touches only rows whose number is null,** including deleted events, and runs once in
  the migration.
- **Two uploads of the same new row at the same instant** can still burn one number (rule 2 reads
  before the insert). Accepted under the plain counter.
- **Sequence name and trigger names** are mine; they carry no behaviour.

## 2. Research findings

- **Three code paths create an event.** `createQuoteEvent.ts` (new quote) and `createLeadQuote.ts`
  (lead) insert the row and then, as a second step, ask the database for a number with the RPC
  `generate_invoice_number` and write it back. If the RPC fails (offline, error) the code goes on
  without a number and nothing retries: that is how a row stays empty. `dashboard/db/client/db.ts`
  (an event created from the dashboard) inserts the row and never asks for a number.
- **Rows older than the column** (migration `20260614220000`, "nullable for old events") were never
  backfilled.
- **The function today** picks a random nine-digit number (100000000–999999999) and checks it is free.
  The unique index `Events_invoice_number_key` (partial: `where invoice_number is not null`) is what
  really keeps numbers unique, and it stays.
- **PowerSync uploads a new row as an upsert** (`BackendConnector.ts`, `UpdateType.PUT` →
  `table.upsert`), so the same new row may be sent again and arrive as `INSERT … ON CONFLICT DO
UPDATE`. A `BEFORE INSERT` trigger runs before the conflict is noticed.
- **Other triggers on `Events` that an update of `invoice_number` would wake:**
  `recompute_quote_hashes_events` (`AFTER INSERT OR UPDATE`, spec of quote staleness), and
  `guard_events_accountant_columns` (`BEFORE UPDATE`; it lets anything through unless the caller is
  the `authenticated` role). The status triggers fire only on `event_status`. The hash does not read
  `invoice_number`, so the backfill must leave `content_hash` and `contract_hash` as they are and
  must not invalidate a signature; §7 asserts it. **Found while implementing:** the collections
  trigger `ar_sync_tasks_on_events` (`AFTER UPDATE`, deferred, on any changed column) would also
  re-sync the collections tasks of every event the backfill touches, and `work_tracker_*`,
  `events_*` triggers sit on the same table. Hence the backfill switches the user triggers off
  (§3, step 2).
- **`created_at`** is `NOT NULL DEFAULT now()`; the order of the backfill is therefore defined for
  every row.
- **No column or schema change:** the column stays `bigint`; `AppSchema.ts` (`column.integer`) and
  `sync_rules.yaml` are untouched. The RPC is listed in the root `database.types.ts` (Functions); the
  two call sites cast it (`as any` / `as never`).

## 3. Database

One migration, `supabase/migrations/20261103120000_events_invoice_number_sequence.sql`, in this
order, in one explicit transaction (`BEGIN; … COMMIT;`: the Supabase CLI sends a migration file as
a batch, which is not a transaction block, and `LOCK TABLE` refuses to run outside one; the block
also keeps the change all-or-nothing when the file is run any other way, so a failed backfill can
never leave the triggers of `Events` switched off):

1. A sequence, `events_invoice_number_seq`, starting at 1.
2. **The backfill.** `Events` is locked against writes for the length of the migration, and its user
   triggers are switched off for the backfill and on again after it (it is a data fix: no hash
   recompute, no collections task sync, no side effects; the rows still reach PowerSync, which reads
   the replication log). Every row whose `invoice_number` is null gets the lowest free numbers
   from 1 upward, in the order of `created_at`, ties broken by `id`; a number a row already holds is
   skipped, so the backfill cannot collide with one. The sequence then continues after the last
   number given.
3. **Trigger function `assign_invoice_number`**, `SECURITY DEFINER` with a fixed `search_path` (so
   `nextval` works for every role), attached `BEFORE INSERT … FOR EACH ROW` on `Events`:
   - **Rule 1.** If the new row already has a number, it is left alone.
   - **Rule 2.** Otherwise, if a row with the same `id` already exists (the upload of a new row is
     being repeated), nothing is taken from the sequence.
   - **Rule 3.** Otherwise the next number of the sequence is taken; while another row already holds
     it, the next one is taken.
4. **Trigger function `keep_invoice_number`**, `BEFORE UPDATE OF invoice_number … FOR EACH ROW` on
   `Events`: when the stored number is not null, the new row keeps the stored one. No error, so an
   upload is never refused or retried.
5. `drop function generate_invoice_number()`.

The unique index, the column type, RLS, `AppSchema.ts` and `sync_rules.yaml` do not change. The
`generate_invoice_number` entry is removed from `database.types.ts` by hand (`npm run gtl` would
overwrite the file from a local database that may lag the migrations).
`supabase/seed.sql` gets a numbering block at its end. **Found when `supabase db reset` was run:** the
seed inserts most of its rows with the triggers off, so the rows that carry no number stayed without
one in a local database (1346 of 1473 events after the reset); a production database does not have
this, because its migration numbers every row (step 2). **Decided by the user (2026-11-04):** number
them in the seed too. The block is the numbering of step 2 (the lowest free numbers from 1 upward,
in the order of `created_at`, ties by `id`, a held number skipped), run with
`session_replication_role = replica` as at the top of the file, after the last insert; the counter
then continues after the highest of them (never backwards). Rows that carry a number keep it (rule
1).

## 4. App changes

- **`createQuoteEvent.ts`** (changed): the block that calls `generate_invoice_number` and writes the
  number back is removed, with its comment.
- **`createLeadQuote.ts`** (changed): the same block is removed, with its comment ("A failure here
  leaves a quote without a number…").
- **`dashboard/db/client/db.ts`**: unchanged; the trigger numbers its inserts.
- **`permissionPageData.ts`**: unchanged. No role gains or loses anything; the number is assigned by
  the database, not by a person.

## 5. Behaviour scenarios

Playwright, written, **not run** (by instruction).

- **S1** a quote created from the quote form shows an invoice number on its detail page once the
  upload has synced; it is a number, not the event's uuid.
- **S2** an event created from the dashboard form gets a number the same way.
- **S3** two quotes created one after the other show consecutive numbers (the second is the first plus
  one); the assertion compares the two, so it holds whatever the counter's value is.

## 6. Files

**Counted — 4 files** (limit 10):

1. `supabase/migrations/20261103120000_events_invoice_number_sequence.sql` — new
2. `src/features/quotesAndBookings/db/createQuoteEvent.ts` — changed
3. `src/features/leads/server/createLeadQuote.ts` — changed
4. `supabase/seed.sql` — changed (the numbering block at the end, §3)

**Not counted:** `supabase/tests/events_invoice_number.test.sql` (new), `createQuoteEvent.test.ts` and
`createLeadQuote.test.ts` (new: no test of either existed), the Playwright file of §5 (new,
`invoiceNumberAssign.admin.spec.ts`), `package.json` (the script `test:db:invoicenumber`, also
added to `test:db:all`), `qboInvoiceCreate.admin.spec.ts` (its S3, a booked quote with no invoice
number, is removed: a row without a number can no longer be made, see
[spec 04](qbo-invoice-04-create.md) §5); `database.types.ts` (one entry removed). No `AppSchema.ts`, no
`sync_rules.yaml`, no `permissionPageData.ts`.

## 7. Tests and implementation sequence

Red first. SQL tests run through the Supabase container inside `BEGIN … ROLLBACK`
(there is no host `psql`). Prettier only on touched files.

- **SQL, the trigger:** an insert with no number gets the next number; two inserts get consecutive
  numbers; an insert that brings a number keeps it; when the next number is held by another row the
  insert gets the one after it; a repeated upload of the same `id` takes nothing from the sequence and
  leaves the stored number as it was; an update that sets another number, or null, leaves the stored
  one; an update on a row whose number is null may set it; the unique index still refuses a duplicate
  inserted by hand.
- **SQL, the backfill** (the migration's step 2 on a copy of the table's data, in a rollback): rows get
  numbers in order of `created_at`, equal `created_at` ordered by `id`; rows that already had a number
  are unchanged; afterwards the next insert gets last number + 1; `content_hash`, `contract_hash`,
  every `ContractSignatures` row, every `ArEventTasks` row and every `event_status` are unchanged;
  every trigger of `Events` is enabled again; deleted events are numbered. This is a dry run by hand
  (a scratch script, not a committed test): after the migration no row is left for the backfill to
  number, so a committed test cannot exercise it.
- **Unit:** `createQuoteEvent` and `createLeadQuote` no longer call the RPC and write no number.
- **Gate:** `npm run tc`, `npx vitest run`, `prettier --check` on the touched files. E2E: SKIPPED
  (not run locally, by instruction).
- **Before production:** run the backfill dry-run against a copy, check the count of rows it numbers
  equals the count of null numbers (1364 at the time of writing), then apply.

## 8. Edge cases and error handling

- **Offline / PowerSync.** An event made offline is numbered when its upload reaches the database; the
  number comes back with the next sync. Until then: "—" in the list, `no_invoice_number` on Create
  invoice.
- **An old open browser tab** (earlier code) inserts the row, asks for a number (the function is
  gone, so it gets an error and writes nothing). If it did write a number, the update is ignored.
- **Clerk.** Not applicable: no route or role is involved.
- **Two events inserted at the same instant** get two different numbers; the sequence hands them out
  one at a time.
- **A cancelled insert** after its number was taken leaves a gap (Question 2, answer A).
- **An event is deleted (soft).** It keeps its number; numbers are never reused.
- **A number is already held by a hand-made row.** The counter skips it (§1, first reading).

## 9. Risks

- **R1 — the backfill runs with the user triggers of `Events` switched off,** so none of their
  effects (quote hashes, collections tasks, status and work-tracker updates) happen for those rows;
  they have nothing to react to, since only `invoice_number` changes. Switched back on in the same
  transaction; the dry run (§7) counts the triggers enabled afterwards.
- **R2 — every client downloads 1364 changed rows** once, after the deploy.
- **R3 — QuickBooks sees gaps** (Question 1). Accepted.
- **R4 — an event numbered by the trigger shows its number only after the sync** (§1). Accepted.

## 10. Out of scope

- Renumbering the 545 existing events, or giving old and new numbers one common order.
- A counter per QuickBooks company, or a number given at Create invoice.
- A screen or alert for an event without a number; after this spec none should remain.
- Any change to who can see or edit an event.
