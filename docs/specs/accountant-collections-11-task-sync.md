# Accountant Collections 11: tasks follow the debt on every change

Status: **Implemented 2026-11-02.** Approved by the user (written 2026-10-31); the eight readings
in §1 were implemented as written. Build order: **11** (after 01 to 10).

Deviations and findings (the approved function, triggers and schedule are unchanged):

- **The nightly command** was not named in §3.2. It is `SELECT * FROM public.ar_sync_all_event_tasks();`
  and the test pins it.
- **The two old migrations are deleted** (user, 2026-11-02: `20261028140000` and `20261028150000`
  never reached production). The new migration therefore has no `DROP` block and no
  `cron.unschedule`; reading 4, §3.2, §3.6 and §5 are amended to say so. The pgTAP file still
  asserts that the old functions, triggers and job do not exist.
- **The migration can run twice** end to end (`CREATE OR REPLACE`, `DROP ... IF EXISTS` before each
  `CREATE CONSTRAINT TRIGGER`), not only the job step.
- **The test settles the database first.** The old cron test gave every existing booked event a
  baseline task so the job would skip it. The new job also completes, so that trick no longer works:
  one run of `ar_sync_all_event_tasks()` before the probes settles whatever is in the database, and
  the probes' counts are exact. The spy case of spec 05 (the open-task guard) is gone with the guard.
- **The signed-event case is first in the file**, before any `SET CONSTRAINTS`, so it sees the mode
  the triggers were created in. With the migration mutated to `INITIALLY IMMEDIATE` it goes red on
  its own (no task expected, orphan task found), as §4 asks.
- **The "status change" in the broken-calculation case** is `unsigned_changes` to `booked`, the
  change that reaches the calculation. A change to `lost` does not call it, so that path is covered
  by the raising `BEFORE UPDATE` trigger on `ArEventTasks`, kept from spec 05.
- **Mutation checks.** Removing the `lost` branch, the completion branch, `ON CONFLICT` (a 23505
  error in the "open task of any date" cases), the exception block, the `WHEN` clause, the old-row
  handling, the nightly's Lost query, and `INITIALLY DEFERRED` each turn the matching tests red.
  Dropping `DELETE` from the installments trigger turns only the shape test red: the hash trigger
  rewrites `Events` after the delete, and the `Events` trigger completes the task on its own.
- **Hash writes (§6) measured, no exclusion needed.** A 30-line save on a booked event with a
  schedule calls the rule 31 times at commit, about 5 ms on top of a write of about 27 ms. The same
  save on a draft event also queues 32 calls but each leaves at the status test.
- **The concurrency script** snapshots `ArEventTasks` and restores it in its cleanup (the nightly
  function completes as well as creates, so the old "baseline task" trick would not protect real
  rows). It asserts no session error, at most one open task on the two events being paid, exactly
  one on the unpaid one. It needs the migration committed to the database and has **not been run**
  at build (the pgTAP file ran in a rollback only). Run it once the migration is applied locally:
  `./supabase/tests/ar_task_sync.concurrency.sh`.

Amends [04](accountant-collections-04-cron.md) and
[05](accountant-collections-05-completion-triggers.md): the function, the triggers and the job
they built are replaced by this spec's. Needs: [01](accountant-collections-01-backend.md),
[02](accountant-collections-02-sql-amount-due.md). Needed by: nothing else. Branch:
`q4-sprint2-collections`.

## 0. The feature in brief (the same in all specs of the series)

This spec is the eleventh of a series. Each is built in its own chat, so this section is
repeated in every spec. In this copy decisions 4 and 5 carry their **amended** wording; the
copies in specs 01 to 10 keep the old one, and this one wins.

**The series** (`docs/specs/`, in build order):

- **01** `accountant-collections-01-backend.md`: table `ArEventTasks`, RLS, sync rules,
  `AppSchema.ts`.
- **02** `accountant-collections-02-sql-amount-due.md`: the Postgres port of the Amount Due
  calculation.
- **03** `accountant-collections-03-ts-twin-and-parity.md`: the TypeScript twin and the shared
  tests that keep both equal.
- **04** `accountant-collections-04-cron.md`: the daily pg_cron job that creates tasks.
- **05** `accountant-collections-05-completion-triggers.md`: triggers that complete tasks
  (payment, Lost).
- **06** `accountant-collections-06-done-next-task.md`: the client write that completes the open
  task and creates the next one.
- **07** `accountant-collections-07-collections-list.md`: the Collections list (rows, filter,
  sort, URL state, date wording).
- **08** `accountant-collections-08-invoice-data.md`: the data of the invoice page and its five
  statuses.
- **09** `accountant-collections-09-design.md`: all screens, page access and the permissions
  matrix.
- **10** `accountant-collections-10-prev-next.md`: Previous Task and Next Task.
- **11** `accountant-collections-11-task-sync.md`: one function keeps the tasks in step with the
  debt, run by triggers and by the nightly job (this spec).

**Who.** Accountant, and Admin. Not Account Manager, Developer, Viewer, Maintainer or Driver.

**What.** Accountants chase overdue payments. The app lists the bookings whose payment is
overdue, each with one open task ("call the customer", "send an email"). The accountant does
that work outside the app, comes back, and either records the payment (the tasks then close by
themselves) or writes the next task with a new date. Pages: `/accountant?tab=collections` (a new
first tab on the Accountant page, opened by default) and
`/accountant/invoice?id=<event uuid>&tab=info|tasks` (new).

**The table `ArEventTasks`:** `id` (random uuid), `created_at`, `due_date` (date, not null),
`completed` (boolean, default false), `note` (text, not null, not empty), `event_uuid`. A task is
**open** while `completed = false`. An event has at most one open task.

**Where the work is.** Branch `q4-sprint2-collections`. Design: `docs/design/accountant-collections/`
(canvas source) and the author's sketch `docs/Untitled-2026-05-28-2029.excalidraw` (untracked).
Stack and rules: `CLAUDE.md`, `docs/POWERSYNC_ARCHITECTURE.md`.

**Decisions taken by the user (they hold for the whole series):**

1. **Eligible events:** status `booked`, not deleted, any start date. No other status gets tasks.
2. **Overdue.** A payment is overdue when its due date is today or earlier. Amount Due is the
   existing `computeAmountDue` rule: the unpaid part of each overdue installment, payments aimed
   at an installment stay on it, a refund un-fills the newest installment first, capped at the
   remaining balance. It is not the simpler "due minus received".
3. **Event with no payment schedule.** Its whole balance falls due 7 days before `event_start`.
   An event booked inside those 7 days is overdue at once. Days overdue count from 7 days before
   `event_start`; for an event booked inside those 7 days, from `booked_at`. This rule is only for
   Collections; the AR tabs and the public Pay tab keep their own.
4. **Creation (amended by this spec).** One SQL function decides when an event gets a task. It
   runs (a) at once, whenever a change to a payment, the payment schedule, the price or tax, or
   the event itself leaves an eligible event with Amount Due above 0 and no open task, and (b)
   every day at 05:20 UTC (00:20 or 01:20 in Toronto) for every event, because a due date
   arriving changes no row. "Today" is Toronto's date. The task: note
   `Remind the customer about payment`, due today. Running the function twice adds nothing.
5. **Completion by the system (amended by this spec).** The same function completes an event's
   open tasks when its Amount Due is 0, after the same changes and in the same nightly run
   (manual payments and Stripe alike). An event that is Lost has its open tasks completed. An
   event that stops being `booked` in any other way, or is deleted, keeps its open tasks; they
   are only hidden.
6. **Done / Next Task** is one action: the event's open task is completed (even if its date has
   not come) and a new open task is created with the date and note typed in the modal. The modal
   opens with today + 2 days and the note `Follow-up needed`. The calendar offers today and later.
   After Save the accountant stays on the same page.
7. **Safety.** A partial unique index allows one open task per event; `note` must not be blank
   after trimming; `event_uuid` is a foreign key to `Events` with cascade; nobody can DELETE.
   "Due date is today or later" is checked in the interface only, never in the database.
8. **Collections list:** the open tasks of eligible events. Show Not Due Yet (off by default) adds
   tasks dated in the future. Columns: Name (event name), Next Follow Up, Payment Overdue, Task
   Notes, Amount Overdue. Default order: Next Follow Up, oldest first. Equal values follow a
   fixed chain (spec 07).
9. **Statuses** (header of the invoice page): Paid (green), Schedule (purple), Collections (red),
   Cancelled (grey), Not active yet (grey).
10. **Invoice page:** tabs Information and Tasks. Record Payment, and Edit and Delete of manual
    payments, reuse the Billing tab's dialogs. There is no Send Email button in this feature. An
    event with no open task still opens; Tasks then says "No open task".
11. **Previous / Next Task** follow the list's order; the neighbours are fixed when the invoice
    page opens.
12. **Out of scope for the series:** Send Email, assigning a task to another accountant, the PO
    number, search, filters and paging on the Collections tab, a Paid or Cancelled list.

## 1. What this spec decides

**From the user's own words (not options):**

- "Every time an invoice becomes overdue, a task is created for it automatically in
  `ArEventTasks`. Not only once a day at night, but also when an amount changes and a debt
  appears."
- **The rule lives in one place.** The user asked whether the logic can sit in one place so a
  change does not mean reworking many places. Built in: one SQL function holds the whole rule;
  the nightly job and every trigger only call it.
- **Nothing to wire in application code.** The user asked what happens if they later add logic
  that changes the price and forget to hook the function in, so an invoice turns overdue with no
  task. Built in: the triggers sit on the tables, not in the code that writes, so every writer
  (PowerSync upload, Stripe webhook, server routes, plain SQL) fires them, and a new column on a
  watched table needs nothing. Only a new **table** read by the calculation needs a trigger; a
  CI test fails until it exists (§3.5), and the nightly run is the net behind it.
- The nightly job stays: when a due date arrives no row changes, so no trigger can see it.

**Decisions taken by the user** (each was asked with neutral options):

**D1. Which changes create a task at once?** (several could be chosen)

- **Payments (`PaymentHistory`):** a refund, a lower amount, a soft delete raise the debt.
- **Payment schedule (`PaymentInstallments`):** a date moved earlier, a percentage raised, an
  installment added or removed. A save writes in several separate requests, so a trigger also
  sees half-saved states. For a signed event such an edit moves it to Unsigned Changes in the same
  transaction, so no task is created at that moment.
- **Price and tax (`EventLineItems`, the tax columns of `Events`):** the same remark about
  signed events.
- **The event itself (`Events`):** back to `booked` (the client signs Unsigned Changes, Lost
  reopened, a manual change), restored from `deleted`, `event_start` moved (events with no
  schedule). This is the moment the debt of a signed event shows up after a price edit.
- **User's answer: all four.**

**D2. Should the same changes also complete the open task when Amount Due becomes 0?** (asked
because spec 05 left schedule and price edits out)

- **Create only:** completion stays as in spec 05 (payment, Lost). A schedule or price edit that
  removes the debt leaves the task open.
- **Create and complete:** the same sources also complete. It changes the approved behaviour of
  spec 05 and widens this spec to both directions.
- **User's answer: create and complete.**

**D3. How is the single function started?**

- **Triggers plus the nightly job:** triggers react at once; the nightly job runs the same
  function for every event as a safety net. A forgotten table is caught by a CI test; if it
  slipped through, the task appears at the next 05:20.
- **No triggers, a job every minute:** nothing on the tables, nothing to forget, a delay of up to
  a minute. It is a check, not a trigger.
- **Triggers plus a job every minute:** instant for known tables, up to a minute for a forgotten
  one; two ways of starting the same function.
- **User's answer: triggers plus the nightly job.**

**D4. Are office currency changes watched?** (`SalesOffices`, `QboConnections` and `Addresses`
decide which payments count; a change moves the debt of every event of that office.)

- **Not watched:** the nightly run picks it up; the three tables are listed in the CI test as
  exceptions, with this reason.
- **Watched:** triggers on the three tables re-check every event of the office. `Addresses` is
  shared with venues and contacts, so its trigger would run on every address edit.
- **User's answer: not watched.**

**Readings to confirm at review:**

1. **The same task as the nightly job:** note `Remind the customer about payment`, due today
   (Toronto's date at the moment of the change). No author is written: the table has no column.
2. **A state, not a transition.** The function looks at the state after the change: Amount Due
   above 0 and no open task creates; 0 and an open task completes. It does not compare before
   and after. So an overdue event with no open task gets its task on any change of a watched
   table, even one that left the amount alone. It is never a wrong task: the nightly run would
   create the same one.
3. **Lost is a state too.** Any change to a Lost event completes its open tasks, not only the
   change into Lost (spec 05 acted on the change itself).
4. **Specs 04 and 05 are replaced** (the user's "one place"): `create_ar_collection_tasks()`,
   `complete_ar_tasks_when_paid()`, `complete_ar_tasks_when_lost()`, their two triggers and the
   job `create-ar-collection-tasks` are not kept; the nightly job is renamed
   `sync-ar-collection-tasks`. Their tests move into this spec's test file. **Amended 2026-11-02
   (user):** the two migrations that made them (`20261028140000`, `20261028150000`) never reached
   production, so they are deleted and this spec's migration is the only one. It drops nothing.
5. **The nightly run now also completes.** It completes the open tasks of every booked event
   whose Amount Due is 0 and of every Lost event. The first night after the deploy this also
   closes any task a schedule or price edit left open earlier (the case spec 05 §6 accepted),
   including one an accountant dated in the future.
6. **Half-saved schedules.** A request of a multi-request save can see a half-saved state and
   create a task the final schedule does not justify. The last request of the same save runs the
   same check; if the final Amount Due is 0 it completes that task. So such a task can show on
   the list for a moment and disappear; it does not stay. If the final state still owes, the task
   is right.
7. **The Done / Next Task window.** The accountant's two requests (complete the old task, insert
   the new) can be split by a trigger run: it inserts the system's task, the accountant's insert
   is refused (23505) with the toast of spec 04 §6, and their note is lost. Milliseconds, and a
   little likelier than with the nightly job alone, because triggers run on activity.
8. **No write is ever blocked by this.** The trigger function catches every error and raises a
   WARNING; the tasks stay as they were. The triggers run at commit, where an uncaught error
   would undo the user's whole save, so the catch is required (spec 05 §3 had the same block).

## 2. Research findings

- **What Amount Due reads** (the `ar_*` functions of
  `supabase/migrations/20261028130000_ar_amount_due.sql`): `Events` (`tax_percent`,
  `tax_amount_cents`, `event_start`, `sales_office_uuid`, `event_status`, `deleted`),
  `EventLineItems`, `PaymentInstallments`, `PaymentHistory`, and, for the currency,
  `SalesOffices`, `QboConnections`, `Addresses`.
- **What this replaces:** `create_ar_collection_tasks()` and the job
  `create-ar-collection-tasks` (`20261028140000_ar_collection_tasks_cron.sql`);
  `complete_ar_tasks_when_paid()`, `complete_ar_tasks_when_lost()` and their two triggers
  (`20261028150000_ar_task_completion_triggers.sql`). Spec 05's open-task guard existed to spare
  the calculation; here the calculation always runs for a booked event, because both directions
  need it. Draft, quoted and other events leave at the status test, so most edits cost nothing.
- **Triggers already on the same tables.** `recompute_quote_hashes_events`,
  `recompute_quote_hashes_line_items`, `recompute_quote_hashes_installments`
  (`20260804120000`) rewrite `content_hash` and `contract_hash` on `Events` after every change.
  `invalidate_signature_on_contract_change` (`20260812120000`, extended in `20261018150000`) then
  moves a signed `booked` event to `unsigned_changes` **in the same transaction**. A normal
  `AFTER` trigger of ours would run in trigger-name order and might see `booked` before that
  move, create a task, and leave it orphaned and hidden. A deferred trigger runs at commit and
  sees the final status.
- **How writes arrive.** The web app uploads each local change as its own PostgREST request, so
  each is its own transaction (spec 01 §2). `syncPaymentInstallments`
  (`src/features/quotesAndBookings/db/paymentInstallments.ts`) saves a schedule as deletes, then
  updates one by one, then inserts one by one. The Stripe webhook inserts as the service role.
- **Verified on the local database (2026-10-31, rolled back):** a
  `CREATE CONSTRAINT TRIGGER ... AFTER ... DEFERRABLE INITIALLY DEFERRED ... FOR EACH ROW` with a
  `WHEN (to_jsonb(OLD) IS DISTINCT FROM to_jsonb(NEW))` clause and a string argument (`TG_ARGV`)
  fires nothing until `SET CONSTRAINTS ALL IMMEDIATE` or commit; then it reads the row's final
  state; a no-op update is skipped; the `to_jsonb` comparison works on a table with a `json`
  column, where `OLD.* IS DISTINCT FROM NEW.*` would not. A constraint trigger must be
  `FOR EACH ROW`.
- **The cost to expect.** The nightly run of spec 04 measured about 60 ms for 688 booked events,
  so one calculation is roughly 0.1 ms. A deferred row trigger runs once per changed row at
  commit: a quote save with 30 line items calls the function 30 times for one event, about 3 ms.
- **Test pattern:** `supabase/tests/ar_collection_tasks_cron.test.sql` and
  `ar_task_completion_triggers.test.sql` (fixtures, a spy replacing `ar_event_amount_due`, a
  temporary raising function), run through docker `psql` in a rollback.

## 3. The design

`supabase/migrations/20261031120000_ar_task_sync.sql`, one transaction.

### 3.1 The function: the whole rule

**`public.ar_sync_event_tasks(p_event uuid, p_today date) RETURNS text`**, `SECURITY DEFINER`,
`SET search_path = public`. It returns `'created'`, `'completed'` or `'none'`. It does not catch
errors (the callers decide).

1. The event does not exist: `'none'`.
2. Status `lost`: complete every open task of the event (`completed = true WHERE completed =
false`); `'completed'` if a row changed, else `'none'`.
3. Status `booked` and not deleted: `due := public.ar_event_amount_due(p_event, p_today)`.
   - `due > 0`: `INSERT INTO "ArEventTasks" (due_date, note, event_uuid)` with `p_today`,
     `Remind the customer about payment` and the event, `ON CONFLICT (event_uuid) WHERE completed
= false DO NOTHING`; `'created'` if a row was inserted, else `'none'`.
   - `due = 0`: complete every open task; `'completed'` if a row changed, else `'none'`.
4. Any other status, or deleted: `'none'`. Open tasks are kept (hidden by the list).

### 3.2 The nightly job

**`public.ar_sync_all_event_tasks() RETURNS TABLE (created integer, completed integer)`**
(`SECURITY DEFINER`, same attributes). `today` is Toronto's date. It calls `ar_sync_event_tasks`
for every booked, non-deleted event and for every Lost event that has an open task, and counts
the results. Job: `cron.schedule('sync-ar-collection-tasks', '20 5 * * *', ...)`; a schedule with
a name replaces the job of that name, so the file can run twice.

### 3.3 The trigger function

**`public.ar_sync_tasks_trigger() RETURNS trigger`** (`SECURITY DEFINER`, same attributes).
`TG_ARGV[0]` names the column that holds the event id: `event_uuid` on three tables, `id` on
`Events`. It collects the distinct non-null ids from `NEW` (insert, update) and `OLD` (update,
delete), reads them with `to_jsonb(NEW) ->> TG_ARGV[0]`, takes `today` as Toronto's date and calls
`ar_sync_event_tasks` for each. The whole body sits in `BEGIN ... EXCEPTION WHEN OTHERS THEN RAISE
WARNING '...'; END`. It returns `NULL`.

### 3.4 The four triggers

All are `CREATE CONSTRAINT TRIGGER ... AFTER ... DEFERRABLE INITIALLY DEFERRED ... FOR EACH ROW
EXECUTE FUNCTION public.ar_sync_tasks_trigger('<column>')`, **on the whole table with no column
list**, so a new column on a watched table is covered without touching them.

- `ar_sync_tasks_on_payment_history`: `INSERT OR UPDATE OR DELETE ON "PaymentHistory"`, `'event_uuid'`.
- `ar_sync_tasks_on_payment_installments`: the same on `"PaymentInstallments"`, `'event_uuid'`.
- `ar_sync_tasks_on_event_line_items`: the same on `"EventLineItems"`, `'event_uuid'`.
- `ar_sync_tasks_on_events`: `UPDATE ON "Events"` with `WHEN (to_jsonb(OLD) IS DISTINCT FROM
to_jsonb(NEW))`, `'id'`. A hard delete of an event cascades its tasks away; an insert has no
  line items or payments yet, and their own triggers follow.

`REVOKE ALL ON FUNCTION` (the three functions) `FROM PUBLIC, anon, authenticated`. The triggers
run as the table owner's function, so the signed-in user's role does not matter; the service role
and the owner bypass RLS.

### 3.5 The guard against a forgotten table

A pgTAP test (in `ar_task_sync.test.sql`) reads the definition of every `public.ar_*` function
except `ar_sync_*`, takes every quoted identifier in them that is a table of schema `public`, and
asserts that each such table has a trigger bound to `ar_sync_tasks_trigger` (a deferred constraint
trigger), **or** is in a short exceptions list inside the test: `SalesOffices`, `QboConnections`,
`Addresses`, with the reason "office currency, covered by the nightly run (spec 11 D4)". It also
asserts that every exception is still read by some function, so the list cannot go stale. The
failure message names the table. The migration header says the same in words: a helper the
calculation uses must be named `ar_*`; a new table it reads needs one `CREATE CONSTRAINT TRIGGER`
line, and this test stays red until it exists or the table is listed with a reason.

### 3.6 What the migration removes

Nothing. Amended 2026-11-02 (user): the two migrations of specs 04 and 05 never reached
production and are deleted, so there is no `complete_ar_tasks_when_paid()`,
`complete_ar_tasks_when_lost()`, `create_ar_collection_tasks()`, trigger or job
`create-ar-collection-tasks` to drop on a database built from the repository. A local database
made before the deletion still holds them and needs `supabase db reset`. The test still asserts
that none of them exists.

### 3.7 A walk-through

A refund of $200 is recorded on a booked event that was paid in full and whose last installment
is already due. (1) The app uploads a `PaymentHistory` row of -20000. (2) At commit the trigger
calls `ar_sync_event_tasks(event, Toronto's date)`. (3) The refund un-fills the newest
installment, which is due, so Amount Due is 20000; the event has no open task, so the function
inserts one. (4) PowerSync delivers it and the event appears on Collections with Next Follow Up
today. If the accountant had recorded the $200 back an hour later, the same path would find
Amount Due 0 and complete the task.

## 4. Tests

Red first. `supabase/tests/ar_task_sync.test.sql`, script `test:db:artasksync` (it replaces
`test:db:arcollectiontaskscron` and `test:db:artaskcompletion` in `package.json` and in
`test:db:all`), rolled back. The two old test files move into it, with their cases kept and
pointed at the new function. pgTAP runs in one transaction, so a deferred trigger fires only at
`SET CONSTRAINTS ALL IMMEDIATE`: each assertion runs it first, and the signature case keeps the
constraints deferred until after the edit.

- **The function.** Creates for a booked, overdue event with no task: returns `'created'`, one
  task with the note, `completed = false`, `due_date` = Toronto's date. Skips: Amount Due 0,
  statuses `quoted`, `draft`, `unsigned_changes`, a deleted event, an open task of any kind and
  date. Completes: an open task with Amount Due 0 (`'completed'`); every open task of a Lost
  event; `lost` to `booked` un-completes nothing; the other statuses and `deleted` keep the task.
  Creates again after completion. A second call returns `'none'`. A missing event returns
  `'none'`. `anon` and `authenticated` cannot execute it (42501).
- **Each source, both directions** (a task appears when the change leaves a debt, closes when it
  removes it):
  - `PaymentHistory`: a refund insert, a lower amount, a soft delete; a covering payment; a
    service-role (Stripe-like) insert; an accountant's and an admin's insert; a payment moved to
    another event checks both.
  - `PaymentInstallments`: a date moved earlier, a percentage raised, an installment added; a
    date moved later, an installment removed (`DELETE`).
  - `EventLineItems`: a line added or raised so the paid part no longer covers it; a line lowered
    or soft-deleted.
  - `Events`: `unsigned_changes` to `booked` with a debt; `lost` to `booked` with a debt;
    `deleted` back to false; `event_start` moved inside 7 days on an event with no schedule; a
    tax change that creates or removes a debt; to `lost` completes; `booked` to
    `unsigned_changes` and `deleted = true` keep the task. A no-op update does nothing.
- **A signed event.** With an active contract signature, a price edit moves the event to
  `unsigned_changes` in the same transaction and **no task is created**; after the signature the
  event is `booked` again and, if it owes, the task is created. Mutation: make the triggers
  `INITIALLY IMMEDIATE`; this case must go red.
- **Several changes in one transaction** give one task (a quote save with several lines).
- **A half-saved schedule.** In separate transactions: the first update creates a task, the last
  one (final Amount Due 0) completes it; if the final state owes, the task stays.
- **Nothing blocks a write.** Replace `ar_event_amount_due` with a function that raises: the
  payment insert, the schedule save and the status change all commit, a warning is raised, the
  tasks are unchanged.
- **The nightly job.** `ar_sync_all_event_tasks()` creates for overdue booked events and returns
  the counts; completes the stale task of a booked event with Amount Due 0 and of a Lost event;
  skips events with nothing to do; a second run returns 0 and 0. `cron.job` holds
  `sync-ar-collection-tasks` at `20 5 * * *` with the expected command, and no
  `create-ar-collection-tasks`. `anon` and `authenticated` cannot execute it.
- **The guard** (§3.5): green now; red when a trigger is dropped; red when a temporary `ar_*`
  function reads a new table; green again once that table is listed with a reason; red when an
  exception is no longer read.
- **Shape:** the four triggers exist, are constraint triggers, deferrable and initially
  deferred, `FOR EACH ROW`, bound to `ar_sync_tasks_trigger`; the three functions are
  `SECURITY DEFINER` with a pinned `search_path` and `EXECUTE` revoked; the old functions,
  triggers and job are gone.
- **Concurrency script** `ar_task_sync.concurrency.sh` (the renamed script of spec 04): two
  sessions run the nightly function at the same moment while a third writes payments; every event
  ends with at most one open task and no session errors. It writes committed rows and is not run
  by CI.
- **Mutation checks:** remove the `lost` branch, the completion branch, `ON CONFLICT`, the
  exception block, in turn; the matching tests go red.
- **Gate:** `npm run tc`, `npx vitest run`, `prettier --check` on touched files. E2E: SKIPPED (no
  UI; the screens read tasks through PowerSync as before). No TypeScript changes.

## 5. Files

**Counted: 1 file** (limit 10): `supabase/migrations/20261031120000_ar_task_sync.sql` (new).

**Not counted:** `supabase/tests/ar_task_sync.test.sql` (new), `ar_task_sync.concurrency.sh`
(renamed from `ar_collection_tasks_cron.concurrency.sh`), `package.json` (scripts), the two old
test files (deleted), the two old migrations `20261028140000_ar_collection_tasks_cron.sql` and
`20261028150000_ar_task_completion_triggers.sql` (deleted, see §3.6), and a one-line "amended by
spec 11" note at the top of specs 04 and 05. No
`AppSchema.ts`, `database.types.ts`, sync rules or UI. The permissions matrix is not touched: the
triggers are system behaviour and give no role a new ability.

**Deploy:** the migration only. Tasks already reach the devices through the existing sync rules.

## 6. Edge cases and error handling

- **A failing trigger** writes a WARNING and changes nothing (reading 8). **A failing nightly
  run** is visible in `cron.job_run_details`; nothing alerts anyone, as in spec 04.
- **Hash writes.** `recompute_quote_hashes_*` rewrite two columns of `Events` after every quote
  change, and `ar_sync_tasks_on_events` sees them as changes: one calculation per such write for a
  booked event. Measure at build. If it matters, exclude those two columns in the `WHEN`; that is
  the only exception to "all columns" and needs the user's word first.
- **Offline.** A change made offline uploads later and the trigger runs then; the new task
  reaches other devices with their next sync, and an offline device keeps showing what it had.
- **Not watched, by design:** `SalesOffices`, `QboConnections`, `Addresses` (D4), and
  `ContractSignatures` (a signature change reaches `Events.event_status`, which is watched).
  The date turning is the nightly run's job.
- **A missed night.** The next run decides; there is no catch-up.
- **The first night after the deploy** completes stale tasks (reading 5) and creates tasks for
  every overdue event that has none, as spec 04 §1 already said.
- **Stale tasks after an edit** that spec 05 §6 accepted are now closed by the edit itself.

## 7. Out of scope

- Watching the office currency tables; per-event notifications; un-completing a task.
- Any change to the Collections or invoice screens, the TypeScript twin or the sync rules.
- A trigger for a table that does not read into the calculation yet: written when it appears,
  and the guard says so.
