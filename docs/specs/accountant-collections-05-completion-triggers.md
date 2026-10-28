# Accountant Collections 05: triggers that complete tasks

Status: **Draft, written 2026-10-28, waiting for "Approved".** 0 open decisions; readings to
confirm in §1. Build order: **05**. Needs: [01](accountant-collections-01-backend.md),
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

- When a payment is added or updated and the event's Amount Due becomes 0, **every** open task of
  that event gets `completed = true`. It holds for manual payments and for Stripe payments, using
  the paths that already write payments.
- An event that becomes **Lost** has its open tasks completed (user's answer).
- An event that stops being `booked` in any other way, or is deleted, keeps its open tasks; the
  list hides them (user's answer).
- If Amount Due later rises again, nothing is created at that moment; the next cron run (spec 04)
  decides.
- The invoice "status" (Paid, Schedule, Collections...) is computed in the app (spec 08). No status
  is stored and no existing rule changes.
- The updates reach the screens through PowerSync with no reload.

**Readings to confirm at review:**

- "Becomes 0" is evaluated as **"is 0 after this change"**, not as a before-and-after transition.
  So when Amount Due is already 0 and an open task exists (for example an accountant wrote a
  future task, then the schedule was edited so nothing is due), any payment-row change on that
  event completes the task.
- Editing or soft-deleting a payment is an UPDATE of the same table and goes through the same
  trigger. A soft delete that raises Amount Due completes nothing.
- A payment moved from one event to another checks both events.
- "Today" is Toronto's date at the moment of the change.
- Changes to the schedule (`PaymentInstallments`) or to the price (`EventLineItems`) do **not**
  trigger anything: the request names payments. A task can stay open after such an edit until a
  payment changes, the event is lost, or the accountant acts.
- A failure inside the trigger never blocks the payment (§3).

## 2. Research findings

- **Every payment write reaches the same table.** Accountant and admin writes come from the
  PowerSync upload into `PaymentHistory`; the Stripe webhook inserts with the service role. A
  trigger on the table sees both. (`20261004160000_payment_history_edit_and_soft_delete.sql` already
  has a guard trigger and CHECKs on the table; the new triggers are `AFTER`, so they run after
  those and cannot disturb them.)
- **The webhook is idempotent and must not fail** once the money is recorded
  (`docs/specs/payment-accounting-truth.md` §3.2): an exception in a new trigger would roll the
  payment back. Hence the exception block in §3.
- **Events** already has triggers (signature invalidation). The new one is limited to
  `UPDATE OF event_status`.
- **Enum:** `lost` is an existing value of `event_status`.
- **Cost:** most payment rows belong to events with no open task, so the function first asks
  "does this event have an open task?" and only then runs the calculation.

## 3. The triggers

`supabase/migrations/20261028150000_ar_task_completion_triggers.sql`:

- **`public.complete_ar_tasks_when_paid()`** (`SECURITY DEFINER`, `SET search_path = public`),
  `AFTER INSERT OR UPDATE ON public."PaymentHistory" FOR EACH ROW`. For `NEW.event_uuid` (and
  `OLD.event_uuid` on UPDATE when it differs): if the event has an open task and
  `public.ar_event_amount_due(event, today) = 0`, then
  `UPDATE public."ArEventTasks" SET completed = true WHERE event_uuid = event AND completed = false`.
  The whole body sits in `BEGIN ... EXCEPTION WHEN OTHERS THEN RAISE WARNING '...'; END`, so the
  payment is always recorded.
- **`public.complete_ar_tasks_when_lost()`** (same attributes), `AFTER UPDATE OF event_status ON
public."Events" FOR EACH ROW WHEN (NEW.event_status = 'lost' AND OLD.event_status IS DISTINCT FROM
NEW.event_status)`: completes the event's open tasks. Same exception block.
- `REVOKE ALL ON FUNCTION ... FROM PUBLIC, anon, authenticated` on both.

The service-role and owner sessions bypass RLS, so the trigger functions update `ArEventTasks`
whatever the signed-in user's role.

## 4. Tests

Red first. `supabase/tests/ar_task_completion_triggers.test.sql`, script
`test:db:artaskcompletion` (added to `test:db:all`), rolled back.

- **A full payment completes:** an event with one open task (the table allows one) and an overdue
  installment; inserting a payment that covers it sets `completed = true`.
- **A partial payment does not:** Amount Due stays above 0, the task stays open.
- **A payment that covers only the overdue part** completes the task although later installments
  are unpaid (Amount Due is 0, the event is not fully paid).
- **Stripe-like insert** by the service role (no accountant session) completes it.
- **Manual insert as an accountant, and as an admin,** completes it.
- **Edit:** changing a payment's amount so that Amount Due becomes 0 completes the task.
- **Soft delete:** deleting a payment so that Amount Due rises completes nothing and creates
  nothing.
- **Another event** with its own open task is untouched.
- **An event without an open task:** the insert succeeds and no error is raised.
- **A payment moved to another event** checks both.
- **Lost:** `booked` to `lost` completes the event's open tasks; `booked` to `unsigned_changes`,
  `quoted` or `draft`, and `deleted = true`, complete nothing; `lost` to `booked` un-completes
  nothing.
- **A broken calculation does not block a payment:** make `ar_event_amount_due` raise (a temporary
  replacement in the test); the payment insert still succeeds and a warning is raised.
- **Mutation check:** remove the open-task guard, the exception block and the `WHEN` clause in
  turn; the matching tests go red.
- **Gate:** `npm run tc`, `npx vitest run`, `prettier --check`. E2E: SKIPPED (no UI).

## 5. Files

**Counted: 1 file** (limit 10): `supabase/migrations/20261028150000_ar_task_completion_triggers.sql`.
**Not counted:** the pgTAP test, `package.json`.

## 6. Edge cases and error handling

- **A silent failure.** If the calculation raises, the payment is recorded, the tasks stay open and
  only a server warning says so. The next payment change, or the accountant, fixes it.
- **A race with the accountant.** If an accountant saves Done / Next Task at the instant a
  covering payment arrives, their new task is inserted after the trigger ran and stays open although
  Amount Due is 0. The next payment change on that event completes it; the accountant sees it
  and can act.
- **Stale tasks after a schedule or price edit** (§1, last readings): not handled here.
- **A refund after a full payment** raises Amount Due: no task is created until the next 05:20 run.
- **Offline accountants.** The completion is made on the server and arrives with the next sync, so
  an offline device keeps showing the task until then.

## 7. Out of scope

- Creating tasks (spec 04) and the accountant's writes (spec 06).
- Triggers on `PaymentInstallments` or `EventLineItems`; un-completing a task; storing a status.
