# Accountant Collections 23: the Full amount / Deposits / All switch

Status: **Draft**, written 2026-11-11, waiting for "Approved". 0 open decisions (one answered,
§1); readings to confirm in §1.
Build order: **23**. Needs: [07](accountant-collections-07-collections-list.md),
[09](accountant-collections-09-design.md), [10](accountant-collections-10-prev-next.md). Needed
by: none. Branch: `q4-sprint3-finance`.

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

- **A toggle button on the Collections tab** with three values, **Full amount**, **Deposits**
  and **All**. When the page opens it shows **Full amount**; each click goes to the next one:
  Full amount, then Deposits, then All (and then Full amount again).
- **Another value opens first only when the address says so:** a link whose query carries
  another `type`.
- **The address carries the value:** `type=full`, `type=deposits`, `type=all`.
- **All** shows the full list, as the page does today.
- **Full amount** shows only the events whose overdue payment equals the quote's amount; the
  user's four events (the same four for Deposits):
  1. Event A has a payment schedule of three payments; two of the three are overdue, the third
     is not overdue and is due in a week. A is **not** in the Full amount list.
  2. Event B has a payment schedule of three payments; all three are overdue. B **is** in the
     list.
  3. Event C has no payment schedule; the full payment has not been made, but the event starts
     in 14 days. C is **not** in the list: it is not considered overdue.
  4. Event D has no payment schedule; it has not been paid in full and the event starts in 7
     days. D **is** in the list: it is considered overdue.
- **Deposits** shows only the events whose overdue payment does not equal the quote's amount:
  A **is** in the list; B is **not**; C is **not** (not overdue); D is **not** in the list,
  although it is considered overdue.
- **What is overdue is unchanged** (the rules of specs 04, 07 and 11): a payment of the schedule
  that had to be paid today or earlier and is unpaid, or, with no schedule, a quote not fully
  paid 7 days before the event starts.
- **The place and the look of the button** are the design's (`Main.dc.html`, README): left of
  Show Not Due Yet, one button that steps through its values on every click (like the status
  button on `/quotes-bookings`), its label and colour showing the current one.

**Decision taken by the user (asked, 2026-11-11):**

- **D1 What "equals the quote's amount" means once some money has been paid.** Asked with the
  case: a $1,000 quote, all three payments of the schedule overdue, $100 already paid on the
  first, so Amount Overdue shows $900. The user's answer: "full amount, because that is the
  amount that is missing to full payment; even if the first payment were fully paid and the other
  two not, it must also be Full. So Full is for events that owe up to the full payment; Deposits
  is for those that must pay but not the whole invoice amount." So the comparison is not with the
  quote's total but with **what is still to be paid.**

**Replaces in spec 07:** the list state (`csort`, `cdir`, `cnotdue`) gains `type`, and the list
gains a second filter. **In spec 09:** the tab's body (Show Not Due Yet alone) gains the button.
**In spec 10:** "only the three list parameters are carried" becomes four (`type` too), and "the
default state is an empty object" no longer holds for `type` (it is always written, below).

**The first view changes.** Until now the tab opened on the whole list; now it opens on Full
amount, so an event that has an overdue payment while a later one is not yet due is not shown
until the accountant clicks to Deposits or All. That is what the request says.

**Readings to confirm at review:**

- **The rule in the page's own figures** (`computeCollectionsBalances`, the twin of the SQL):
  **Full amount** is a row with Amount Due above 0 whose Amount Due equals its Remaining;
  **Deposits** is a row with Amount Due above 0 and below its Remaining; **All** is every row.
  Amount Due is the figure of the Amount Overdue column; Remaining is the quote's total minus
  the payments received, never below 0 (the twin caps Amount Due at Remaining, so "equals" and
  "at least" are the same test). In other words: Full means everything still unpaid is already
  overdue; Deposits means part of what is unpaid is not yet due.
- **The user's events under that rule:** A: Amount Due is the first two payments, Remaining
  includes the third: Deposits. B: all overdue, nothing paid: Full. C: not overdue, so it has
  no row (it never reaches the list in any mode). D: no schedule, inside the 7 days, Amount Due
  equals Remaining: Full, never Deposits. The user's added cases: the first payment paid in
  full and the other two overdue: Full; the first partly paid and all three overdue: Full.
- **A row with Amount Due 0** (an open task the nightly sync has not closed yet) is neither Full
  amount nor Deposits; only All shows it.
- **The address.** `type` is read as `full`, `deposits` or `all`; a missing or any other value
  (including a different case) shows Full amount, and the address is not rewritten on opening.
  A click writes the new value. Unlike `csort`, `cdir` and `cnotdue`, which are left out of the
  address at their initial values, `type` is **always written**, `type=full` included (the
  request says Full adds `type=full`). So every address the list builds, the invoice page's
  links and Back to tasks among them, carries it.
- **Nothing is remembered in the browser.** Opening the page without `type` starts on Full
  amount every time.
- **The switch and Show Not Due Yet work together,** each its own filter: a task due in the
  future that Show Not Due Yet reveals is also Full or Deposits by its own figures.
- **The invoice page follows the mode.** Previous / Next Task walk the list as the mode shows it
  (the same filter and order, spec 10), and Back to tasks returns to the same mode. An invoice
  opened by a link whose mode does not contain its event has both Previous and Next dimmed (the
  rule of spec 10 for an event outside the list).
- **Look (the design's, which the author drew and said only the place matters):** 36 px high,
  8 px radius, bold white 14 px text, a light shadow, the Lucide `ListFilter` icon and the label.
  Full amount `linear-gradient(to right, #2f6fb8, #1d62a3)`, Deposits `#0e7f61` to `#0b6e55`,
  All `#6b7280` to `#4b5563`. `title` "Click to show Deposits" (the next value);
  `aria-label` "Showing: Full amount. Click to switch to Deposits.".
- **The empty list says the same words in every mode** ("No tasks to follow up").
- **The sort and the Amount Overdue column are unchanged;** the AR Deposits tab, which has a
  similar name, is not touched.
- **The permissions matrix** gets the switch in the Collections description (§3); no role gains
  access to anything new.

## 2. Research findings

- **The list's state** (`utils/collectionsListState.ts`):
  `CollectionsListState { sort, dir, showNotDue }`, `DEFAULT_LIST_STATE`, the parameter names
  `csort`, `cdir`, `cnotdue` (own names because `useListPageState` owns `tab`, `sort`, `page`,
  `q` and the filters and keeps every parameter it does not know), `parseCollectionsListState`,
  `collectionsListStateToParams` (writes only what differs from the initial state; the initial
  state gives an empty object) and `nextSortState`.
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
  still misses, capped at Remaining); with no schedule it is Remaining from 7 days before
  `event_start`, else 0.
- **The tab** (`components/CollectionsTab.tsx`) draws the Show Not Due Yet switch on the right of
  a `flex justify-end` row and writes the state with `router.replace` through
  `withCollectionsListState`. `useListPageState` has its own parameters (`filterUrlSync.ts`:
  `statuses`, `q`, `page`, `sort`, `tab` and others); none is `type`.
- **Design** (`Main.dc.html`): `cycleMode` steps `full` to `deposits` to `all`; the label, the
  colour, the `title` and the `aria-label` are as in §1. README, the note on the amount button.
- **Tests that pin the old state:** `collectionsListState.test.ts` (the initial state gives an
  empty object), `invoiceUrl.test.ts`, `collectionsSort.test.ts`, `taskNeighbours.test.ts`,
  `CollectionsTab.test.tsx`, and in `InvoicePage.test.tsx` "links to the neighbours, keeping the
  tab and the three list parameters" and "carries only the three list parameters".
- **E2E fixtures:** `createOverdueBooking` makes a booked event with no schedule, a start in 3
  days, one $1,000 line and an open task: Amount Due equals Remaining, a Full event. The
  existing Collections scenarios therefore still see their rows on the opening view. A schedule
  and a payment need new helpers.

## 3. Design

All under `src/features/accountantCollections/` unless stated.

- **`utils/collectionsListState.ts`** (changed):
  `CollectionsAmountType = "full" | "deposits" | "all"`; `AMOUNT_TYPES` in click order;
  `CollectionsListState.type`; the initial state's `type` is `"full"`; the parameter name
  `type`; `parseCollectionsListState` reads it (exact lower-case match, else `"full"`);
  `collectionsListStateToParams` always writes `type` and still leaves the other three out at
  their initial values; `nextAmountType(type)` steps full, deposits, all, full. The doc comment
  says which parameters are always written.
- **`utils/collectionsRows.ts`** (changed): `CollectionsRow` gains `remainingCents`, from
  `balances.remainingCents`.
- **`utils/collectionsSort.ts`** (changed): `amountTypeOf(row)` returns `"full"`, `"deposits"` or
  `null` by the rule of §1; `filterCollectionsRows` applies the type after Show Not Due Yet:
  `all` keeps every row, `full` and `deposits` keep the rows of that type.
- **`utils/invoiceUrl.ts`** (changed): the `LIST_PARAMS` call passes a `type`; the doc comment
  lists four parameters.
- **`components/AmountTypeButton.tsx`** (new): `AmountTypeButton({ type, onChange })`: the button
  of §1 (label, colour, icon, `title`, `aria-label`); a click calls
  `onChange(nextAmountType(type))`. The labels and colours are constants of the file.
- **`components/CollectionsTab.tsx`** (changed): draws the button before the Show Not Due Yet
  switch in the same row (`gap-x-6`, wrapping) and writes the new state with the existing
  `update`.
- **`src/features/userAccess/permissionPageData.ts`** (changed): in the Collections description
  "with Show Not Due Yet and sorting" becomes "with a Full amount / Deposits / All switch, Show
  Not Due Yet and sorting". Levels and notes stay.
- **E2E fixtures:** `addInstallments(eventId, [{ dueInDays, percentageBps }])` and
  `addPayment(eventId, amountCents)` in `e2e/helpers/collectionsFixtures.ts` (service-role
  inserts into `PaymentInstallments` and `PaymentHistory`).
- **Not changed in code:** `InvoicePage.tsx`, `hooks/useTaskNeighbours.ts`,
  `utils/taskNeighbours.ts`, `hooks/useCollectionsData.ts`: they read the state from the address
  and call the shared filter, so they follow by themselves (their tests change, §5).

## 4. Behaviour scenarios

Playwright, written, **not run**. Roles: accountant, admin. S72 to S78.

- **S72** The tab opens on Full amount (the button says so) with no `type` in the address; an
  event with an overdue payment and a later one not yet due is not listed, an event with
  everything overdue and nothing paid is.
- **S73** Clicking steps Full amount, Deposits, All, Full amount again; the address becomes
  `type=deposits`, `type=all`, `type=full`; the label and colour follow; the list follows.
- **S74** Opening with `type=deposits` shows Deposits, `type=all` shows All, and an unknown value
  shows Full amount.
- **S75** The user's events A, B and D are listed or not by mode as in §1 (C has no row at all).
- **S76** Money received: all payments overdue and a part of the first paid: Full amount; the
  first paid in full and the others overdue: Full amount; one payment not yet due: Deposits.
- **S77** From the Deposits list an invoice is opened; Back to tasks returns to `type=deposits`;
  Previous / Next Task walk only the Deposits list.
- **S78** With Show Not Due Yet on, a not-due task appears only in the mode its figures belong
  to, and in All.

## 5. Tests

Red first.

- **`collectionsSort.test.ts`:** `amountTypeOf` for the user's cases: A (Deposits), B (Full), D
  (Full), a part of the first paid with all overdue (Full), the first paid in full with the rest
  overdue (Full), Amount Due 0 (null), Amount Due and Remaining both 0 (null), a payment ahead
  that leaves only overdue money (Full); `filterCollectionsRows` for every type with Show Not Due
  Yet on and off.
- **`collectionsRows.test.ts`:** rows carry `remainingCents`.
- **`collectionsListState.test.ts`:** parsing (missing, each value, unknown, a different case);
  the parameters (`type` always written, the others left out at their initial values);
  `nextAmountType` cycles through all three; the round trip through the address.
- **`invoiceUrl.test.ts`:** `invoiceHref` and `collectionsHref` carry `type`;
  `withCollectionsListState` replaces an old `type` and keeps every other parameter.
- **`taskNeighbours.test.ts`:** `orderedEventIds` honours the type.
- **`AmountTypeButton.test.tsx`:** label, `title`, `aria-label` and colour for each value; the
  next value named in the `title`.
- **`CollectionsTab.test.tsx`:** the button stands before the Show Not Due Yet switch; with no
  `type` the rows are the Full ones.
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

- **A row that moves between modes while the page is open:** at midnight an installment can fall
  due, or a payment can arrive; the list is reactive, so the row changes mode on its own. The
  invoice page's neighbours stay fixed from when it opened (spec 10).
- **A payment made ahead** on a later installment lowers Remaining; if what is left is all
  overdue the event becomes Full.
- **A schedule whose percentages do not total 100%** (old data; the form now refuses it) can
  leave Amount Due a few cents or more away from Remaining even when everything is due; such an
  event reads as Deposits. Not corrected here.
- **A direct link to an invoice** with a `type` that does not contain its event: both Previous
  and Next are dimmed.
- **An unknown or differently cased `type`** shows Full amount and is left in the address.
- **Currencies:** both figures of a row are in the event's own currency, so they compare
  directly.
- **Loading and errors:** the list's loading and error lines are as before; the button is drawn
  throughout.

## 8. Out of scope

- Counts on the button, remembering the mode in the browser, a mode on the AR Deposits tab,
  different empty-list words per mode, a mode switch on the invoice page.
- The Amount Overdue column, the sort, how tasks are created (specs 04, 07, 11).
