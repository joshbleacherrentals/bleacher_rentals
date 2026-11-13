# Accountant Collections 18: when a task was finished (Finished at) and the Due Date header

Status: **Approved** 2026-11-11, with one correction by the user (D3, §1): Finished at shows a
date, `DD/MM/YYYY`, not words. 0 open decisions (three answered, §1).
Build order: **18**. Needs: [11](accountant-collections-11-task-sync.md),
[13](accountant-collections-13-task-history-and-files.md). Needed by: 19. Branch:
`q4-sprint3-finance`.

## 0. The change request of 2026-11-10, amended 2026-11-11 (the same in all eight specs)

This spec is one of eight (17 to 24). They change the Collections tab and the invoice page
(`/accountant/invoice`) that specs 06 to 16 built, after the author redrew the design on
2026-11-10 and amended item 8 of the request on 2026-11-11. Each is built in its own chat, so
this section is repeated in every spec.

**The series** (`docs/specs/`, in build order):

- **17** `accountant-collections-17-open-qi-button.md`: the Open Q/I button in the header.
- **18** `accountant-collections-18-task-finished-at.md`: the Finished at column (database and
  table) and the Due Date header in Task History.
- **19** `accountant-collections-19-task-delete.md`: deleting a closed task from Task History.
- **20** `accountant-collections-20-signed-booked-line.md`: the Signed / Booked line under Invoice.
- **21** `accountant-collections-21-files-row-click.md`: the whole Files row opens the file.
- **22** `accountant-collections-22-side-task-buttons.md`: Previous / Next Task beside the page.
- **23** `accountant-collections-23-amount-type-switch.md`: the Collections / Deposits / All switch
  on the Collections tab.
- **24** `accountant-collections-24-no-schedule-due-on-start-day.md`: an event with no payment
  schedule is overdue from its start day, not 7 days before it (the rule the lists of 23 rest
  on).

Build order: 17, 18, 19, then 20 to 22 and 24 in any order, then 23: 23 needs 24, because its
lists and examples rest on the new overdue rule. 19 needs 18 (both change the Task History
table); the others do not touch each other.

**The request** (the author's numbered list of 2026-11-10, in English; item 8 as amended on
2026-11-11):

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
8. Collections gets a toggle button that switches between **Collections**, **Deposits** and
   **All** (the author called the first value Full amount on 2026-11-10 and renamed it on
   2026-11-11). When the page opens it shows Collections; a click goes to the next one
   (Collections, Deposits, All, then Collections again). Another mode may open first only when
   the address carries another type in its query. How the list works now: an event with an
   overdue payment, whether one payment (a part of the invoice) or the whole invoice amount, is
   in the Collections list; a payment is overdue when (a) it follows the payment schedule, had to
   be paid today or earlier and the money is not there, or (b) there is no payment schedule and
   the quote was not fully paid 7 days before the event starts. After the change: **All** shows
   the full list, as now (`type=all` in the address); **Collections** shows only the events whose
   overdue amount equals what is missing to the full payment of the quote; **Deposits** shows
   only the events whose overdue amount is above 0 but less than what is missing to the full
   payment (`type=deposits` in the address), so the two never overlap. And (b) changes: an event
   with no payment schedule becomes overdue only on the day it starts, not 7 days before. The
   author's examples for each mode are in spec 23; the new overdue rule is spec 24.

**Where the work is.** Branch `q4-sprint3-finance`. Design: `docs/design/accountant-collections/`
(`README.md`, `Invoice.dc.html`, its boards `InvoiceDeleteTask.dc.html` and `InvoiceWide.dc.html`,
and `Main.dc.html`, all redrawn 2026-11-10; never run Prettier on them). Published canvas
(private): https://claude.ai/artifact/L86cRNaAorJoeACkkeWox7. Stack and rules: `CLAUDE.md`,
`docs/POWERSYNC_ARCHITECTURE.md`. Earlier series: specs 01 to 16 (09 built the page, 10 Previous
and Next Task, 13 Task History and Files, 14 the New Task window, 15 Open PDF, 16 the customer
view).

**What stays as built:** the Collections list's sorting and Show Not Due Yet, the figures of
`useInvoiceData` (apart from the no-schedule rule of spec 24), the Information cards, Messages,
the New Task window, the Customer view, the Previous / Next Task buttons at the bottom of the
page, the rules of the table `ArEventTasks` (one open task per event, the sync of spec 11),
access for admin and accountant only. Earlier specs are not edited; each spec of this series
says which of their points it replaces.

**Decisions taken by the user (they hold for the whole series; asked one by one, 2026-11-11):**

1. **Collections and Deposits** (spec 23). Asked what an event with a partly paid, fully overdue
   schedule is. The user's answer: "full amount, because that is the amount that is missing to
   full payment; even if the first payment were fully paid and the other two not, it must also be
   Full. So Full is for events that owe up to the full payment; Deposits is for those that must
   pay but not the whole invoice amount." On 2026-11-11 the author renamed Full amount to
   **Collections** and wrote the rule out with examples: Collections is the events whose overdue
   amount equals what is missing to the full payment; Deposits is the events whose overdue amount
   is above 0 but less than that; the two lists never overlap.
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
7. **Eight specs**, one logic each, in the order above (seven were agreed; the eighth, spec 24,
   holds the overdue rule that the author's amendment of item 8 changes).
8. **An event with no payment schedule is overdue from its start day** (spec 24), not 7 days
   before it. From that day it stays overdue until it is paid, its days overdue count from the
   start day, and the migration closes at once the open tasks that this makes not overdue.
9. **The address carries no `type` for Collections** (spec 23): the first value is the default
   and is left out, like the other list parameters; Deposits writes `type=deposits` and All
   writes `type=all`.
10. **Previous / Next Task and Back to tasks follow the chosen type** (spec 23).

**Not built in this series:** anything the request does not list: a log row for a deleted task,
restoring a deleted task in the interface, a tooltip with the exact finish time, counts on the
type switch, remembering the switch in the browser.

## 1. What this spec decides

**From the user's own words (not options):**

- **Task History gets a Finished at column:** the date when the task became closed, written as
  a date, `DD/MM/YYYY` (D3).
- **`ArEventTasks` gets a new column `finished_at`,** and it is written when the task is
  finished.
- **The header Date becomes Due Date.**
- **Where the column stands** is the design's (`Invoice.dc.html`, README changes 3 and 4): the
  columns are `#`, `Finished at`, `Due Date`, `Note`, each of the two date columns 132 px wide.
  The open task shows a dash in Finished at.

**Decisions taken by the user (asked, 2026-11-11):**

- **D1 Who writes the time.** Asked: only the database (a trigger), or the app and the database.
  The user's answer: **only the database.** One mechanism closes every path: Done / Next Task (the
  app's `completed` update), the system's completions (`ar_sync_event_tasks`: the payment arrived,
  the event is Lost) and any later writer. The app never sends `finished_at`. The consequence the
  user accepted: an accountant who presses Done / Next Task offline gets the time of the
  synchronisation, not of the click.
- **D2 Tasks closed before this change.** Asked: leave them empty, or fill them from the next
  task's `created_at`. The user's answer: **leave them empty.** The migration does not touch
  them; the table shows a dash for them.

- **D3 The wording of Finished at (a correction of the first draft, 2026-11-11).** The draft
  wrote Finished at in words, like the Due Date column. The user's correction: **Finished at
  does not follow the Due Date column's style; it shows dates, not words, in the format
  `DD/MM/YYYY`** (for example `09/11/2026`). The Due Date column stays as spec 13 built it, in
  words.

**Replaces in spec 13:** §1 and §3, the Task History columns `#`, `Date`, `Note` (now `#`,
`Finished at`, `Due Date`, `Note`); `TaskView` and `TaskHistoryRow` gain a finish label (the date).
**Replaces in spec 08:** the comment of `buildTaskLists`, "the table has no completion date".

**Readings to confirm at review:**

- **The column** is `finished_at timestamptz NULL`, like `created_at`. The table shows the day in
  the office's time zone (`useTimezoneStore`), as the page's other dates.
- **The trigger** is `BEFORE INSERT OR UPDATE`, per row. It sets `finished_at := now()` when the
  row is completed (an insert with `completed = true`, or an update from `false` to `true`) and
  `finished_at` is empty. A value that is already there is kept (the app never sends one; seeds
  and tests may). An update of a row that was already completed never changes it, so a later
  edit of an old completed row (spec 19's delete) does not stamp it. `now()` is the start of the
  transaction: all tasks closed by one nightly run, or by one payment's transaction, share that
  moment.
- **Wording of Finished at** is a date, `DD/MM/YYYY` (D3): day and month with two digits, the
  year with four, the day taken in the office's time zone. The design draws words (`2 days ago`,
  `Yesterday`); the user's correction replaces that. A finish day after today (the server's
  clock a little ahead of the browser's) is shown as it is, as its date.
- **A dash** (`—`) stands for the open task and for any closed task without a finish time.
- **Until the server's stamp arrives** the closed row shows a dash: after Done / Next Task the
  row is closed locally at once, and `finished_at` comes back with the synchronisation (seconds
  online; after reconnecting, offline).
- **The order of the rows is unchanged:** completed tasks oldest due date first, the open one
  last. The table does not sort by finish time.
- **Table width:** the minimum grows from 480 to 560 px for the extra column; the empty row
  spans four columns.

## 2. Research findings

- `ArEventTasks` has six columns (`id`, `created_at`, `due_date`, `completed`, `note`,
  `event_uuid`); policies select / insert / update for admin and accountant, none for delete
  (migration `20261030125000_ar_event_tasks.sql`).
- **Who sets `completed`:** (1) the app: `db/saveNextTask.ts` runs
  `UPDATE … SET completed = 1 WHERE event_uuid = ? AND completed = 0` and then inserts the next
  task, in one local transaction; PowerSync uploads a PATCH and then a PUT. (2) The database:
  `ar_sync_event_tasks(event, today)` (migration `20261031120000_ar_task_sync.sql`) runs
  `UPDATE … SET completed = true WHERE event_uuid = p_event AND completed = false` for a Lost
  event and for an event with Amount Due 0; the nightly job and four deferred constraint
  triggers call it. A search of `src` finds no other writer.
- **The synchronisation:** `../br_powersync/config/sync_rules.yaml` selects `"ArEventTasks".*`
  for the admin and the accountant, so the new column needs no rule. Not verified: whether the
  running PowerSync service delivers a column added after its rules were deployed for rows that
  change afterwards (the closures after the deploy are such rows); if a device does not show it,
  redeploying the rules reprocesses the table.
- **`AppSchema.ts`:** `ArEventTasksCols` lists `created_at`, `due_date`, `completed`, `note`,
  `event_uuid` and `satisfies PowerSyncColsFor<"ArEventTasks">`, which reads
  `database.types.ts`: the type file is edited first, by hand (`npm run gtl` rewrites the whole
  file from a local database that may lag the migrations; it is not run).
- **The client:** `useInvoiceData` selects `id, created_at, due_date, note, completed` from
  `ArEventTasks`; `buildTaskLists(tasks, today)` returns
  `TaskView { id, dueDate, note, followUpLabel }`; `buildTaskHistory` returns
  `TaskHistoryRow { number, id, dateLabel, note, isOpen }`; `TaskHistoryTable.tsx` draws `#`,
  `Date`, `Note` and an empty row with `colSpan={3}`.
- **`utils/relativeDays.ts`** has `followUpLabel` (`Due Today`, `Due tomorrow`, `N days ago`,
  `N days after`) and the private `span` (30-day months). `utils/calendarDays.ts` has
  `daysBetween(from, to)`.
- **`utils/invoiceView.ts`** has `inZone` and `zonedDate` (luxon, `en-US`, the office's zone).
  `DateTime.fromISO(text, { zone })` converts an instant with an offset into that zone.
- **Tests that pin the old shape:** `supabase/tests/ar_event_tasks.test.sql` asserts "exactly the
  six columns" (`columns_are`, then one `col_type_is` / `col_not_null` per column) and counts
  `plan(91)`; `TaskHistoryTable.test.tsx` expects the headers `["#", "Date", "Note"]` and
  `colSpan="3"`; `e2e/collections.accountant.spec.ts` S24 expects `["#", "Date", "Note"]`.
- **Production:** Collections is merged into `main` (the migration is on `origin/main`), so a
  production database may already hold completed tasks. They get no finish time (D2). The
  production database was not looked at.

## 3. Design

- **`supabase/migrations/20261111120000_ar_event_tasks_finished_at.sql`** (new). It can run
  twice.

  ```sql
  ALTER TABLE public."ArEventTasks" ADD COLUMN IF NOT EXISTS finished_at timestamptz;

  CREATE OR REPLACE FUNCTION public.ar_event_tasks_stamp_finished() RETURNS trigger
  LANGUAGE plpgsql AS $$
  BEGIN
    IF NEW.completed AND NEW.finished_at IS NULL
       AND (TG_OP = 'INSERT' OR NOT OLD.completed) THEN
      NEW.finished_at := now();
    END IF;
    RETURN NEW;
  END;
  $$;

  DROP TRIGGER IF EXISTS ar_event_tasks_stamp_finished ON public."ArEventTasks";
  CREATE TRIGGER ar_event_tasks_stamp_finished
    BEFORE INSERT OR UPDATE ON public."ArEventTasks"
    FOR EACH ROW EXECUTE FUNCTION public.ar_event_tasks_stamp_finished();
  ```

  No policy changes, no backfill. The header comment states D1 and D2. Deploy order: this
  migration, then the app; the other order is harmless too (without the column on the server the
  app's column stays empty).

- **`database.types.ts`** (hand edit): `finished_at: string | null` in `Row`,
  `finished_at?: string | null` in `Insert` and `Update`, in the generator's alphabetical place.
- **`src/lib/powersync/AppSchema.ts`:** `finished_at: column.text` in `ArEventTasksCols`.
- **`utils/invoiceView.ts`** (changed): `InvoiceTaskRow` gains `finished_at: string | null`.
  New `finishedLabel(value, timezone)`, beside `zonedDate` and built on the same `inZone`: null,
  an empty text or a text that does not parse gives `—`; otherwise the instant in the office's
  zone formatted `dd/MM/yyyy`. `TaskView` gains `finishedLabel`. `buildTaskLists` takes the
  time zone as a third argument, after `today`, and fills the label for the completed tasks; the
  open task gets `—`. `TaskHistoryRow` gains `finishedLabel`. The comment about "no completion
  date" goes. `utils/relativeDays.ts` is not touched.
- **`hooks/useInvoiceData.ts`** (changed): the tasks query also selects `finished_at`; the call
  passes the time zone it already holds.
- **`components/TaskHistoryTable.tsx`** (changed): columns `#`, `Finished at`, `Due Date`,
  `Note`; the Finished at cell is grey when it is a dash; `colSpan={4}`; `min-w-[560px]`.
- **`components/invoiceFixtures.ts`** (changed): the task fixture carries `finishedLabel`.
- **SQL tests:** `supabase/tests/ar_event_tasks.test.sql` (changed): seven columns, one
  `col_type_is` (`timestamp with time zone`) and one nullable check for `finished_at`, the plan
  count follows. New `supabase/tests/ar_task_finished_at.test.sql` with the script
  `test:db:artaskfinished` in `package.json` and in `test:db:all` (same style as
  `ar_task_sync.test.sql`: everything in a transaction that is rolled back).
- **E2E fixtures:** `addTask` in `e2e/helpers/collectionsFixtures.ts` gets an optional
  `finishedDaysAgo` (inserted as an explicit `finished_at`, which the trigger keeps; the helper
  `finishedMoment` makes it 17:00 UTC, noon in Toronto, so the office's day is stable). A closed
  task seeded without it is stamped with the moment of the insert.

## 4. Behaviour scenarios

Playwright, written, **not run**. Roles: accountant, admin: the scenarios are written once in
`e2e/helpers/finishedAtTests.ts` and run by `finishedAt.accountant.spec.ts` and
`finishedAt.admin.spec.ts`, as spec 17 did. S51 to S54. The existing S24 (accountant file) is
changed for the new headers and the date.

- **S51** Task History has the columns `#`, `Finished at`, `Due Date`, `Note`, in that order.
- **S52** A closed task with a finish time shows its date, `DD/MM/YYYY` (for example the date of
  yesterday and of three days ago); the open task shows a dash. A closed task without a finish
  time (a dash) has no Playwright scenario: the trigger stamps every closed row the API can
  write, so only a database session with the trigger off makes such a row. It is covered by the
  SQL test (a legacy row stays empty) and by the unit tests (`buildTaskLists`,
  `TaskHistoryTable`).
- **S53** New Task closes the open task: after the synchronisation its row shows today's date,
  `DD/MM/YYYY`, in Finished at, and the new Open row shows a dash.
- **S54** A payment that closes the open task (the system's path): its row shows today's date,
  `DD/MM/YYYY`, after the synchronisation.

## 5. Tests

Red first.

- **`ar_task_finished_at.test.sql`:** the column (type, nullable, no default); an open task has
  no finish time; an insert with `completed = true` and no value gets `now()`; an update from
  open to closed gets it; a later update (note, due date) of a closed row leaves it, and leaves a
  closed row that has none (an old one) without one; an explicit value on insert, and in the
  update that closes the row, is kept; `ar_sync_event_tasks` on a Lost event with an open task
  returns `completed` and the row has a finish time; an accountant's own update that closes a
  task is stamped (the policies are unchanged).
- **`ar_event_tasks.test.sql`:** the shape assertions of the seven columns.
- **`invoiceView.test.ts`:** `finishedLabel` for null, an empty text, a text that does not
  parse (a dash), a value with `Z`, with `+00` and with a space instead of `T`, a single-digit
  day and month (`05/01/2026`, two digits each), and a `finished_at` near midnight (the same
  instant is two different office days in two zones); `buildTaskLists` gives the completed
  tasks their date and the open task a dash, a closed task without a value a dash;
  `buildTaskHistory` carries the label.
- **`TaskHistoryTable.test.tsx`:** the four headers, the rows with the new cell (dates, not
  words), a dash grey, the empty row with `colSpan="4"`.
- **`useInvoiceData.test.tsx`:** the tasks query selects `finished_at` and the figures pass
  through.
- **Gate:** `npm run tc`, `npx vitest run`, `npm run test:db:artaskfinished` and
  `npm run test:db:areventtasks` (a local database; the run is in a rolled-back transaction),
  `prettier --check` on the touched files. E2E: written, **SKIPPED** (not run locally, by
  instruction).

## 6. Files

**Counted: 4 files** (limit 10): the migration, `utils/invoiceView.ts`,
`hooks/useInvoiceData.ts`, `components/TaskHistoryTable.tsx`. **Not counted:** the tests, the SQL
tests, the Playwright specs and fixtures, `database.types.ts`, `AppSchema.ts`,
`components/invoiceFixtures.ts`, `package.json`. No sync-rule change.

## 7. Edge cases and error handling

- **A task closed offline:** its Finished at is a dash until the upload is processed and the
  stamped row comes back (D1). Nothing is lost; the time is the server's.
- **The nightly run** closes many tasks in one transaction: they share one finish moment.
- **A closed task from before the change:** a dash for good (D2); it never gets a time later.
- **The day boundary:** a task closed at 23:30 in Toronto is that Toronto day even if UTC has
  already turned; the label is computed in the office's zone.
- **A finish moment in the future** (clock differences): shown as its own date.
- **A text that does not parse** as a date: a dash, never an error.
- **The column does not reach a device** (the PowerSync note in §2): closed rows show a dash;
  nothing breaks; redeploying the sync rules fixes it.

## 8. Out of scope

- Filling the old tasks (decided: no); a tooltip with the exact time; sorting by finish time;
  who closed the task; editing `finished_at`.
- Deleting a task (19). The Task History order and the Open tag are as spec 13 built them.
