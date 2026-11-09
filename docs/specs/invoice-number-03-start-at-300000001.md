# Invoice number — the small numbers move up by 300000000, new numbers start at 300000001

Status: **Approved and implemented 2026-11-06, not committed, not deployed.** 0 open decisions; ten readings to confirm
(§1, last list). Follows [01 — the database assigns it](invoice-number-01-assign-in-database.md) and
[02 — nine-digit format](invoice-number-02-nine-digit-format.md); it changes the range of 01's counter
(1 and up becomes 300000001 and up) and renumbers what 01's backfill gave. Branch:
`q4-sprint3-quick-fix`.

## 0. The request, and what it is not

Migration `20261103120000` (spec 01) gave the events that had no invoice number the numbers 1, 2, 3, …
in the order they were created, and every event created since takes the next number from the same
counter. The user now asks for two things:

1. **Every event whose invoice number has four characters or fewer** (1 to 9999) gets 300000000
   added: 1 becomes 300000001, 43 becomes 300000043. If the new number is already held by another
   event, the next number up is tried (300000001 taken → 300000002), and the first free one is used.
2. **The counter's range changes:** new numbers go from 300000001 to 999999999 (spec 01 said from 1).

**Not part of this spec:** how a number is written (nine digits: spec 02, unchanged); the old random
nine-digit numbers (100000000 and up: never changed); events that already have a QuickBooks invoice
linked by the app (they keep their number, Question 1); any QuickBooks code; any screen.

## 1. Decisions (all taken by the user)

**Question 1 — events with an invoice that the app created or linked in QuickBooks
(`qbo_invoice_id` is not empty)**

- **Option A — renumber them like the rest.** The database says 300000043, QuickBooks keeps 43;
  Check again shows an invoice-number difference until the accountant presses Update invoice, which
  rewrites QuickBooks' number. The old attachment `000000043.pdf` stays on the invoice next to the new
  `300000043.pdf`.
- **Option B — leave them as they are.** QuickBooks and the database keep agreeing. These events keep
  their small number for good, outside the new range.
- **User's answer: B.**

**Question 2 — the `is_qbo` checkbox (a person ticks it on the Billing tab to say "entered in
QuickBooks")**

- **Option A — only `qbo_invoice_id` protects an event.** An event with `is_qbo = true` and no linked
  invoice is renumbered. QuickBooks may hold a hand-typed invoice under the old number; it is no longer
  found by number.
- **Option B — `qbo_invoice_id` or `is_qbo = true` protects an event.** More events keep their small
  number, possibly a large part of the 1364 numbered by spec 01.
- **User's answer: A.**

**Question 3 — the order in which rows take free numbers when a target is taken**

- **Option A — one by one from the smallest old number.** A number a previous row has just taken counts
  as taken. 300000001 held → old 1 gets …002, old 2 gets …003, old 3 gets …004. The order of the
  numbers is kept.
- **Option B — exact targets first.** Every row whose target is free gets old + 300000000; only rows
  with a clash get the next free number after that. 300000001 held → old 2 stays …002, old 3 stays
  …003, old 1 gets the first free number after them, …004. The order of old 1 and old 2 changes.
- **User's answer: A.**

**From the user's own words (not options):**

- The rows to renumber are the rows whose `invoice_number` has **four characters or fewer**; the new
  number is the old one plus **300000000**.
- When the new number is taken, the next one is checked (300000002), and if it is free the row gets it.
- The counter's range is **300000001 to 999999999**.
- A **new migration file** is made; the migration of spec 01 is not edited.

**Readings to confirm at review.**

1. **"Four characters or fewer" is a number from 1 to 9999.** 0 and numbers from 10000 up are not
   touched (the old random numbers have nine digits). The zeros that spec 02 adds when a number is shown
   are not stored, so they are not counted.
2. **Every row counts**, deleted events too (as in spec 01's backfill). "Taken" means held by any row
   of `Events`, deleted or not: the unique index covers all rows.
3. **The counter continues after the last number the migration gave**, and still skips a number a
   row already holds (rule 3 of spec 01). If the migration gave no number (an empty table, as in CI),
   the first number the counter gives is 300000001.
4. **The counter stops at 999999999 and does not wrap around.** If it were ever reached, creating an
   event would fail with a database error (about 700 million numbers away).
5. **A number brought by an insert is still kept as it is,** whatever its size (rule 1 of spec 01).
   The range binds the counter only. Nothing in the app sets a number.
6. **Skipped events leave holes.** An event kept by Question 1 keeps its small number, and the place
   its number + 300000000 would have taken stays empty (unless a clash has shifted the numbers around
   it, in which case the shift fills it); the counter never goes back to fill it.
7. **`supabase/seed.sql` moves to the new range.** Its numbering block ends with a `setval` that fails
   for a value below the new minimum, so without the change `supabase db reset` would stop. The block
   numbers the rows it numbers from 300000001 up (lowest free numbers, in order of `created_at`).
8. **The migration of spec 01 and the text of specs 01 and 02 are not rewritten;** each of the two gets
   a one-line pointer to this spec at the top.
9. **The migration prints two counts with `RAISE NOTICE`** (rows renumbered, rows left because of
   their linked invoice), so the deploy log can be checked against the dry run (§7).
10. **The sequence is altered, not recreated:** the trigger, the seed and the tests refer to it by name.
    The file name of the migration is mine; it carries no behaviour.

## 2. Research findings

- **Production.** `main` contains migration `20261103120000` (merged on 2026-11-06 with release 1.22.0)
  and `production.yaml` runs `supabase db push` on every push to `main`, so it should have run in
  production. **Not checked against the production database** (no access from here). Its backfill
  numbered 1364 rows at the time of writing; every event created since took the next number. The release
  notes of 1.22.0 (`versions/1.22.0.md`) say "Existing numbers did not change"; after this spec that
  sentence is out of date.
- **The local database** (the seed, read only, 2026-11-06): 1473 events; 1347 numbered 1 to 1347; 126
  with a random nine-digit number (103554399 to 995413431); none between five and eight digits; no 0;
  the counter stands at 1347; 3 events have `qbo_invoice_id`, 8 have `is_qbo`.
- **A plain `UPDATE` of a set number is undone silently.** Tried in a rolled-back transaction:
  `UPDATE "Events" SET invoice_number = 300000001 WHERE invoice_number = 1` answers `UPDATE 1` and the row
  still holds 1. The trigger `events_keep_invoice_number` (spec 01, step 4) writes the old value back.
  So the migration must switch the user triggers of `Events` off while it renumbers, as the backfill of
  spec 01 does. That also keeps the other triggers away: quote hashes (`recompute_quote_hashes_events`),
  collections tasks (`ar_sync_tasks_on_events`), signatures, statuses.
- **`ALTER SEQUENCE … MINVALUE 300000001` alone fails** ("START value (1) cannot be less than
  MINVALUE"). Tried in a rolled-back transaction: `MINVALUE 300000001 MAXVALUE 999999999 START WITH
300000001 RESTART WITH 300000001` in one statement works. `setval` below the minimum fails as well.
- **The user's rule is a loop.** Taking the rows from the smallest old number and giving each the first
  number from old + 300000000 upward that no row holds is exactly Question 3, Option A: the rows already
  renumbered hold their new numbers, so they count as taken. Postgres checks the unique index row by row,
  and each new number is checked against the table at the moment it is given, so the index cannot be
  violated. A new number is at least 300000001, so it never equals a small number that stays.
- **The loop cannot pass 999999999.** At most 9999 rows are renumbered and each skips only numbers held by
  other rows, so the largest number given is at most 300009999 plus the number of rows in `Events`.
  Reaching 999999999 would need about 700 million rows; no guard is written.
- **What a changed number touches outside the database.**
  - _QuickBooks._ `DocNumber` is the plain number (`buildInvoicePayload.ts:137`, `createInvoice.ts:267`).
    `compareInvoice.ts:67` reports a difference of "Invoice number". Update invoice on a linked invoice
    writes the whole payload including the number (`updateInvoice.ts:128-142`); the refusal at
    `updateInvoice.ts:311` belongs to the overwrite-by-number case. Create invoice looks for an existing
    invoice by number before creating one (spec 04). This is why Question 1 asked about linked events;
    for them nothing in QuickBooks changes.
  - _Display._ `formatInvoiceNumber` pads to nine digits; a number from 300000001 up already has nine
    digits, so the helper adds nothing and stays as it is (the skipped events still need it). List
    search compares with the printed number as text, so typing `43` still finds `300000043`.
  - _Files and documents._ The quote PDF, the e-mail, the Stripe checkout label
    (`create-checkout/route.ts:59-60`; a label only, nothing is looked up by number) show the new number
    from now on. Documents already made or sent (PDFs, e-mails, files named `{number}.pdf`, Stripe
    sessions already open) keep the old number.
  - _Links._ Public links use the event's uuid (`/quote/[eventUUID]`, `buildPublicQuoteUrl`), and the
    freshness poll calls `/api/quotes/${eventId}/version` with the uuid (`quoteVersion.ts:33`): no link
    or poll depends on the number.
- **PowerSync.** `AppSchema.ts` keeps `invoice_number: column.integer`; 999999999 fits in 32 bits; no
  schema or sync-rule change. The changed rows reach every client once through replication. A client that
  was offline and later uploads a full row with the old number is corrected by `events_keep_invoice_number`:
  the stored number wins.
- **CI.** `ci-pr.yaml` runs `supabase db reset --no-seed`, so in CI the migration runs on an empty
  `Events` table: the loop does nothing and the counter must start at 300000001.
- **The seed.** After a local `supabase db reset` the numbering block at the end of `seed.sql` (spec 01 §3)
  runs after all migrations. It uses `generate_series(1, count(*))` for the free numbers and ends with a
  `setval` to the largest number it gave (never below the counter's value): both assume the old range.
- **The SQL test** `supabase/tests/events_invoice_number.test.sql` assumes the old range:
  `setval(…, 5000)` (line 86), the hand-made numbers 5001 and 5002 (lines 89, 97) and
  `invoice_number > 0` (line 66).

## 3. Database

One migration, `supabase/migrations/20261106120000_events_invoice_number_range.sql`, in this order, in
one explicit transaction (`BEGIN; … COMMIT;`, as in spec 01: the Supabase CLI sends a file as a batch,
`LOCK TABLE` needs a transaction block, and the block keeps the change all-or-nothing so the triggers of
`Events` can never be left switched off):

1. `Events` is locked against writes for the length of the migration (`SHARE ROW EXCLUSIVE`) and its user
   triggers are switched off (`DISABLE TRIGGER USER`).
2. **The renumbering.** The rows with `invoice_number` from 1 to 9999 and an empty `qbo_invoice_id` are
   taken from the smallest number to the largest (the order of Question 3, Option A). For each, the target
   is the old number + 300000000; while any row of `Events` holds the target, the target goes up by one;
   the row is given that number at once, so the next rows see it as taken.
3. **The counter.** One statement, `ALTER SEQUENCE events_invoice_number_seq MINVALUE 300000001 MAXVALUE
999999999 START WITH 300000001 RESTART WITH 300000001` (no cycle). Then, if the loop gave any number,
   the counter is set to the largest number it gave, so the next number is that plus one.
4. The user triggers of `Events` are switched on again.
5. The column comment of `Events.invoice_number` is replaced: "Unique invoice number from
   events_invoice_number_seq (300000001–999999999), given on insert and never changed; older events keep
   their number. Written with nine digits by the app."
6. `RAISE NOTICE` with the two counts (reading 9).

**Not changed:** the column type, the unique index `Events_invoice_number_key`, the two triggers and
their functions (`assign_invoice_number`, `keep_invoice_number`: the first keeps skipping held numbers,
the second still protects every stored number once the migration is over), RLS, `AppSchema.ts`,
`sync_rules.yaml`, `database.types.ts`.

**`supabase/seed.sql`** (reading 7): in the numbering block at the end, the free numbers are taken from
`generate_series(300000001, 300000000 + count(*))` instead of `generate_series(1, count(*))`, and its
comment names the new range. The `setval` stays (its value is now inside the new range).

## 4. App changes

None. `formatInvoiceNumber` and every place that shows or sends the number are unchanged (§2).
`permissionPageData.ts` is unchanged: no role gains or loses anything; the number is changed by a
migration, not by a person.

## 5. Behaviour scenarios

Playwright, written, **not run** (by instruction). The renumbering is a one-time data fix and cannot be
repeated from a screen, so the only scenario change is on the counter:

- **S1** (the existing S2 of `invoiceNumberAssign.admin.spec.ts`, tightened) an event inserted without a
  number gets one from 300000001 to 999999999 inclusive. Its S1 (the number on the page) and S3
  (consecutive numbers) stay as they are.

## 6. Files

**Counted — 2 files** (limit 10):

1. `supabase/migrations/20261106120000_events_invoice_number_range.sql` — new
2. `supabase/seed.sql` — changed (the numbering block at the end, §3)

**Not counted:** `supabase/tests/events_invoice_number.test.sql` (changed: new range, three more
assertions), `src/features/quotesAndBookings/e2e/invoiceNumberAssign.admin.spec.ts` (S2 tightened),
`docs/specs/invoice-number-01-assign-in-database.md` and `invoice-number-02-nine-digit-format.md` (one
pointer line each), this spec. **Not touched:** `package.json` (the script `test:db:invoicenumber`
already runs the test), `AppSchema.ts`, `sync_rules.yaml`, `database.types.ts`, `permissionPageData.ts`.
The release notes and the preflight list (`versions/`, `preflight/`) are written by `/changelog` and
`/preflight` when the pull request is made; the sentence "Existing numbers did not change" of 1.22.0 must
not be repeated there.

## 7. Tests and implementation sequence

Red first. SQL runs through the Supabase container inside `BEGIN … ROLLBACK` (no host `psql`). Prettier
only on touched files.

- **SQL test (the existing file, changed; red until the migration is applied):** the counter's
  minimum is 300000001 and its maximum 999999999 (two assertions); a new row gets a number of at least
  300000001; the "hand-made number" case moves to the new range (the counter set to 300005000, a row
  holding 300005001, the next insert gets 300005002); with the counter at its maximum an insert fails with
  `2200H` and nothing is left behind (one assertion, in a savepoint). The counter is put back at the end
  as before. 15 assertions become 18.
- **Dry run by hand** (the migration's steps 1 to 3 on a copy of the data, in a rollback; a scratch
  script, not a committed test: after the migration no row is left for the renumbering, and a test cannot
  run the file because it has its own `BEGIN` and `COMMIT`). Cases:
  1. rows 1…N with no clash: each becomes old + 300000000;
  2. an old random number holds 300000001: old 1 gets …002, old 2 gets …003, old 3 gets …004 (the order of
     the numbers is kept);
  3. an old random number holds a number inside the block: the rows around it are shifted by one in
     turn, nothing is given twice;
  4. an event with `qbo_invoice_id` keeps its small number and its place in the block stays empty;
  5. an event with `is_qbo = true` and no `qbo_invoice_id` is renumbered;
  6. 0, 10000, 99999999 and every nine-digit number stay as they are; deleted events are renumbered;
  7. `content_hash`, `contract_hash`, every `ContractSignatures` row, every `ArEventTasks` row (where the
     table exists) and every `event_status` are unchanged; the number of enabled user triggers of `Events`
     is the same before and after;
  8. the next insert gets the largest number given plus one; on an empty `Events` the next insert gets 300000001.
- **Seed:** `supabase db reset` runs clean; every numbered seed row without a random number is in the new
  range; the counter is at or above the largest of them.
- **Unit:** none (no TypeScript changes). **Gate:** `npm run tc`, `npx vitest run`, `prettier --check` on
  the touched files. E2E: SKIPPED (not run locally, by instruction).
- **Before production:** run the dry run on a copy of production data and read these counts on
  production first (read only): rows with a number from 1 to 9999; of them, rows with `qbo_invoice_id`;
  rows with a number from 10000 to 99999999; rows from 100000000 to 299999999; rows from 300000001 up. The
  count the migration reports as renumbered must equal "from 1 to 9999" minus "with `qbo_invoice_id`".

## 8. Edge cases and error handling

- **Offline / PowerSync.** Nothing changes for an event made offline: it is numbered when its upload
  reaches the database, now from 300000001 up. A client that was offline during the deploy shows the old
  numbers until it syncs; it cannot write them back (`events_keep_invoice_number`).
- **An old open browser tab** (earlier code) behaves as in spec 01 §8.
- **Clerk.** Not applicable: no route or role is involved.
- **A random old number inside the block** is skipped by the loop (step 2) and later by the counter (rule 3).
- **An event kept by Question 1** keeps showing nine digits through `formatInvoiceNumber`
  (`000000043`), as today; nothing else about it changes.
- **Two events inserted at the same instant** still get two different numbers.
- **The migration run twice** (it is not, the migration history prevents it): the second run would find
  no unlinked small number and give none, and would restart the counter at 300000001; rule 3 would then
  skip the numbers already held, one by one. Noted, not guarded.
- **A failed migration** changes nothing: one transaction, the triggers are not left off.

## 9. Risks

- **R1 — customers see a different number for the same event** (a consequence of renumbering every row;
  the user was asked about QuickBooks only). A quote sent earlier as `#000000043` is `#300000043` in the app
  and on every new PDF, e-mail and Stripe label; documents already made keep the old number.
- **R2 — a hand-typed QuickBooks invoice is no longer found by number** (Question 2, Option A): for an
  event with `is_qbo = true` and no link, Create invoice looks for an existing invoice under the new
  number, finds none, and can create a second invoice. Accepted by the user.
- **R3 — events kept by Question 1 stay outside the range for good,** and their places in the block
  stay empty (reading 6).
- **R4 — every client downloads the changed rows once** after the deploy (the same as R2 of spec 01).
- **R5 — the migration runs with the user triggers off** (the same as R1 of spec 01): no hash recompute,
  no collections-task sync; there is nothing for them to react to, since only `invoice_number` changes.
  Switched back on in the same transaction; the dry run counts them.
- **R6 — the 1.22.0 notes say numbers did not change;** the next notes must say they did.

## 10. Out of scope

- Renumbering the events kept by Question 1, or the numbers from 10000 up, or the old random numbers.
- Changing `formatInvoiceNumber`, QuickBooks code, PDFs, e-mails, or telling customers or accountants.
- Fixing QuickBooks invoices after a renumbering, or a screen for events whose number moved.
- A counter per QuickBooks company, or storing the number as text.
