# Accountant Collections 19: deleting a closed task from Task History

Status: **Draft**, written 2026-11-11, waiting for "Approved". 0 open decisions (one answered,
§1); readings to confirm in §1.
Build order: **19**. Needs: [18](accountant-collections-18-task-finished-at.md) (it also changes
the Task History table and the table `ArEventTasks`). Needed by: none. Branch:
`q4-sprint3-finance`.

## 0. The change request of 2026-11-10 (the same in all seven specs)

This spec is one of seven (17 to 23). They change the Collections tab and the invoice page
(`/accountant/invoice`) that specs 06 to 16 built, after the author redrew the design on
2026-11-10. Each is built in its own chat, so this section is repeated in every spec.

**The series** (`docs/specs/`, in build order):

- **17** `accountant-collections-17-open-qi-button.md`: the Open Q/I button in the header.
- **18** `accountant-collections-18-task-finished-at.md`: the Finished at column (database and
  table) and the Due Date header in Task History.
- **19** `accountant-collections-19-task-delete.md`: deleting a closed task from Task History.
- **20** `accountant-collections-20-signed-booked-line.md`: the Signed / Booked line under Invoice.
- **21** `accountant-collections-21-files-row-click.md`: the whole Files row opens the file.
- **22** `accountant-collections-22-side-task-buttons.md`: Previous / Next Task beside the page.
- **23** `accountant-collections-23-amount-type-switch.md`: the Full amount / Deposits / All switch
  on the Collections tab.

Build order: 17, 18, 19, then 20 to 23 in any order. 19 needs 18 (both change the Task History
table); the others do not touch each other.

**The request** (the author's numbered list of 2026-11-10, in English):

1. Add a button to the header, **Open Q/I**, that opens `/quotes-bookings/{id}` in a separate tab.
2. Add a delete button to the Task History table, to delete a task that was added by accident,
   but only on **closed** tasks; an open task has no such button. Pressing it opens an "Are you
   sure? Yes No" window that can be closed with No, a click outside the window, the X, or the Esc
   key.
3. Add **Finished at** to Task History: the date when the task became closed. Add a new column
   `finished_at` to the table `ArEventTasks` and record when the task was finished.
4. In Task History change the header **Date** to **Due Date**.
5. In the invoice information, under `Invoice: {number}`, add **Signed:** when and by whom the
   contract was signed. If the contract became booked but there is no signature, show
   **Booked:** (when and by whom) instead of Signed; usually a manager simply changed the invoice
   to booked after getting the signature in person.
6. In the Files table make the whole row clickable. On a click it either downloads the file or
   opens it in a new window (now the file opens in the same window). The delete button stays
   where it is, the same as it is.
7. The Previous Task and Next Task buttons: if there is enough room outside the central window,
   also add them outside the main window, in the layout, and make them sticky. If there is not
   enough room, leave them as they are now. The buttons at the bottom of the window stay; where
   possible, side buttons are added as well.
8. Collections gets a toggle button that switches between **Full amount**, **Deposits** and
   **All**. When the page opens it shows Full amount; a click goes to the next one (Full amount,
   Deposits, All, then Full amount again). Another mode may open first only when the address
   carries another type in its query. How the list works now: an event with an overdue payment,
   whether one payment (a part of the invoice) or the whole invoice amount, is in the Collections
   list; a payment is overdue when (a) it follows the payment schedule, had to be paid today or
   earlier and the money is not there, or (b) there is no payment schedule and the quote was not
   fully paid 7 days before the event starts. After the change: **All** shows the full list, as
   now (`type=all` in the address); **Full amount** shows only the events whose overdue payment
   equals the quote's amount (`type=full`); **Deposits** shows only the events whose overdue
   payment does not equal the quote's amount (`type=deposits`). The author's four example
   events for each mode, and what "equals" came to mean, are in spec 23.

**Where the work is.** Branch `q4-sprint3-finance`. Design: `docs/design/accountant-collections/`
(`README.md`, `Invoice.dc.html`, its boards `InvoiceDeleteTask.dc.html` and `InvoiceWide.dc.html`,
and `Main.dc.html`, all redrawn 2026-11-10; never run Prettier on them). Published canvas
(private): https://claude.ai/artifact/L86cRNaAorJoeACkkeWox7. Stack and rules: `CLAUDE.md`,
`docs/POWERSYNC_ARCHITECTURE.md`. Earlier series: specs 01 to 16 (09 built the page, 10 Previous
and Next Task, 13 Task History and Files, 14 the New Task window, 15 Open PDF, 16 the customer
view).

**What stays as built:** the Collections list's sorting and Show Not Due Yet, the figures of
`useInvoiceData`, the Information cards, Messages, the New Task window, the Customer view, the
Previous / Next Task buttons at the bottom of the page, the rules of the table `ArEventTasks`
(one open task per event, the sync of spec 11), access for admin and accountant only. Earlier
specs are not edited; each spec of this series says which of their points it replaces.

**Decisions taken by the user (they hold for the whole series; asked one by one, 2026-11-11):**

1. **Full amount and Deposits** (spec 23). Asked what an event with a partly paid, fully overdue
   schedule is. The user's answer: "full amount, because that is the amount that is missing to
   full payment; even if the first payment were fully paid and the other two not, it must also be
   Full. So Full is for events that owe up to the full payment; Deposits is for those that must
   pay but not the whole invoice amount."
2. **Deleting a task is soft** (spec 19): a new column marks the row, the row stays in the
   database and is hidden. Not a physical delete.
3. **The finish time is written only by the database** (spec 18), by a trigger; the app never
   sends it. So an accountant who closes a task offline gets the time of the synchronisation.
4. **Tasks closed before this change keep no finish time** (spec 18): the migration does not
   touch them; the table shows a dash.
5. **Files open in a new tab** (spec 21): a click on the row opens the file in a new tab; the
   Download icon really downloads it.
6. **The side buttons are as drawn** (spec 22): 168 px wide, "enough room" measured on the room
   the page itself has, not on the window.
7. **Seven specs**, one logic each, in the order above.

**Not built in this series:** anything the request does not list: a log row for a deleted task,
restoring a deleted task in the interface, a tooltip with the exact finish time, counts on the
amount switch, remembering the switch in the browser.

## 1. What this spec decides

**From the user's own words (not options):**

- **Task History gets a delete button,** to delete a task that was added by accident.
- **Only closed tasks have it.** The open task has no delete button (the author's sketch drew
  one on the open task; the request says it has none, and the design follows the request).
- **Pressing it opens an "Are you sure?" window with Yes and No.** It closes on No, on a click
  outside the window, on the X, and on the Esc key. Closing it changes nothing.
- **Where it stands** is the design's (`Invoice.dc.html` and the board `InvoiceDeleteTask.dc.html`,
  README change 2): a narrow last column, a red trash icon on the right of the row; the window
  says "Are you sure?" with the line "Task #N will be deleted from the history.".

**Decision taken by the user (asked, 2026-11-11):**

- **D1 How a task is deleted.** Asked: physically (the row is gone, a new DELETE policy) or softly
  (a new column marks the row, the row stays in the database). The user's answer: **softly.**

**Replaces in spec 13:** §1, Task History is read-only. **Replaces in spec 01:** nothing is
undone: the table still has no DELETE policy and nobody can DELETE; "a task that disappears is
completed" gains a second way, a closed task that is hidden.

**Readings to confirm at review:**

- **The column** is `deleted_at timestamptz NULL`. The delete is an UPDATE of that column, made
  through the existing update policy (admin and accountant); no policy is added.
- **A closed task only, also in the database.** A CHECK, `deleted_at IS NULL OR completed`,
  refuses to mark an open task as deleted, whoever asks (an update that would, fails with 23514).
- **Every closed task can be deleted,** including the ones the system created and closed (the
  user did not separate them).
- **What the window says:** the title `Are you sure?`, the line
  `Task #N will be deleted from the history.` (N is the row's number in the table), the buttons
  `No` (outlined) and `Yes` (red, `#a8403a`), and an X in the corner. `No` has the focus when
  the window opens. While the delete runs, both buttons are disabled.
- **After Yes** the row leaves the table at once (the app is local-first) and the rows below
  renumber from 1; the window closes. If every closed task is gone and the event has no open
  task, the table says `No tasks yet.`
- **Hidden rows still synchronise** (the sync rules select the whole table). Every list that
  shows tasks to people skips them: the Task History query adds `deleted_at IS NULL`. The
  Collections list, Previous / Next Task and the database functions read open tasks only, and
  the CHECK keeps an open task from ever being deleted, so they change nothing.
- **No log row** (`EventChangeLog`) is written for a delete; not asked for.
- **No undo in the interface.** A deleted task can be brought back only by clearing
  `deleted_at` in the database.
- **Offline** works: the update is local and uploads later.
- **Permissions matrix:** one sentence is added to the Collections row (§3). Admin and
  accountant already update `ArEventTasks`; no role gains access to anything new.

## 2. Research findings

- **The table's rules** (`20261030125000_ar_event_tasks.sql`): policies select / insert / update
  for admin and accountant (`get_user_roles() && '{admin,accountant}'`), none for delete; one
  open task per event by a partial unique index; `note` not blank. After spec 18 it also has
  `finished_at` and a trigger that fills it.
- **`supabase/tests/ar_event_tasks.test.sql`** pins "nobody can DELETE" (keeps passing) and the
  column list (`columns_are`, changed by spec 18 to seven; it becomes eight here).
- **How a local write reaches the server** (`lib/powersync/BackendConnector.ts`): a PATCH is
  `update(opData).eq("id", id)`; a local DELETE would be `delete().eq("id", id)`. With no DELETE
  policy that deletes nothing on the server and, as far as PostgREST's row-level security is
  documented to behave, raises no error, so the next synchronisation would bring the row back
  (expected, not run). D1's soft delete is an UPDATE and avoids it. An error of class 23 or
  42501 is discarded with a toast ("A change could not be saved and has been discarded").
- **Who reads `ArEventTasks`:** `hooks/useInvoiceData.ts` (every task of the event, for Task
  History); `hooks/useCollectionsData.ts` (`completed = 0` only); `db/saveNextTask.ts` (updates
  `completed = 0`, inserts); in SQL `ar_sync_event_tasks` (updates `completed = false`, inserts)
  and `ar_sync_all_event_tasks` (looks for an open task). Only the first reads closed tasks.
- **Dialogs:** `components/ui/dialog.tsx` (Radix `Dialog`) closes on Esc and on a click outside
  and draws an X. The Files delete uses `AlertDialog`, which has no X and does not close on an
  outside click, so it is not the one to follow.
- **Writes** go through `typedExecute(compiled)` (CLAUDE.md); errors through
  `createErrorToastNoThrow` (`createErrorToast` throws after showing the toast).
- **Vitest is node-only here (no DOM):** click flows are tested through small exported
  controller functions with fakes, as `openSignedPdf` is.
- **`utils/invoiceView.ts`:** `buildTaskHistory` returns
  `TaskHistoryRow { number, id, dateLabel, note, isOpen }` (spec 18 adds the finish label).

## 3. Design

- **`supabase/migrations/20261111130000_ar_event_tasks_deleted_at.sql`** (new). It can run
  twice.

  ```sql
  ALTER TABLE public."ArEventTasks" ADD COLUMN IF NOT EXISTS deleted_at timestamptz;

  DO $$
  BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ar_event_tasks_deleted_is_closed') THEN
      ALTER TABLE public."ArEventTasks" ADD CONSTRAINT ar_event_tasks_deleted_is_closed
        CHECK (deleted_at IS NULL OR completed);
    END IF;
  END
  $$;
  ```

  No policy change. The header comment states D1 and that the table still has no DELETE policy.
  Deploy order: this migration, then the app.

- **`database.types.ts`** (hand edit) and **`AppSchema.ts`** (`deleted_at: column.text`).
- **`db/deleteTask.ts`** (new): `deleteClosedTask({ taskId, now })` runs, through
  `typedExecute`,
  `UPDATE ArEventTasks SET deleted_at = :now WHERE id = :taskId AND completed = 1 AND deleted_at IS NULL`
  (built with Kysely, `.compile()`). The two guards mean a stale click can never hide an open
  task. `now` is an ISO string made by the caller.
- **`hooks/useInvoiceData.ts`** (changed): the tasks query adds
  `.where("deleted_at", "is", null)`.
- **`utils/invoiceView.ts`** (changed): `TaskHistoryRow` gains `canDelete`, true for every row
  except the open one.
- **`components/DeleteTaskDialog.tsx`** (new): the window, built on `Dialog`. Props
  `{ number: number | null, busy: boolean, onConfirm, onClose }`; open when `number` is not
  null; Esc, an outside click and the X call `onClose` (through `onOpenChange`);
  `onOpenAutoFocus` puts the focus on No. Also exports the controller
  `runTaskDelete({ taskId, now, deleteTask, close, showError })`: it deletes, closes the window
  and on a failure shows the toast `Could not delete the task` with the reason and keeps the
  row.
- **`components/TaskHistoryTable.tsx`** (changed): a last, narrow column with a visually hidden
  header `Actions`; on a row with `canDelete` a trash button (`aria-label="Delete task N"`,
  `title="Delete task"`, the red of the Files delete, 32 px square); the open row has an empty
  cell. It holds the row being deleted in state and draws `DeleteTaskDialog`. The empty row
  spans five columns; `min-w-[640px]` as in the design.
- **`src/features/userAccess/permissionPageData.ts`** (changed): in the Collections description,
  after the sentence about the Information tab, add: "A closed task can be deleted from the task
  history; the open task cannot." Levels and notes stay.
- **SQL tests:** `ar_event_tasks.test.sql` (changed: eight columns, plan count). New
  `supabase/tests/ar_task_deleted_at.test.sql` with the script `test:db:artaskdeleted` in
  `package.json` and in `test:db:all`.
- **E2E fixtures:** `tasksOf` in `e2e/helpers/collectionsFixtures.ts` returns `deleted_at` too.

## 4. Behaviour scenarios

Playwright, written, **not run**. Roles: accountant, admin. S55 to S59.

- **S55** Every closed row has a delete button (`Delete task N`); the open row has none.
- **S56** The button opens "Are you sure?" with the right number; No, the X, Esc and a click
  outside each close it and leave the table as it was.
- **S57** Yes removes the row, the rest renumber from 1, and a service-role read shows the row
  still there with `deleted_at` set.
- **S58** After a reload the row is still gone; a second session of the same user does not show
  it after the synchronisation.
- **S59** Deleting every closed task of an event that also has an open task leaves the open row,
  numbered 1; with no open task the table says `No tasks yet.`

## 5. Tests

Red first.

- **`ar_task_deleted_at.test.sql`:** the column (type, nullable); an update that sets
  `deleted_at` on an open row is refused (23514), and so is an insert with `completed = false`
  and `deleted_at` set; on a closed row the update works for an active accountant and for an
  admin and does nothing (zero rows, read back as the owner) for an account manager, developer,
  viewer, maintainer, driver, an inactive accountant and a user with no role; the delete still
  raises nothing and removes nothing for any role; `ar_sync_event_tasks` still creates a task for
  an event whose only task is deleted, and completes the open one next to a deleted one.
- **`ar_event_tasks.test.sql`:** the shape, eight columns.
- **`db/deleteTask.test.ts`:** the statement and its parameters; it names both guards.
- **`utils/invoiceView.test.ts`:** `canDelete` is false for the open row and true for the closed
  ones.
- **`DeleteTaskDialog.test.tsx`:** the title, the text with the number, No before Yes, the X, the
  closed state draws nothing; `runTaskDelete` with fakes: success deletes then closes, failure
  shows the toast and still closes, and it never throws.
- **`TaskHistoryTable.test.tsx`:** the Actions header, a button only on closed rows, the empty
  row with `colSpan="5"`.
- **`useInvoiceData.test.tsx`:** the tasks query filters `deleted_at`; a deleted task is not in
  `tasks`.
- **`permissionPageData.test.ts`:** the new sentence.
- **Gate:** `npm run tc`, `npx vitest run`, `npm run test:db:artaskdeleted` and
  `npm run test:db:areventtasks`, `prettier --check` on the touched files. E2E: written,
  **SKIPPED** (not run locally, by instruction).

## 6. Files

**Counted: 6 files** (limit 10): the migration, `db/deleteTask.ts`,
`components/DeleteTaskDialog.tsx`, `components/TaskHistoryTable.tsx`, `hooks/useInvoiceData.ts`,
`utils/invoiceView.ts`. **Not counted:** the tests, the SQL tests, the Playwright specs and
fixtures, `database.types.ts`, `AppSchema.ts`, `permissionPageData.ts`, `package.json`. No
sync-rule change (the rules already select the whole table).

## 7. Edge cases and error handling

- **A stale click** (the task was closed a moment ago on another device, or is already deleted):
  the statement matches no row; nothing happens. The row is gone or already hidden anyway.
- **The update fails** (the local database): the toast `Could not delete the task`, the row
  stays, the window closes.
- **The upload is refused** (the CHECK, or a role without the policy): PowerSync discards the
  change and shows its own toast; the row comes back with the next synchronisation.
- **Two accountants delete the same task:** both updates succeed; the row is hidden once.
- **Esc while the delete runs:** ignored until it finishes (both buttons are disabled).
- **The last closed task of an event is deleted:** the next task, the open one, is untouched;
  Previous / Next Task and the Collections list do not change.
- **A deleted row and the nightly job:** the job reads open tasks only; a deleted (closed) row
  never blocks a new open task (the unique index covers open rows only).

## 8. Out of scope

- Restoring a deleted task in the interface; a log row; who deleted it and when beyond
  `deleted_at`; deleting an open task; deleting several tasks at once; a physical delete.
- The Finished at column (18).
