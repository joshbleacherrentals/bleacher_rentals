# Accountant Collections 06: Done / Next Task, the client write

Status: **Draft, written 2026-10-28, waiting for "Approved".** 0 open decisions; readings to
confirm in §1. Build order: **06**. Needs: [01](accountant-collections-01-backend.md) and
[03](accountant-collections-03-ts-twin-and-parity.md) (the date helpers). Needed by: 09 (the
modal calls it). Branch: `q4-sprint2-collections`.

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

- Done / Next Task is **one action**: the event's open task becomes completed and a new open task
  is created. This holds **even when the old task's date has not come**.
- The new task carries the date and the note typed in the modal. The old task is not edited.
- The modal opens with the date **today + 2 days** and the note **`Follow-up needed`**.
- "Due date is today or later" is checked **in the interface only**; the database accepts any
  date (spec 01).
- The note must not be blank; the date must be a real date.
- The accountant stays on the page afterwards (spec 09 draws it).
- The scheduled job must not add a second task while the new one is open (spec 04 does that on
  its own; this spec just keeps one open task).

**Readings to confirm at review:**

- It works on any open task, also one dated in the future (opened through Show Not Due Yet).
- "Today" for the check is the date in the timezone store (`useToday`), the same date the
  calendar uses; it is Toronto's date unless the accountant changed the selector.
- The note is trimmed before saving. There is no length limit.
- The default note is a prefilled, editable value, not a placeholder; Save is therefore enabled
  when the modal opens.

## 2. Research findings

- **Local-first writes:** `typedWriteTransaction(async (tx) => ...)` in `src/lib/powersync/typedQuery.ts`
  runs several statements in one local transaction; `recordManualPayment.ts` is the pattern.
  Build each statement with Kysely, `.compile()` it, run it through `tx` (project rule in
  `docs/POWERSYNC_ARCHITECTURE.md`).
- **Upload order:** PowerSync queues the changes of a transaction in order and the web connector
  sends them one by one (`BackendConnector.ts`): first the `PATCH` that completes the old task,
  then the `PUT` (an upsert) that inserts the new one. The partial unique index of spec 01 therefore
  never sees two open tasks from one device.
- **Refusal:** a unique violation (23505) on the second request is a class 23 error: the rest of
  the transaction is discarded and the user sees a toast.
- **Local types:** `completed` is an integer (`0/1`); `due_date` and `created_at` are text.
  Insert `created_at` explicitly (ISO string), as other local inserts do; the server default does
  not apply to an upsert that carries the column.
- **Dates:** `addDays` from spec 03 for the default date.

## 3. Design

All under `src/features/accountantCollections/`.

- **`utils/nextTaskDefaults.ts`** (new): `NEXT_TASK_DEFAULT_NOTE = "Follow-up needed"`,
  `NEXT_TASK_DEFAULT_DAYS = 2`, `defaultNextTaskDate(today)` = `addDays(today, 2)`.
- **`utils/validateNextTask.ts`** (new): `validateNextTask({ dueDate, note, today })` returns
  `{ ok: true }` or `{ ok: false, errors }` with: blank note after trim ("Write a note for the next
  task."), a `dueDate` that is not a real `YYYY-MM-DD` date ("Choose a date."), a `dueDate` before
  `today` ("The date cannot be in the past."). Pure.
- **`db/saveNextTask.ts`** (new):

  ```ts
  type SaveNextTaskInput = { eventUuid: string; dueDate: string; note: string; today: string };
  async function saveNextTask(input: SaveNextTaskInput): Promise<{ taskId: string }>;
  ```

  It validates first and throws a `NextTaskValidationError` (carrying the messages) without
  writing. Then, in **one** `typedWriteTransaction`, in this order:
  1. `UPDATE ArEventTasks SET completed = 1 WHERE event_uuid = ? AND completed = 0`;
  2. `INSERT INTO ArEventTasks (id, created_at, due_date, completed, note, event_uuid)` with a new
     `crypto.randomUUID()`, `new Date().toISOString()`, the date, `0`, the trimmed note, the event.

  It returns the new id. No other table is written.

## 4. Tests

Red first.

- **`validateNextTask.test.ts`:** blank and whitespace-only notes; a valid note; a date that is
  today (ok); yesterday (error); `2026-02-30` and `abc` (error); several errors at once.
- **`nextTaskDefaults.test.ts`:** today + 2 across a month end, a year end and 29 February.
- **`saveNextTask.test.ts` (mocked `typedWriteTransaction`):** exactly two statements in one
  transaction, the UPDATE first; the UPDATE touches only `completed = 0` rows of the given event;
  the INSERT carries a uuid, an ISO `created_at`, `completed = 0`, the trimmed note; a validation
  error writes nothing; the returned id equals the inserted one.
- **In-memory SQLite run (as `quoteDetailData.differential.test.ts` does):** create the table,
  seed an event with an open task and another event with an open task; after the call the first
  event has one completed and one open task, and the other event is untouched.
- **Gate:** `npm run tc`, `npx vitest run`, `prettier --check`. E2E: SKIPPED here (the modal is in
  spec 09).

## 5. Files

**Counted: 3 files** (limit 10): `utils/nextTaskDefaults.ts`, `utils/validateNextTask.ts`,
`db/saveNextTask.ts` (all new). **Not counted:** their three tests.

## 6. Edge cases and error handling

- **Offline.** The two statements apply locally at once and upload later, in order.
- **The cron window** (spec 04 §6): if the daily job runs between the two uploaded requests, the
  `PUT` is refused (23505) and discarded with a toast; the old task is already completed and the
  system's task stands. The accountant writes theirs again.
- **A double click on Save.** The function is not idempotent: a second call completes the first
  new task and adds another. The modal (spec 09) disables Save while the call runs.
- **No open task on the event.** The UPDATE changes 0 rows and the INSERT still runs. The screen
  never offers the action in that case.
- **Another device changed the event first.** If a payment completed the task meanwhile (spec 05),
  the UPDATE changes 0 rows and a new open task is inserted all the same; the accountant sees it.
- **The old task is future-dated.** It is completed anyway (§1).

## 7. Out of scope

- The modal and the calendar (spec 09); where the accountant goes afterwards (stays); Previous /
  Next (10).
- Editing or deleting a task; a task with no next task; assigning a task to someone.
