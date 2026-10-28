# Accountant Collections 09: all the screens, page access and the permissions matrix

Status: **Draft, written 2026-10-28, waiting for "Approved".** 0 open decisions; readings to
confirm in §1. Build order: **09**. Needs: [06](accountant-collections-06-done-next-task.md),
[07](accountant-collections-07-collections-list.md),
[08](accountant-collections-08-invoice-data.md). Needed by: 10. Branch: `q4-sprint2-collections`.

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

- **The whole design is built:** the seven boards of `docs/design/accountant-collections/`
  (`Main`, `CollectionsNotDue`, `Invoice`, `InvoiceTasks`, `InvoiceTaskModal`,
  `InvoiceTaskPicker`, `Contacts`) and the sketch.
- **Where the design is changed** by the user's answers (the files in `docs/design/` are tool
  output and Prettier skips them; do not edit them, this list is the change):
  1. The Collections table opens sorted by Next Follow Up, oldest first; a click on another column
     sorts it descending (spec 07).
  2. The header of the invoice shows one of **five statuses** (spec 08), in the colours below. The
     Collections list has no Status selector.
  3. **There is no Send Email button.** The design draws one; it is not built.
  4. The Payment History section shows **Edit and Delete on manual rows** and Record payment, as
     the Billing tab does. The design draws no row actions; draw them in the Billing tab's style.
  5. The modal opens with **today + 2 days** and the note **`Follow-up needed`** (spec 06).
  6. The Tasks tab of an event with no open task says **"No open task"** and has no Done / Next
     Task button.
  7. The header shows "N days overdue" only for Collections.
  8. "Back to tasks" returns to `/accountant?tab=collections` with the list's parameters.
- **Status colours:** Paid green, Schedule purple, Collections red, Cancelled grey, Not active yet
  grey. Labels exactly as written.
- **Access:** admin and accountant. `/accountant/invoice` is reached through the existing
  `/accountant` prefix in `accessConfig.ts`, so no role gains or loses a path; the account
  manager, developer, viewer, maintainer and driver cannot open it (a test proves it).
- **The matrix** `permissionPageData.ts` is updated in the same commit (`CLAUDE.md`).

**Readings to confirm at review:**

- The design's hex colours map to the project's Tailwind tokens and fonts (the design uses
  Geist; the app does not). **Schedule's purple is not in the design**: `bg-purple-100
text-purple-800`. Paid is `bg-green-100 text-green-800`, Collections the design's red, the two
  greys `bg-gray-100 text-gray-700`.
- The calendar gets **previous / next month arrows**; the design has none, but a date in the next
  month (today is 29 November, plus 2 days) cannot be reached without them.
- The Collections empty state says "No tasks to follow up".
- The list's table is a table with sortable header buttons (`aria-sort`), a row is a link.
- The invoice page is a centred column of about 1040 px, with the header and tabs sticky, as in
  the design.
- After Record Payment the screen changes through sync: the payment shows at once; the status and
  the closed tasks follow when the server's trigger (spec 05) has run and synced back.
- Previous / Next Task are drawn here but **inactive**; spec 10 connects them.

## 2. Research findings

- **The page:** `src/app/accountant/page.tsx` builds the title, the tab bar, the filter sidebar,
  the search, the count badges and the tab bodies (`AccountsReceivableTabs`, `NeedAttentionTab`);
  `layout.tsx` adds `p-4`. The new tab needs its body, and the filter sidebar, the Filter button,
  search and the active-filter chips must not show on it.
- **Components to use:** `Tabs` (`components/ui/tabs.tsx`), `Dialog` (`ui/dialog.tsx`), `Popover`
  (`ui/popover.tsx`), `Badge` (`ui/badge.tsx`), `InfoTooltip` for the (i) icons,
  `PageHeader`, `DataTable` (check it supports sortable headers and row links; otherwise a table
  with the same classes). There is no calendar component and no `react-day-picker`: build the
  month grid from the design on `Popover`, with no new dependency.
- **Payment dialogs:** `RecordPaymentDialog` (props `open, onOpenChange, eventId, currency,
currencyResolved, installments, defaultPayerName, recordedByUserUuid, today, mode, payment`),
  `PaymentDetailDialog`, `DeletePaymentDialog`, loaded with `dynamic()` in `BillingTab.tsx`;
  reuse its wiring. They are gated by `can.recordPayment`.
- **Errors:** the toast helper used by the upload connector (`createErrorToastNoThrow`).
- **Access:** `accessConfig.ts` lists `/accountant` for `admin` and `accountant`; matching is by
  prefix.
- **The matrix:** the row "Accounts Receivable" (category "Day to Day Operations") is the
  neighbour; `ROLE_DESCRIPTIONS.accountant` is a long sentence list; `permissionPageData.test.ts`
  checks the rows.
- **Tests for roles:** Playwright projects by file suffix (`*.accountant.spec.ts`,
  `*.admin.spec.ts`, `*.am.spec.ts`, `*.viewer.spec.ts`).

## 3. The screens

All under `src/features/accountantCollections/components/` unless stated.

- **`CollectionsTab.tsx`, `CollectionsTable.tsx`:** the Show Not Due Yet switch (a `role="switch"`
  button), the table (Name, Next Follow Up, Payment Overdue, Task Notes, Amount Overdue, a
  chevron), the sort arrows (neutral, ascending, descending), the colours of Next Follow Up
  (past red, today amber and bold, future grey), the loading, error and empty states. Data from
  `useCollectionsData`, `filterCollectionsRows`, `sortCollectionsRows` (spec 07); the state in the
  URL through `parseCollectionsListState` and `nextSortState`. A row links to
  `/accountant/invoice?id=<event>&tab=info` plus the list's parameters.
- **`InvoiceStatusBadge.tsx`:** the five statuses, text and colour; a `title` "Status is
  calculated from payments".
- **`InvoicePage.tsx`:** reads `id`, `tab` and the list parameters from the URL
  (`useSearchParams`, inside `Suspense`); calls `useInvoiceData`; "Back to tasks"; the sticky
  header and tab bar; the footer with Previous Task and Next Task (inactive, §1); not-found and
  loading states.
- **`InvoiceHeader.tsx`:** event name, "N days overdue" (Collections only), **Record Payment**
  (when `can.recordPayment`), the status badge. No Send Email.
- **`InvoiceInformation.tsx`** with **`ContactCards.tsx`** (Contact, Finance Contact, the three
  variants of `Contacts.dc.html`), **`MoneyCard.tsx`** (the six lines, the (i) tooltips with the
  sketch's wording, the red Current Overdue box), the Venue and Event cards,
  **`PaymentScheduleTable.tsx`** (status chips Paid, Partial with "X of Y", Unpaid),
  **`PaymentHistoryTable.tsx`** (Record payment, Edit and Delete on manual rows, the line
  "Stripe payments cannot be edited or deleted.").
- **`InvoiceTasks.tsx`:** "Task list" (completed tasks, newest due date first, relative date and
  note), "Current task due now" with **Done / Next Task**, or "No open task".
- **`DoneNextTaskDialog.tsx`:** title "Done / Next Task", "Next Task Due:" button with the date
  as `Today`, `1 Day` or `N Days`, "Note to self:" textarea, Save. Defaults from spec 06. Save is
  disabled while the note is blank, the date is invalid or a save runs; Save calls `saveNextTask`;
  on success the dialog closes and the page stays; an error shows the toast. **`TaskDatePicker.tsx`:**
  the month grid, past days disabled, today ringed, the selected day filled, month arrows.
- **`utils/invoiceUrl.ts`** (new): `invoiceHref({ eventId, tab, listState })` builds
  `/accountant/invoice?id=...&tab=...` plus the list's parameters (`collectionsListStateToParams`),
  and `collectionsHref(listState)` builds `/accountant?tab=collections` plus them. The table rows
  and "Back to tasks" use it; spec 10 reuses it.
- **`src/app/accountant/invoice/page.tsx`** (new route) and **`src/app/accountant/page.tsx`**
  (changed: the Collections trigger and body, the controls hidden on that tab).
- **`src/features/userAccess/permissionPageData.ts`** (changed), see §4.

## 4. The permissions matrix

- **A new row "Collections"**, category "Day to Day Operations", after "Accounts Receivable".
  Description: "The Collections tab of the Accountant page lists the bookings with an overdue
  payment, one open task each, with Show Not Due Yet and sorting. Opening one leads to its invoice
  page, where the accountant reads the booking, records payments, and writes the next task. A
  task is created every morning for each overdue booking and closes by itself when the payment
  arrives." admin: `full`, accountant: `full` ("Can open Collections and every invoice page, write
  the next task, and record, edit and delete manual payments there."), account manager, developer,
  viewer, maintainer, driver: `none` with their usual notes.
- **`ROLE_DESCRIPTIONS.accountant`** gains: "Also has the Collections tab and the invoice page
  behind it, where they follow up overdue payments with tasks."
- **"Accounts Receivable"** description: "The Accountant page opens on the Collections tab."
- **`permissionPageData.test.ts`:** the new row, all seven roles present, the changed texts.

## 5. Behaviour scenarios

Playwright, written, **not run** (project rule); data seeded by writing `Events`, installments,
payments and `ArEventTasks`.

- **S1** accountant and admin: `/accountant` opens on Collections; the tab order is Collections,
  AR, AR Deposits, Need attention; the filter controls are absent on Collections.
- **S2** the list shows only today's and older tasks; Show Not Due Yet adds a future one and
  `cnotdue=1` appears in the URL.
- **S3** the default order is oldest task first; clicking Amount Overdue sorts descending, again
  ascending; the URL follows; a reload keeps it.
- **S4** a row opens the invoice page on Information; Back to tasks returns with the same sort.
- **S5** Information shows the sections of the design; the status badge matches the event (one
  event for each of the five statuses); a Collections event shows "N days overdue".
- **S6** Tasks: the completed tasks and the current task; Done / Next Task opens the modal with
  today + 2 and `Follow-up needed`; Save with a blank note is disabled; Save completes the old task
  and shows the new one as current; the page stays; a task dated today stays in Collections, one
  dated later leaves it.
- **S7** Record Payment for the whole overdue amount: the payment appears; after the sync the
  status changes and the tasks are completed ("No open task").
- **S8** a manual payment can be edited and deleted from the page; a Stripe payment has no such
  controls.
- **S9** an event with no open task opens; Tasks says "No open task".
- **S10** a contact with no company, and an event with no finance contact, render the variants.
- **S11** account manager and viewer cannot open `/accountant` or `/accountant/invoice`.
- **S12** there is no Send Email button anywhere.

## 6. Tests

Red first. Component tests with mocked hooks:

- the table: rows, labels, sort arrows and `aria-sort`, the switch, the empty, loading and error
  states, the row links with the list's parameters;
- the status badge: five texts and classes;
- the invoice page: sections present, no Send Email, Record Payment shown only with the
  capability, Edit and Delete only on manual rows, the Stripe line;
- the Tasks tab with and without an open task;
- the dialog: defaults, Save disabled for a blank note, an invalid date and while saving, the call
  to `saveNextTask` with the typed values, the date label (`Today`, `1 Day`, `N Days`);
- the date picker: past days disabled, today ringed, month arrows, picking a day;
- the page: the filter controls absent on Collections and present on AR; the other tabs unchanged;
- `permissionPageData.test.ts`; an access test that the five other roles cannot reach
  `/accountant/invoice`.
- **Gate:** `npm run tc`, `npx vitest run`, `prettier --check` on touched files (never on the
  design files). E2E: written, **SKIPPED** (not run locally, by instruction).

## 7. Files

**Counted: 17 files** (limit 10; over because the user asked for the whole design in one spec and
cutting it would split one logic): the 13 new components of §3, `utils/invoiceUrl.ts`,
`src/app/accountant/invoice/page.tsx`
(new), `src/app/accountant/page.tsx` and `src/features/userAccess/permissionPageData.ts` (changed).
**Not counted:** component tests, `permissionPageData.test.ts`, the page test, the Playwright
specs, nothing in the database, sync rules or `AppSchema.ts`.

## 8. Edge cases and error handling

- **Offline.** The screens read local data; Save writes locally and uploads later.
- **A narrow window.** The table scrolls sideways (min width about 940 px); the invoice cards wrap.
- **Sync lag.** A task completed by a payment disappears from the list after the sync; the page
  never blocks on it.
- **An unknown or missing `id`:** "Invoice not found" and a link to Collections.
- **A stale `tab`:** any value other than `tasks` opens Information.
- **Clerk.** Page access follows the roles in the database; a signed-out user is handled by the
  existing layout.
- **A save that is discarded** (spec 06) shows the connector's toast; the dialog has already
  closed.

## 9. Out of scope

- Previous / Next logic (spec 10), Send Email, assigning tasks, search, filters, paging, a Paid or
  Cancelled list, editing the design files.
