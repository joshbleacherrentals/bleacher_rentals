# Accountant Collections 24: an event with no payment schedule is overdue from its start day

Status: **Draft**, written 2026-11-11, waiting for "Approved". 0 open decisions (two answered,
§1).
Build order: **24, before 23**. Needs: [02](accountant-collections-02-sql-amount-due.md),
[03](accountant-collections-03-ts-twin-and-parity.md),
[11](accountant-collections-11-task-sync.md). Needed by:
[23](accountant-collections-23-amount-type-switch.md). Branch: `q4-sprint3-finance`.

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

- **An event with no payment schedule is overdue only from the day it starts.** Its unpaid amount
  (what is missing to the full payment) becomes overdue on its `event_start`, and not before.
  Today it becomes overdue 7 days before the start; that changes.
- **An event with a payment schedule is overdue by the dates of its schedule,** as now. Its start
  date does not matter to it.
- **The user's note on two events.** Event A has a payment schedule of one payment, overdue
  today, and the event starts in 5 days: it **is** in Collections. Event B has no payment
  schedule and the event starts in 5 days: it is **not**. The two can be identical in everything
  else, and one is in Collections while the other is not, because one becomes overdue by the
  date of its payment schedule and the other by the start date of the event. This is the correct,
  intended behaviour, and it is a test (S80).

**Decisions taken by the user (asked, 2026-11-11):**

- **D1 From when the days count.** The unpaid amount of an event with no schedule is overdue
  from `event_start` and stays overdue until it is paid (the same as today after the 7-day mark;
  only the threshold moves, from 7 days before the start to 0). Its Days Overdue count from
  `event_start`, always. The booking day (`booked_at`) is no longer used. (The other option was
  the later of the start day and the booking day, which is how the 7-day rule counts now.)
- **D2 The open tasks that the new rule makes not overdue** are closed by the migration, at
  once. (The other option was to leave them to the nightly sync.) They are not deleted: they stay
  in Task History as closed, and the trigger of spec 18 stamps their Finished at with the moment
  of the migration.

**Replaces in earlier specs** (they are not edited). Specs 01 to 11 repeat the point "Event with
no payment schedule. Its whole balance falls due 7 days before `event_start`. An event booked
inside those 7 days is overdue at once. Days overdue count from 7 days before `event_start`;
for an event booked inside those 7 days, from `booked_at`." Here it becomes: the balance falls
due on `event_start`, days overdue count from `event_start`, and `booked_at` is not used. The same
change in the places that carry the rule's numbers:

- spec 02: the SQL branch and the reading of "created 0 to 7 days before the start";
- spec 03: the twin's formula (`event_start` minus 7 days) and its hand cases;
- spec 04: "an event starting in 7 days is picked up; in 8 days is not";
- spec 11: "`event_start` moved inside 7 days on an event with no schedule", in its list of the
  changes that create a task.

## 2. Research findings

- **Where the rule is.** Two copies, both for Collections only: `ar_event_balances` in
  `supabase/migrations/20261030130000_ar_amount_due.sql` (the line
  `IF v_start - 7 <= p_today THEN`) and its TypeScript twin `computeCollectionsBalances` in
  `utils/collectionsBalances.ts` (the constant `NO_SCHEDULE_DUE_DAYS_BEFORE_START`, which is 7).
  The AR tabs and the public Pay tab keep `computeAmountDue` and have no such rule.
- **Who reads it.** In SQL, `ar_event_amount_due` is called by `ar_sync_event_tasks`
  (`20261031120000_ar_task_sync.sql`, spec 11): Amount Due above 0 creates the event's open task,
  Amount Due 0 completes its open tasks. The nightly job `ar_sync_all_event_tasks` (00:20 or
  01:20 in Toronto) and four deferred triggers (on `PaymentHistory`, `PaymentInstallments`,
  `EventLineItems` and `Events`) call it, so the rule decides when a task is created and when it
  is closed. In TypeScript the twin feeds `buildCollectionsRows` (the list), `useInvoiceData`
  (the invoice page) and `invoiceStatus` (the header chip).
- **Days overdue** (`findOverdueSince` in the twin): for an event with no schedule, the later of
  7 days before the start and the booking day (`booked_at`), or null when that day is in the
  future. The SQL returns four numbers and has no day count.
- **`booked_at`** is an input of the twin (`event.booked_at`), passed by `collectionsRows.ts`
  and `useInvoiceData.ts` and selected by `useCollectionsData.ts`. The SQL never reads it. After
  this spec nothing reads it for the figures.
- **The deploy.** Under the old rule a booked event with no schedule that starts in 1 to 7 days
  owes its whole balance and has an open task. Under the new rule its Amount Due is 0, so the
  rule of spec 11 completes that task on the next nightly run or on the next change of the
  event. The production database was not looked at: how many such tasks exist is unknown.
- **The shared cases** (`utils/amountDueCases.ts`): hand cases in the block "No payment
  schedule", and a fuzz generator that takes the twin as its oracle (its `event_start` and
  `booked_at` vary, so its expected numbers follow the twin). `amountDueParity.test.ts` compares
  the generated `supabase/tests/ar_amount_due_parity.test.sql` with the committed file; the
  command that regenerates it is `UPDATE_PARITY=1 npx vitest run amountDueParity`.
- **Tests that pin the old rule:** `collectionsBalances.test.ts` (the blocks "no payment
  schedule" and "overdueSince and daysOverdue"), `collectionsRows.test.ts` ("an event with no
  payment schedule"), `invoiceStatus.test.ts` ("is Collections for an event with no schedule
  that starts in 7 days"), `ar_amount_due.test.sql` ("No payment schedule"),
  `ar_task_sync.test.sql` (the probes `n_7` and `n_8`, "event_start moved inside 7 days" and the
  comment on `st_event`) and the generated parity file. The probe events of
  `ar_task_sync.test.sql` start today by default, which is overdue under both rules.
- **The e2e fixture:** `createOverdueBooking` (`e2e/helpers/collectionsFixtures.ts`) makes a
  booked event with no schedule that starts in 3 days: overdue under the old rule, not under the
  new one. Its users: `collections.accountant.spec.ts`, `collections.admin.spec.ts`,
  `finishedAtTests.ts`, `customerPageViewTests.ts` and `openQiTests.ts`.

## 3. Design

- **`supabase/migrations/20261111140000_ar_no_schedule_due_on_start_day.sql`** (new). It can
  run twice. A migration file is a batch under the Supabase CLI; nothing here needs `BEGIN` and
  `COMMIT`. Two parts, in this order:
  1. `CREATE OR REPLACE FUNCTION public.ar_event_balances(p_event uuid, p_today date)`: the
     function of `20261030130000` word for word, except the branch for no schedule and the
     comments that name the 7 days:

     ```sql
     IF v_n = 0 THEN
       -- No schedule: the whole balance falls due on the day the event starts.
       IF v_start <= p_today THEN
         v_due := v_remaining;
       END IF;
     ELSE
     ```

     A null `v_start` still never compares true. The signature, the return type, `COST 1000`,
     `STABLE`, `SECURITY INVOKER` and `search_path` stay, so `ar_event_amount_due`, the grants
     and the revokes of the old migration stay as they are.

  2. One pass of the closing rule, at once (D2):

     ```sql
     DO $$
     DECLARE
       v_today date := (now() AT TIME ZONE 'America/Toronto')::date;
       v_event uuid;
     BEGIN
       FOR v_event IN
         SELECT DISTINCT t.event_uuid FROM public."ArEventTasks" t WHERE t.completed = false
       LOOP
         PERFORM public.ar_sync_event_tasks(v_event, v_today);
       END LOOP;
     END;
     $$;
     ```

     It visits only the events that already have an open task, so it creates nothing (for such
     an event the insert hits the one-open-task index and does nothing). For each of them
     `ar_sync_event_tasks` completes the open tasks when Amount Due is 0 (or the event is Lost),
     leaves them when Amount Due is above 0, and keeps them for any other status or a deleted
     event (spec 11). It is the work the next nightly run would do for these events; the
     migration only does it at the deploy. Spec 18's trigger stamps `finished_at` of each task it
     completes with the moment of the migration, so they share one moment.

  The header comment states the rule, D1 and D2.

- **`utils/collectionsBalances.ts`** (changed): the constant and the `addDays(start, -7)` go;
  the due date of an event with no schedule is its start date. `amountDueCents` is `remaining`
  when `start <= today` and 0 otherwise (a missing start is still 0). `findOverdueSince` for no
  schedule returns the start date when `start <= today` and null otherwise, and never reads
  `booked_at`. The doc comment says the one rule that exists only here and in the SQL is that an
  event with no payment schedule owes its whole remaining balance from the day `event_start`
  arrives. `booked_at` stays in `CollectionsBalancesInput` and is not read; a comment says so
  (D1).
- **`utils/amountDueCases.ts`** (changed): the block "No payment schedule" is rewritten for the
  new rule (§5). The fuzz generator stays; `bookedAt` stays in the cases and is ignored by both
  sides.
- **`supabase/tests/ar_amount_due_parity.test.sql`:** regenerated, not edited by hand.
- **SQL tests:** `ar_amount_due.test.sql` and `ar_task_sync.test.sql` (changed, §5).
- **E2E fixtures** (`e2e/helpers/collectionsFixtures.ts`): `createOverdueBooking` starts the
  event today (`event_start` today, `event_end` tomorrow) and takes an optional `startInDays`
  (default 0). New `addInstallments(eventId, [{ dueInDays, percentageBps }])` (a service-role
  insert into `PaymentInstallments`), used by S80 here and by spec 23.
- **Not changed:** `database.types.ts`, `AppSchema.ts` and the sync rules (no column and no
  signature changes), `permissionPageData.ts` (no role gains or loses anything; the Collections
  list shows fewer rows in the 7 days before an event with no schedule, to the same people), the
  nightly job's time, the triggers.

## 4. Behaviour scenarios

Playwright, written, **not run**. Roles: accountant, admin: the scenarios are written once in
`e2e/helpers/startDayTests.ts` and run by `startDay.accountant.spec.ts` and
`startDay.admin.spec.ts`, as specs 17 and 18 did. S79 to S83. Every existing scenario that uses
`createOverdueBooking` keeps its row, because the helper now starts the event today.

- **S79** An event with no schedule that starts in 5 days is not in the Collections list (the
  user's event B): no row, no task.
- **S80** The user's two events: A (a schedule of one payment due today, the event starts in 5
  days) is in the list with its whole unpaid amount as Amount Overdue; B (no schedule, the event
  starts in 5 days) is not.
- **S81** An event with no schedule that starts today is in the list with the whole unpaid
  amount as Amount Overdue, and its Payment Overdue says Due today.
- **S82** An event with no schedule that started 3 days ago is in the list and its Payment
  Overdue shows 3 days (D1: counted from the start day).
- **S83** The invoice page of an event with no schedule that starts in 5 days (opened by its
  address) shows the status Schedule and no days overdue; the page of one that starts today shows
  the status Collections.

## 5. Tests

Red first.

- **`collectionsBalances.test.ts`:** the block "no payment schedule": a start today owes the
  whole remaining balance; a start tomorrow, in 7 days and in 8 days owes nothing; an event that
  already started owes it; a part payment leaves only what is left from the start day, and 0
  before it; the date part of a timestamp-shaped start (today as `T00:00:00` is due, tomorrow is
  not); a missing start owes nothing. The block "overdueSince and daysOverdue": a start 3 days
  ago counts from the start (3 days); a start today gives the start date and 0 days; a start in
  the future gives null and null; a `booked_at` of any value (inside the last days before the
  start, after the start, null, PowerSync's spelling) changes neither number.
- **`collectionsRows.test.ts`:** "an event with no payment schedule": owes everything from the
  start day and counts from there; a `booked_at` after the start is ignored; owes nothing yet
  when the start is in the future, but the row stays.
- **`invoiceStatus.test.ts`:** the case "starts in 7 days" becomes Schedule; a new case "starts
  today" is Collections.
- **`amountDueCases.ts` and `amountDueParity.test.ts`:** the hand cases of the block "No
  payment schedule" (today in the table is 2026-11-15): start today is due; start tomorrow is
  not; start in 7 days is not (the old boundary, now not due); a booking 2 days before the start
  does not make it due; a part-paid event whose start is today owes what is left; an event that
  already started is overdue; not due yet stays 0 with a balance left; the date comes from the
  caller (the start is tomorrow, `today` is tomorrow, and it is due). The committed parity file
  is regenerated, and the drift test is red until it is.
- **`ar_amount_due.test.sql`:** the same cases for `ar_event_balances`; the plan count follows.
- **`ar_task_sync.test.sql`:** the nightly run skips an event with no schedule that starts in 7
  days (`n_7` becomes a skip) and one that starts tomorrow, and still creates one that starts
  today (the default probe); "event_start moved": 3 days ahead the event has nothing due, moved
  to today it creates the task; a stale open task (an event with no schedule that starts in 3
  days, a task inserted by hand, as the old rule made it): `ar_sync_event_tasks` returns
  `completed`, the task is closed and its `finished_at` is set; the statement of the migration's
  closing pass, copied into the test with a comment that names the migration, closes that task
  and leaves an open task of an event that is overdue. The comment on `st_event` stops saying
  "inside the 7 days".
- **Gate:** `npm run tc`, `npx vitest run`, `npm run test:db:aramountdue`,
  `npm run test:db:aramountdueparity` and `npm run test:db:artasksync` (a local database; each
  runs in a rolled-back transaction, and the new migration goes into the same pipe),
  `prettier --check` on the touched files. E2E: written, **SKIPPED** (not run locally, by
  instruction).

## 6. Files

**Counted: 2 files** (limit 10): the migration and `utils/collectionsBalances.ts`. **Not
counted:** the tests, the shared cases, the generated parity file, the Playwright specs and
fixtures. Nothing in `useInvoiceData.ts`, `collectionsRows.ts` or the sync rules.

## 7. Edge cases and error handling

- **No start date:** the event is never overdue (a null never compares true), as before.
- **A start in the past:** overdue at once, as before; its days count from the start day.
- **An event booked after its start day:** overdue the moment it is booked, and its Days Overdue
  count from the start day (D1), so it can show many days on the day it is booked.
- **The start date is moved:** the sync runs when `Events` changes. Moving the start later makes
  the event not overdue and the sync completes its open task; moving it to today or earlier
  makes it overdue and the sync creates one.
- **An event with a schedule:** unchanged, including the user's note: the same dates, a
  different schedule, a different list (S80).
- **A part payment:** from the start day Amount Due is what is left (Remaining).
- **The deploy:** the migration completes the open tasks of the events that are not overdue
  under the new rule. They stay in Task History as closed, with the deploy day as Finished at;
  nobody is notified. The event gets its task back on the night of its start day (00:20 or
  01:20 in Toronto), or at once if something changes the event that day.
- **Time zones:** the SQL `today` is Toronto's date (spec 11); `event_start` is a calendar date
  with no time zone. Unchanged.
- **A local database made before this migration:** `supabase db reset`.
- **Rolling back:** a new migration that puts `v_start - 7` back. The tasks this migration
  closed come back by themselves, because the old rule makes a task for every event that owes.

## 8. Out of scope

- Removing `booked_at` from the twin's input, from `collectionsRows.ts` and from the two queries
  (`useCollectionsData.ts`, `useInvoiceData.ts`): after this spec nothing reads it for the
  figures, and it is left in place.
- The rule for events with a schedule, the AR tabs and the public Pay tab, a setting for the
  number of days, the nightly job's time, a notice to the accountants about the change,
  reopening the closed tasks.
- The Collections / Deposits / All switch: spec 23.
