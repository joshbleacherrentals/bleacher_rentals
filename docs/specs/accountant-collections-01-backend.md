# Accountant Collections 01: the table `ArEventTasks`, access and sync

Status: **Implemented 2026-10-29** (approved by the user; written 2026-10-28). No deviation from
the approved types, schema or contracts. Two notes: `database.types.ts` was edited by hand for
the `ArEventTasks` block only (the local database has not applied the migration, so `npm run gtl`
would have dropped the table); the sync rules are changed in `../br_powersync` but **not yet
deployed**. The readings to confirm in §1 were implemented as written. Build order: **01** (first). Needs: nothing. Needed by: every other spec of
the series. Branch: `q4-sprint2-collections`.

## 0. The feature in brief (the same in all ten specs)

This spec is one of a series of ten. Each is built in its own chat, so this section is
repeated in every spec.

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
4. **Creation.** pg_cron, every day at 05:20 UTC (00:20 or 01:20 in Toronto); "today" is Toronto's
   date. For each eligible event with Amount Due > 0 and no open task it adds one task: note
   `Remind the customer about payment`, due today. It runs whether or not anyone opens the app, and
   running it twice adds nothing.
5. **Completion by the system.** After any change to a payment row, if the event's Amount Due is
   0, every open task of that event is completed (manual payments and Stripe alike). An event that
   becomes Lost has its open tasks completed. An event that stops being `booked` in any other way,
   or is deleted, keeps its open tasks; they are only hidden. If Amount Due later rises again,
   nothing is created at that moment; the next 05:20 run creates the task.
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

- The table and its columns are exactly those in §0. No other column is added.
- `note`: not null and not an empty string. Whitespace-only counts as empty (user's answer:
  "not empty after btrim").
- `event_uuid`: foreign key to `Events(id)` with `ON DELETE CASCADE` (user's answer).
- A partial unique index allows one open task per event (user's answer).
- `due_date` is "today or later" **in the interface only**; the database accepts any date
  (user's answer). No trigger, no CHECK.
- Nobody deletes a task. A task that "disappears" is completed (spec 05); there is no DELETE
  policy.
- Admin and Accountant use the table; nobody else sees a row.

**Why each constraint exists** (the user asked for the reason before any constraint is added):

- **Partial unique index `(event_uuid) WHERE completed = false`.** The cron (spec 04), an
  accountant, or two accountants can act on the same event at the same moment. Without the index
  both succeed and the event ends up with two open tasks, which breaks "one open task per event"
  that the list, the invoice page and Previous / Next rely on. With it the second writer is
  refused. The cron uses `ON CONFLICT DO NOTHING`, so it is never refused; an accountant's
  refused write is discarded by the web upload queue with a toast (see §2).
- **`CHECK (btrim(note) <> '')`.** The user's rule "not an empty string". The interface trims
  and refuses a blank note first, so the check is only the last lock.
- **Foreign key with cascade.** An orphan task would point at an event that no longer exists.
  Soft delete (`Events.deleted`) does not touch tasks; only a physical delete cascades.
- **Index `(event_uuid)`.** Not a constraint. It serves the foreign key's cascade and the
  "all tasks of one event" read (the completed list on the Tasks tab). The unique index covers
  only open rows, so it cannot serve those.

**Readings to confirm at review:**

- Admin has the same access as the accountant: select, insert, update. (The request says the
  pages are "also available to Admin".)
- Updates are not restricted by column: a signed-in accountant could change `note` or `due_date`
  of a task, not only `completed`. The request lists no such restriction and the interface
  never does it.

## 2. Research findings

- **Roles in policies:** `public.get_user_roles()` returns a `text[]`; policies test
  `public.get_user_roles() && '{admin,accountant}'::text[]`, for example `payment_history_insert`
  in `20261004170000_accountant_writes_payments.sql`.
- **The `powersync` publication is `FOR ALL TABLES`.** Nothing is added to it. Default
  privileges already grant `powersync_role` SELECT and the Supabase roles their usual access, so
  the migration has no `GRANT`.
- **Sync rules live in another repository:** `../br_powersync/config/sync_rules.yaml`, stream
  `web`. Accountant queries join `"Accountants"` (`is_active = true`) to `"Users"`; admin queries
  join `"Users"` with `"is_admin" = true`; both exclude inactive users with
  `status_uuid != '7b65d5a1-8ee0-4b7a-816d-d3ec1ed123c5'`. The same table may appear in several
  queries of the stream (`PaymentHistory` appears four times).
- **How the web app uploads** (`src/lib/powersync/BackendConnector.ts`): each local change is sent
  to PostgREST in order. A `PUT` is an upsert, so a table needs SELECT, INSERT and UPDATE
  policies. Any class 23 error (UNIQUE, FOREIGN KEY, NOT NULL, CHECK) or 42501 (RLS) discards the
  rest of the transaction and shows a toast. That is why the unique index must stay a backstop,
  not the normal path.
- **Local types:** booleans are integers (`0/1`), dates and timestamps are text
  (`docs/POWERSYNC_ARCHITECTURE.md`).
- **`database.types.ts`:** `npm run gtl` rewrites the file from the local database, which can lag
  the repo's migrations. Bring the local database up to date first, or edit only the new table's
  block by hand and check the diff touches nothing else.
- **No registry to update:** `src/lib/zustandRegistery.ts` no longer exists.
- **Test pattern:** `supabase/tests/accountant_receivables.test.sql` (fixtures for every role,
  `test_rows_affected`, an inactive accountant, rollback at the end).

## 3. The migration

`supabase/migrations/20261028120000_ar_event_tasks.sql`:

```sql
CREATE TABLE public."ArEventTasks" (
  id         uuid        NOT NULL DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  due_date   date        NOT NULL,
  completed  boolean     NOT NULL DEFAULT false,
  note       text        NOT NULL,
  event_uuid uuid        NOT NULL,
  CONSTRAINT ar_event_tasks_pkey PRIMARY KEY (id),
  CONSTRAINT ar_event_tasks_note_not_blank CHECK (btrim(note) <> ''),
  CONSTRAINT ar_event_tasks_event_fkey
    FOREIGN KEY (event_uuid) REFERENCES public."Events" (id) ON DELETE CASCADE
);

CREATE UNIQUE INDEX ar_event_tasks_one_open_per_event
  ON public."ArEventTasks" (event_uuid) WHERE completed = false;
CREATE INDEX ar_event_tasks_event_idx ON public."ArEventTasks" (event_uuid);

ALTER TABLE public."ArEventTasks" ENABLE ROW LEVEL SECURITY;

CREATE POLICY ar_event_tasks_select ON public."ArEventTasks" FOR SELECT TO authenticated
  USING (public.get_user_roles() && '{admin,accountant}'::text[]);
CREATE POLICY ar_event_tasks_insert ON public."ArEventTasks" FOR INSERT TO authenticated
  WITH CHECK (public.get_user_roles() && '{admin,accountant}'::text[]);
CREATE POLICY ar_event_tasks_update ON public."ArEventTasks" FOR UPDATE TO authenticated
  USING (public.get_user_roles() && '{admin,accountant}'::text[])
  WITH CHECK (public.get_user_roles() && '{admin,accountant}'::text[]);
-- No DELETE policy: no signed-in user can hard delete a task.
```

A header comment names this spec, the deploy order (§5) and the points of §1. The service role
(cron, triggers, Stripe webhook) bypasses RLS.

## 4. PowerSync, types, tests

- **`src/lib/powersync/AppSchema.ts`:** add `ArEventTasksCols` (`created_at`, `due_date`, `note`,
  `event_uuid` as `column.text`; `completed` as `column.integer`), `satisfies
PowerSyncColsFor<"ArEventTasks">`, `new Table(..., { indexes: { event_uuid: ["event_uuid"] } })`,
  the entry in the schema's table list, and `export type ArEventTasksRecord =
PowerSyncDB["ArEventTasks"]`.
- **`database.types.ts`:** the `ArEventTasks` Row / Insert / Update / Relationships block
  (the relationship is the foreign key to `Events`).
- **Sync rules (`../br_powersync/config/sync_rules.yaml`), two queries in the `web` stream**, with
  a comment that names this spec like the neighbouring ones:
  - accountant: `SELECT "ArEventTasks".* FROM "ArEventTasks" JOIN "Accountants" ON "Accountants"."is_active" = true JOIN "Users" ON "Accountants"."user_uuid" = "Users"."id" WHERE connection.parameter('app') = 'web' AND "Users"."clerk_user_id" = auth.user_id() AND "Users"."status_uuid" != '7b65d5a1-8ee0-4b7a-816d-d3ec1ed123c5'`
  - admin: `SELECT "ArEventTasks".* FROM "ArEventTasks" JOIN "Users" ON "Users"."is_admin" = true WHERE connection.parameter('app') = 'web' AND "Users"."clerk_user_id" = auth.user_id() AND "Users"."status_uuid" != '7b65d5a1-8ee0-4b7a-816d-d3ec1ed123c5'`
  - Both are whole-table queries joined to the user, never to the returned row, so they add no
    per-row bucket. Compile the file and count the parameterised web buckets before and after
    (the check in the project memory: a JOIN to the returned row makes a bucket per row).
- **pgTAP `supabase/tests/ar_event_tasks.test.sql`** and the script `test:db:areventtasks` (added to
  `test:db:all`): see §6.

## 5. Deploy order

Migration → sync rules and a PowerSync restart → the app. Without the sync rules the table never
reaches a device; without the migration an upload is refused.

## 6. Tests

Red first. Prettier only on touched files. The SQL test runs in a rolled-back transaction.

- **Shape:** the six columns, their types and defaults; `completed` defaults to false;
  `created_at` defaults to now; `id` is generated.
- **`note`:** `''` and `'   '` are refused (23514); `'x'` is accepted.
- **One open task per event:** a second open task for the same event is refused (23505); a
  second _completed_ task is accepted; completing the open task and inserting a new one works;
  two open tasks on different events work.
- **Foreign key:** a task for a missing event is refused (23503); deleting an event removes its
  tasks.
- **Access, one named assertion per role:** an active accountant and an admin select, insert and
  update; an account manager, developer, viewer, maintainer, driver, an inactive accountant and
  a user with no role select nothing and are refused on insert (42501); an update by them touches
  0 rows; **nobody** can delete (0 rows, row still there). Check each refusal by reading the row
  afterwards.
- **Mutation check:** add a permissive policy between migration and test and confirm the test
  goes red.
- **Gate:** `npm run tc`, `npx vitest run`, `prettier --check` on touched files. E2E: SKIPPED (no
  UI in this spec).

## 7. Files

**Counted: 2 files** (limit 10): `supabase/migrations/20261028120000_ar_event_tasks.sql` (new),
`src/lib/powersync/AppSchema.ts` (changed).

**Not counted:** `database.types.ts`, `../br_powersync/config/sync_rules.yaml`,
`supabase/tests/ar_event_tasks.test.sql`, `package.json` (the script).

## 8. Edge cases and error handling

- **A refused upload.** An accountant's write that RLS or a constraint refuses is discarded by
  the web connector with the toast "A change could not be saved and has been discarded".
- **Offline.** Tasks are local rows; writes queue and upload later. The unique index can refuse a
  queued insert if the cron created a task meanwhile (spec 06 describes the window).
- **A lagging local database.** Do not run `npm run gtl` against a database that has not applied
  the migration (§2).
- **Clerk.** Access comes from the roles in the database, as for every other table.

## 9. Out of scope

- The calculation, cron, triggers, client code and screens (specs 02 to 10).
- Restricting updates to the `completed` column, or recording who completed or created a task.
- Any change to `Events`, `PaymentHistory` or other tables.
