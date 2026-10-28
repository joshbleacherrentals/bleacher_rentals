# Accountant Collections 04: the daily job that creates tasks

Status: **Draft, written 2026-10-28, waiting for "Approved".** 0 open decisions; readings to
confirm in §1. Build order: **04**. Needs: [01](accountant-collections-01-backend.md),
[02](accountant-collections-02-sql-amount-due.md). Needed by: nothing else. Branch:
`q4-sprint2-collections`.

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

- A pg_cron job, every day at **05:20 UTC**, in the style of `delete_past_alerts()` (a migration
  that creates the function and schedules it). It runs whether or not anyone opens the app.
- For each event with Amount Due > 0 it checks whether the event has an open task. If it has one,
  **auto-created or typed by an accountant**, it creates nothing. If not, it creates one:
  `created_at` now, `due_date` today, `completed` false, `note` exactly
  `Remind the customer about payment`, `event_uuid` the event.
- Running it again the same day creates no duplicate. It is safe when two runs, or a run and an
  accountant, overlap.
- Eligible events: `booked`, not deleted. Amount Due is `public.ar_event_amount_due` (spec 02).
- "Today" is Toronto's date, as in `delete_past_alerts()`.
- If Amount Due rises again later, nothing happens at that moment; the next run decides.

- **Confirmed by the user on 2026-10-29: the task appears on the due date itself.** A payment due
  27.10 gets its task on 27.10, at 05:20 UTC (00:20 or 01:20 Toronto). The example with a task on
  28.10 in the first request was imprecise.

**Readings to confirm at review:**

- **The first run after the deploy** creates a task for every booked event that is overdue at that
  moment, including every booked event with no schedule that is already inside 7 days of its start
  or past it. That can be many tasks, all due that day. There is no staging or limit in this spec.
- The job writes no author: the table has no such column.

## 2. Research findings

- **The pattern to copy:** `20260918140000_delete_past_alerts.sql` (a `SECURITY DEFINER` function,
  `SET search_path = public`, `today date := (now() AT TIME ZONE 'America/Toronto')::date`, returns
  a count) and `20260918150000_schedule_delete_past_alerts.sql` (`CREATE EXTENSION IF NOT EXISTS
pg_cron`, `cron.schedule('name', 'minute hour * * *', $$SELECT ...$$)`, schedules are UTC, each
  run is kept in `cron.job_run_details`, and a weekly job already prunes that table to 30 days).
- **Why pg_cron and not the Vercel cron** (`/api/cron/alerts`): the Vercel plan runs once a day
  anywhere inside the hour and keeps logs for an hour; and the calculation is now SQL (spec 02).
- **The unique index of spec 01** makes the insert race-safe: the conflict target is
  `ON CONFLICT (event_uuid) WHERE completed = false DO NOTHING`.
- **Event columns:** `event_status` is the enum `event_status` (`booked` is a value), `deleted` is a
  boolean.
- **How an accountant's Done / Next Task reaches the server** (spec 06): two writes in order, first
  the old task is completed, then the new one inserted. Between them the event has no open task.

## 3. The function and the job

`supabase/migrations/20261028140000_ar_collection_tasks_cron.sql`:

```sql
CREATE OR REPLACE FUNCTION public.create_ar_collection_tasks()
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  today   date := (now() AT TIME ZONE 'America/Toronto')::date;
  created integer;
BEGIN
  WITH candidates AS (
    SELECT e.id
    FROM public."Events" e
    WHERE e.event_status = 'booked' AND NOT coalesce(e.deleted, false)
      AND NOT EXISTS (SELECT 1 FROM public."ArEventTasks" t
                      WHERE t.event_uuid = e.id AND t.completed = false)
      AND public.ar_event_amount_due(e.id, today) > 0
  ), inserted AS (
    INSERT INTO public."ArEventTasks" (due_date, note, event_uuid)
    SELECT today, 'Remind the customer about payment', id FROM candidates
    ON CONFLICT (event_uuid) WHERE completed = false DO NOTHING
    RETURNING 1
  )
  SELECT count(*) INTO created FROM inserted;
  RETURN created;
END;
$$;

REVOKE ALL ON FUNCTION public.create_ar_collection_tasks() FROM PUBLIC, anon, authenticated;

SELECT cron.schedule('create-ar-collection-tasks', '20 5 * * *',
                     $$SELECT public.create_ar_collection_tasks();$$);
```

The header comment names this spec and §1's two readings. The cheap tests (status, deleted, open
task) sit in the same `WHERE`; the function's `COST 1000` (spec 02) makes the planner run it last,
so it runs only for events that can matter. Confirm that with `EXPLAIN`.
The migration is safe to run twice: `cron.schedule` with a name replaces the job.

## 4. Tests

Red first. `supabase/tests/ar_collection_tasks_cron.test.sql`, script `test:db:arcollectiontaskscron`
(added to `test:db:all`), rolled back.

- **Creates:** a booked event with Amount Due > 0 and no tasks gets exactly one task with the
  note, `completed = false`, and `due_date` equal to Toronto's date; the function returns 1.
- **Skips:** Amount Due 0 (fully paid; nothing due yet); statuses `quoted`, `draft`,
  `unsigned_changes`, `lost`; a deleted event; an event with an open task, whether the task is the
  system's note or an accountant's text and whether its date is past, today or future.
- **Creates again after completion:** an event whose only task is completed gets a new one.
- **Idempotent:** a second call returns 0 and adds nothing.
- **No schedule:** an event starting in 7 days is picked up; in 8 days is not.
- **Only the overdue event** among several is touched.
- **Access:** `anon` and `authenticated` cannot execute it (42501).
- **The job:** `cron.job` has `create-ar-collection-tasks` with schedule `20 5 * * *` and the
  expected command.
- **Concurrency script** `ar_collection_tasks_cron.concurrency.sh` (pattern of
  `damage_reports_photos_uploaded.concurrency.sh`): two sessions call the function at the same
  moment; every event ends with exactly one open task and neither session errors.
- **Mutation check:** drop the `NOT EXISTS` and the conflict clause in turn; the idempotence and
  concurrency tests must go red.
- **Gate:** `npm run tc`, `npx vitest run`, `prettier --check`. E2E: SKIPPED (no UI).

## 5. Files

**Counted: 1 file** (limit 10): `supabase/migrations/20261028140000_ar_collection_tasks_cron.sql`.
**Not counted:** the pgTAP test, the concurrency script, `package.json`.

## 6. Edge cases and error handling

- **The accountant's upload window.** Done / Next Task uploads "complete the old task", then "insert
  the new one". If a run lands between those two requests, the run sees no open task and inserts
  the system's task; the accountant's insert is then refused (23505) and discarded with a toast, and
  their note is lost. The window is milliseconds at one minute a day; the toast tells them to write
  the task again.
- **A missed run.** If the database is down at 05:20 UTC the day is skipped; the next run creates
  the task with that day's date. There is no catch-up.
- **A failing run** is visible in `cron.job_run_details`. Nothing alerts anyone; add that only on
  request.
- **Daylight saving.** 05:20 UTC is 00:20 or 01:20 Toronto, always after Toronto's date has turned.
- **A null `deleted`** counts as not deleted.
- **A refunded event** (Amount Due rises again) gets its task at the next run, not at once.

## 7. Out of scope

- Completing tasks (spec 05) and writing tasks from the app (spec 06).
- Staging or limiting the first run; notifications; a catch-up for missed days.
