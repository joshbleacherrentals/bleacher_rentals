# Accountant Collections 23: the Collections / Deposits / All switch

Status: **Draft**, rewritten 2026-11-11 after the author's amendment of the same day, waiting for
"Approved". 0 open decisions (four answered, §1).
Build order: **23, after 24**. Needs: [07](accountant-collections-07-collections-list.md),
[09](accountant-collections-09-design.md), [10](accountant-collections-10-prev-next.md),
[24](accountant-collections-24-no-schedule-due-on-start-day.md). Needed by: none. Branch:
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

- **A toggle button on the Collections tab** with three values, **Collections**, **Deposits**
  and **All** (the first was called Full amount until 2026-11-11). When the page opens it shows
  **Collections**; each click goes to the next one: Collections, then Deposits, then All (and
  then Collections again).
- **Another value opens first only when the address says so:** a link whose query carries
  another `type`.
- **All** shows the full list, as the page does today; its address carries `type=all`.
- **Collections** shows only the events whose overdue amount equals what is missing to the full
  payment of the quote. The user's five events (the letters are the user's; in the Deposits list
  below they name other events):
  1. Event A has a payment schedule of three payments. The first is paid, the second has been
     overdue for a week, the third becomes overdue today. A **is** in Collections: it is overdue
     and the overdue amount is what is missing to the full payment.
  2. Event B has no payment schedule and an unpaid amount N. B enters Collections only when its
     `event_start_date` is today and the amount missing to the full payment is still unpaid.
  3. Event C has no payment schedule and an unpaid amount N, and starts in five days. C is
     **not** in Collections.
  4. Event D has a payment schedule of three payments. The first is paid, the second has been
     overdue for a week, the third becomes overdue only in a week. D is **not** in Collections.
  5. Event E has a payment schedule of one payment. The payment is overdue today and the event
     starts in five days. E **is** in Collections: it is overdue and the overdue amount is what
     is missing to the full payment.
- **Deposits** shows only the events whose overdue amount is above 0 and less than what is
  missing to the full payment. Collections and Deposits do not overlap. The user's four events:
  1. Event A has a payment schedule of three payments. The first is paid, the second has been
     overdue for a week, the third becomes overdue only in a week. A is **only** in Deposits.
     (The user's first wording said "collections" here and was corrected to Deposits, D2.)
  2. Event B has a payment schedule of three payments and all three are overdue. B is **not**
     in Deposits: it goes to Collections.
  3. Event C has no payment schedule, is not paid in full and starts in 14 days. C is **not**
     in the list: it is not considered overdue.
  4. Event D has no payment schedule, is not paid in full and starts in 7 days. D is **not** in
     the list: it is not considered overdue.
- **When a payment is overdue** is the rule of spec 24: an event with no payment schedule is
  overdue from its start day, not 7 days before it; an event with a schedule is overdue by the
  dates of its schedule. The user's note on two events that are identical but for the schedule
  (one is in Collections and the other is not, and that is intended) is in spec 24, §1.

**Decisions taken by the user (asked, 2026-11-11):**

- **D1 What "equals what is missing" means once some money has been paid** (first round). Asked
  with the case: a $1,000 quote, all three payments of the schedule overdue, $100 already paid
  on the first, so Amount Overdue shows $900. The user's answer: "full amount, because that is
  the amount that is missing to full payment; even if the first payment were fully paid and the
  other two not, it must also be Full. So Full is for events that owe up to the full payment;
  Deposits is for those that must pay but not the whole invoice amount." So the comparison is
  not with the quote's total but with **what is still to be paid.**
- **D2 What Deposits is** (second round). Asked because the text said "not equal to the quote's
  amount" for Deposits but "equals what is missing" for Collections, and one Deposits example
  said "collections". The user's answer: Deposits is an overdue amount above 0 and less than
  what is missing to the full payment; Collections and Deposits do not overlap; Deposits example
  1 is only in Deposits.
- **D3 The address.** Asked: write `type` always, or leave the first value out. The user's
  answer: the default is not written. Collections is the address without `type`; Deposits
  writes `type=deposits` and All writes `type=all`; going back to Collections removes `type`.
- **D4 The invoice page follows the type.** Previous / Next Task walk only the events of the
  chosen type and Back to tasks returns to the same type (as Show Not Due Yet already does,
  spec 10).

**The rule in the page's own figures.** These are the user's words put into the names the code
uses, not a new rule. Amount Due is the figure of the Amount Overdue column; Remaining is the
quote's total minus the payments received, never below 0 (D1).

- **Collections:** a row with Amount Due above 0 whose Amount Due equals its Remaining. The
  calculation caps Amount Due at Remaining, so "equals" and "at least" are the same test.
- **Deposits:** a row with Amount Due above 0 and below its Remaining.
- **All:** every row.
- A row with Amount Due 0 (an open task that the nightly sync has not closed yet) belongs to no
  type, because the request's list holds the events with an overdue payment; only All shows it.

**Replaces in spec 07:** the list state (`csort`, `cdir`, `cnotdue`) gains `type`, and the list
gains a second filter. **In spec 09:** the tab's body (Show Not Due Yet alone) gains the button.
**In spec 10:** "only the three list parameters are carried" becomes four (`type` too); "the
default state is an empty object" still holds, because the default `type` is left out like the
other three.

**The first view changes.** Until now the tab opened on the whole list; now it opens on
Collections, so an event whose overdue amount is below what is missing (a Deposits event) is not
shown until the accountant clicks to Deposits or All, and neither is a row with Amount Due 0.
That is what the request says.

**What the request and the code's own conventions already fix:**

- **An unknown `type`** reads as Collections, as an unknown `csort` or `cdir` reads as theirs
  (`parseCollectionsListState`); the address is left as it is.
- **Nothing is remembered in the browser.** Opening the page without `type` starts on
  Collections every time.
- **The switch and Show Not Due Yet work together,** each its own filter: Show Not Due Yet keeps
  or drops the tasks whose follow-up date is in the future, as now, and the type keeps the rows
  of its type. A not-due task that Show Not Due Yet reveals is also Collections or Deposits by
  its own figures.
- **Look** (the design's `Main.dc.html`, where the author said only the place matters): left of
  Show Not Due Yet, one button that steps through its values on every click (like the status
  button on `/quotes-bookings`), its label and colour showing the current one: 36 px high, 8 px
  radius, bold white 14 px text, a light shadow, the Lucide `ListFilter` icon and the label. The
  colours stay with their place in the cycle: Collections
  `linear-gradient(to right, #2f6fb8, #1d62a3)`, Deposits `#0e7f61` to `#0b6e55`, All `#6b7280`
  to `#4b5563`. `title` "Click to show Deposits" (the next value); `aria-label` "Showing:
  Collections. Click to switch to Deposits.". The design and its README still say Full amount;
  the new name wins and the design files are not edited.
- **The empty list says the same words in every type** ("No tasks to follow up"). The sort and
  the Amount Overdue column are unchanged; the AR Deposits tab, which has a similar name, is not
  touched.
- **The permissions matrix** gets the switch in the Collections description (§3); no role gains
  access to anything new.

## 2. Research findings

- **The list's state** (`utils/collectionsListState.ts`):
  `CollectionsListState { sort, dir, showNotDue }`, `DEFAULT_LIST_STATE`, the parameter names
  `csort`, `cdir`, `cnotdue` (own names because `useListPageState` owns `tab`, `sort`, `page`,
  `q` and the filters and keeps every parameter it does not know), `parseCollectionsListState`
  (a missing or unknown value is that field's default), `collectionsListStateToParams` (writes
  only what differs from the default; the default state gives an empty object) and
  `nextSortState`.
- **The links** (`utils/invoiceUrl.ts`): `invoiceHref` and `collectionsHref` spread
  `collectionsListStateToParams`; `withCollectionsListState` clears `LIST_PARAMS`, which is
  `Object.keys(collectionsListStateToParams({ sort: "overdue", dir: "desc", showNotDue: true }))`,
  then writes the state's parameters.
- **The filter** (`utils/collectionsSort.ts`): `filterCollectionsRows(rows, state, today)` keeps
  rows due today or earlier unless `showNotDue`; `utils/taskNeighbours.ts` (`orderedEventIds`)
  calls the same two functions, so the neighbours follow whatever the filter learns.
- **The rows** (`utils/collectionsRows.ts`): `CollectionsRow` has `amountDueCents` and
  `daysOverdue` from `computeCollectionsBalances`, which also returns `remainingCents` and
  `totalCents`; the row does not keep them.
- **The figures** (`utils/collectionsBalances.ts`): with a schedule, Amount Due is
  `overdueOwedCents` of `computeAmountDue` (each installment that is due contributes the part it
  still misses, capped at Remaining); with no schedule it is Remaining from the start day, else
  0 (spec 24 moves the day from 7 days before `event_start` to `event_start`).
- **The tab** (`components/CollectionsTab.tsx`) draws the Show Not Due Yet switch on the right of
  a `flex justify-end` row and writes the state with `router.replace` through
  `withCollectionsListState`. `useListPageState` has its own parameters (`filterUrlSync.ts`:
  `statuses`, `q`, `page`, `sort`, `tab` and others); none is `type`.
- **Design** (`Main.dc.html`): `cycleMode` steps `full` to `deposits` to `all`; the label, the
  colour, the `title` and the `aria-label` are as in §1 (the design's names are the old ones).
  README, the note on the amount button.
- **Tests that pin the old state:** `collectionsListState.test.ts`, `invoiceUrl.test.ts`,
  `collectionsSort.test.ts`, `taskNeighbours.test.ts`, `CollectionsTab.test.tsx`, and in
  `InvoicePage.test.tsx` "links to the neighbours, keeping the tab and the three list
  parameters" and "carries only the three list parameters".
- **E2E fixtures:** `createOverdueBooking` makes a booked event with no schedule, one $1,000 line
  and an open task. After spec 24 it starts today, so its Amount Due equals its Remaining: a
  Collections event, and the existing Collections scenarios still see their rows on the opening
  view. Spec 24 also adds `addInstallments` and the `startInDays` option; a payment needs a new
  helper here.

## 3. Design

All under `src/features/accountantCollections/` unless stated.

- **`utils/collectionsListState.ts`** (changed):
  `CollectionsAmountType = "collections" | "deposits" | "all"`; `AMOUNT_TYPES` in click order;
  `CollectionsListState.type`; the initial state's `type` is `"collections"`; the parameter name
  `type`; `parseCollectionsListState` reads it (exact lower-case match, else `"collections"`);
  `collectionsListStateToParams` writes `type` only when it is not `"collections"`, like the
  other three, so the default state is still an empty object; `nextAmountType(type)` steps
  collections, deposits, all, collections. The doc comment lists four parameters.
- **`utils/collectionsRows.ts`** (changed): `CollectionsRow` gains `remainingCents`, from
  `balances.remainingCents`.
- **`utils/collectionsSort.ts`** (changed): `amountTypeOf(row)` returns `"collections"`,
  `"deposits"` or `null` by the rule of §1; `filterCollectionsRows` applies the type after Show
  Not Due Yet: `all` keeps every row, `collections` and `deposits` keep the rows of that type.
- **`utils/invoiceUrl.ts`** (changed): the `LIST_PARAMS` call passes `type: "all"`, a value that
  differs from the default, so that the key is in the list; the doc comment lists four
  parameters.
- **`components/AmountTypeButton.tsx`** (new): `AmountTypeButton({ type, onChange })`: the button
  of §1 (label, colour, icon, `title`, `aria-label`); a click calls
  `onChange(nextAmountType(type))`. The labels and colours are constants of the file.
- **`components/CollectionsTab.tsx`** (changed): draws the button before the Show Not Due Yet
  switch in the same row (`gap-x-6`, wrapping) and writes the new state with the existing
  `update`.
- **`src/features/userAccess/permissionPageData.ts`** (changed): in the Collections description
  "with Show Not Due Yet and sorting" becomes "with a Collections / Deposits / All switch, Show
  Not Due Yet and sorting". Levels and notes stay.
- **E2E fixtures:** `addPayment(eventId, amountCents)` in `e2e/helpers/collectionsFixtures.ts`
  (a service-role insert into `PaymentHistory`). `addInstallments` and the `startInDays` option
  of `createOverdueBooking` come from spec 24, which is built first.
- **Not changed in code:** `InvoicePage.tsx`, `hooks/useTaskNeighbours.ts`,
  `utils/taskNeighbours.ts`, `hooks/useCollectionsData.ts`: they read the state from the address
  and call the shared filter, so they follow by themselves (their tests change, §5).

## 4. Behaviour scenarios

Playwright, written, **not run**. Roles: accountant, admin. S72 to S78. The events are the
user's (§1), with the letters of the list they are in.

- **S72** The tab opens on Collections (the button says so) with no `type` in the address.
  Collections A (a schedule of three, the first paid, the second and third overdue) and
  Collections E (a schedule of one, overdue today, the event starts in five days) are listed;
  Collections D (the third not yet due) is not.
- **S73** Clicking steps Collections, Deposits, All, Collections again; the address becomes
  `type=deposits`, `type=all`, then has no `type`; the label and colour follow; the list
  follows.
- **S74** Opening with `type=deposits` shows Deposits, `type=all` shows All, `type=collections`
  shows Collections, and an unknown value shows Collections.
- **S75** Deposits A (the first paid, the second overdue, the third in a week) is listed under
  Deposits and not under Collections; Deposits B (all three overdue) is listed under Collections
  and not under Deposits.
- **S76** Money received: all three payments overdue and a part of the first paid: Collections;
  the first paid in full and the other two overdue: Collections; one payment not yet due:
  Deposits.
- **S77** From the Deposits list an invoice is opened; Back to tasks returns to
  `type=deposits`; Previous / Next Task walk only the Deposits list.
- **S78** With Show Not Due Yet on, a not-due task appears only in the type its figures belong
  to, and in All.

## 5. Tests

Red first.

- **`collectionsSort.test.ts`:** `amountTypeOf` for the user's events in the page's figures:
  Collections A (Amount Due equals Remaining), B on its start day (Amount Due equals Remaining),
  E (one payment), D (the second overdue, the third not: Deposits), Deposits A (the same
  figures), Deposits B (all overdue: Collections), a part of the first paid with all overdue
  (Collections), the first paid in full with the rest overdue (Collections), Amount Due 0
  (null), Amount Due and Remaining both 0 (null), a payment ahead that leaves only overdue money
  (Collections), a schedule under 100% (Deposits); `filterCollectionsRows` for every type with
  Show Not Due Yet on and off.
- **`collectionsRows.test.ts`:** rows carry `remainingCents`.
- **`collectionsListState.test.ts`:** parsing (missing, each value, unknown, a different case);
  the parameters (`type` written for Deposits and All, left out for Collections, the other
  three as before, the default state still an empty object); `nextAmountType` cycles through all
  three; the round trip through the address.
- **`invoiceUrl.test.ts`:** `invoiceHref` and `collectionsHref` carry `type` when it is not
  Collections; `withCollectionsListState` replaces an old `type`, removes it when the new state
  is Collections, and keeps every other parameter.
- **`taskNeighbours.test.ts`:** `orderedEventIds` honours the type.
- **`AmountTypeButton.test.tsx`:** label, `title`, `aria-label` and colour for each value; the
  next value named in the `title`.
- **`CollectionsTab.test.tsx`:** the button stands before the Show Not Due Yet switch; with no
  `type` the rows are the Collections ones.
- **`InvoicePage.test.tsx`:** the neighbour links and Back to tasks carry `type`; the two tests
  that say "three list parameters" are rewritten for four.
- **`permissionPageData.test.ts`:** the changed sentence.
- **Gate:** `npm run tc`, `npx vitest run`, `prettier --check` on the touched files. E2E:
  written, **SKIPPED** (not run locally, by instruction).

## 6. Files

**Counted: 6 files** (limit 10): `utils/collectionsListState.ts`, `utils/collectionsRows.ts`,
`utils/collectionsSort.ts`, `utils/invoiceUrl.ts`, `components/AmountTypeButton.tsx`,
`components/CollectionsTab.tsx`. **Not counted:** the tests, the Playwright specs and fixtures,
`permissionPageData.ts`. Nothing in the database, the sync rules or `AppSchema.ts`.

## 7. Edge cases and error handling

- **A row that moves between types while the page is open:** at midnight an installment can fall
  due, or a payment can arrive; the list is reactive, so the row changes type on its own. The
  invoice page's neighbours stay fixed from when it opened (spec 10).
- **A payment made ahead** on a later installment lowers Remaining; if what is left is all
  overdue the event becomes a Collections event.
- **A schedule whose percentages do not total 100%** (old data; the form now refuses it): if it
  totals less, the overdue amount stays below what is missing even when every payment is
  overdue, so the event is in Deposits; if it totals more, Amount Due is capped at Remaining and
  the event is in Collections. Both follow from the rule.
- **A direct link to an invoice** with a `type` that does not contain its event: both Previous
  and Next are dimmed (the rule of spec 10 for an event outside the list).
- **An unknown or differently cased `type`** shows Collections and is left in the address.
  `type=collections` typed by hand also shows Collections; the next click writes the new state,
  and for Collections that is no `type`.
- **Currencies:** both figures of a row are in the event's own currency, so they compare
  directly.
- **Loading and errors:** the list's loading and error lines are as before; the button is drawn
  throughout.

## 8. Out of scope

- Counts on the button, remembering the type in the browser, a type on the AR Deposits tab,
  different empty-list words per type, a type switch on the invoice page.
- The Amount Overdue column, the sort, how tasks are created (specs 04, 07, 11); the overdue
  rule is spec 24.
- The status chip in the invoice header: it says Collections for every booked event with an
  overdue amount, including the events the Deposits list shows. Not changed here; no change was
  asked.
- The design files and their README, which still say Full amount.
