# Accountant Collections 07: the Collections list

Status: **Implemented 2026-10-29.** Approved by the user. Build order: **07**. Needs:
[01](accountant-collections-01-backend.md), [03](accountant-collections-03-ts-twin-and-parity.md).
Needed by: 08 (date wording), 09 (the screen), 10 (the order). Branch: `q4-sprint2-collections`.

Deviations and choices the spec left open:

- The twin's function is `computeCollectionsBalances` (spec 03's deviation); §3 calls it
  `collectionsBalances`. The event name column is `Events.event_name`.
- The task query also selects `ArEventTasks.created_at`. §1 says "two open tasks of one event: the
  one created last", which cannot be decided without it; §3's column list did not name it.
  Equal `created_at`: the larger task id.
- `buildCollectionsRows(sources, today, currencyOf)`: `currencyOf` takes the task source row (it
  carries `sales_office_uuid`), as the AR tabs' `currencyOf` takes the event. `sources` is
  `{ tasks, lineTotals, installments, payments }`. The task source row uses the snake_case column
  names, like `ReceivableInstallmentRow`.
- A row with no event name gets the dash `—` in `eventName` (§6), so the screen draws it as is.
- `collectionsListStateToParams` returns a plain `Record<string, string>` of the non-default
  parameters; `parseCollectionsListState` takes anything with `get(key)`, so it reads a
  `URLSearchParams` or Next's `ReadonlyURLSearchParams`. `cnotdue` is on only for the value `1`.
- `useCollectionsData` does **not** wait for `useOfficeCurrencies`: it includes an online-only
  fetch (QBO connections) and the list is local-first. Until that lands an event is priced on its
  office's province, then USD, as on the AR tabs. `isLoading` is the four local queries.
- Existing tests changed because a bare `/accountant` no longer opens AR: `page.test.tsx`
  (four tests now ask for `tab=ar`, and a bare URL is checked to select none of the three
  existing tabs), `filterUrlSync.test.ts` (one test), `listPageEffects.test.ts` and
  `listTabs.test.ts` (new cases).
- **Until spec 09 lands, a bare `/accountant` opens an empty body:** the opening tab is
  `collections` but the page has no Collections trigger or content yet. `?tab=ar` works as before.
  Do not release this branch before 09. The Playwright specs that call `page.goto("/accountant")`
  (`companiesContactsAccess.accountant.spec.ts`, `roleAccess.accountant.spec.ts`) only check the
  URL and the sidebar; they were not run (E2E skipped).
- No migration, no `AppSchema.ts` change, no sync-rule change, and no change to
  `permissionPageData.ts`: this spec adds no screen and no access (the matrix is spec 09's).

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

- **Rows:** the open tasks of eligible events (booked, not deleted). One row per event.
- **Show Not Due Yet** (off by default) adds the tasks dated in the future. A task dated today or
  earlier is always shown.
- **Sortable columns:** Next Follow Up (earliest or latest task date), Payment Overdue (most or
  fewest days), Amount Overdue (largest or smallest). **Default: Next Follow Up, oldest first.**
- **Equal values**, the chain is fixed (the user's words). After the chosen column:
  - Next Follow Up first: Amount Overdue, then Payment Overdue, then the event id.
  - Amount Overdue first: Payment Overdue, then Next Follow Up, then the event id.
  - Payment Overdue first: Amount Overdue, then Next Follow Up, then the event id.
  - The default order is "oldest task first, then the most expensive".
- **Amount Overdue** is the Amount Due of the twin (spec 03); **Payment Overdue** is its
  `daysOverdue`, including the no-schedule rule. The twin is the only place these are computed.
- **Date wording** uses 30-day months (user's answer). Copy from the sketch: `Due Today`,
  `Due tomorrow`, `3 days ago`, `Month ago`, `2 Months ago`, `3 days after`, `Month after`,
  `3 Months after`; the overdue column: `1 day`, `23 days`, `Month`, `3 Months`.
- **The list state lives in the URL** so that the invoice page can recreate the order (spec 10):
  the sort column, its direction and Show Not Due Yet.
- **Collections is the first tab of `/accountant` and the one that opens by default**
  (user's answer).

**Readings to confirm at review:**

- Directions of the secondary keys are fixed whatever the primary direction: Amount largest
  first, Payment Overdue most days first ("from the oldest"), Next Follow Up oldest first.
- A first click on a column other than the current one sorts it **descending** (largest amount,
  most days, latest date); a second click flips it. This follows the design file.
- Days from 1 to 29 read `N days` (`1 day`); 30 to 59 `Month`; from 60 `floor(days/30) Months`.
  A task due today reads `Due Today`; a payment overdue 0 days reads `Due today` in the overdue
  column.
- A row whose open task exists but whose Amount Due is 0 (a task left over after a schedule edit)
  stays in the list, with `0.00` and an empty Payment Overdue (`—`, sorted as 0).
- "Name" shows the event name. There is no search, no filter, no paging and no Show Deleted on
  this tab (the sketch has none).
- If two open tasks of one event ever appear, the one created last is used.

## 2. Research findings

- **Tabs:** `ACCOUNTANT_TABS` (`quotesAndBookings/utils/listTabs.ts`) lists `ar`, `ar_deposits`,
  `need_attention`; `openingTab` is `ar`; every tab config needs a `startingSort` of type
  `EventSort` and `offersStatus`. `parseListTab` falls back to the opening tab.
- **URL ownership:** `useListPageState` rewrites the query string from its own state but starts
  from the existing parameters, so parameters it does not know survive. It owns `tab`, `sort`,
  `page`, `pageSize`, `search`, `showDeleted` and the filters. Collections therefore uses its
  own names: `csort`, `cdir`, `cnotdue`.
- **Data:** `useAccountsReceivableData` shows the queries to copy: one for line totals summed in
  SQL, one for installments, one for payments, `useToday(timezone)`, `useOfficeCurrencies`,
  `pickEventCurrency`. Collections needs the same for the events of the open tasks only.
- **Money text:** `formatMoney` in `quotesAndBookings/utils/formatMoney.ts`.
- **No shared relative-date helper** exists; `luxon` is installed but its wording does not match
  the sketch.
- **Design:** `Main.dc.html` (sort arrows, Show Not Due Yet switch). It sorts by the follow-up
  descending by default and starts a new column descending; the default must change to ascending.

## 3. Design

All under `src/features/accountantCollections/` unless stated.

- **`quotesAndBookings/utils/listTabs.ts`** (changed): a first tab
  `{ id: "collections", startingSort: DEFAULT_SORT, offersStatus: false }` (the sort is unused:
  the tab owns its own state; say so in a comment); `openingTab` becomes `"collections"`. The
  existing tabs keep their order after it.
- **`utils/collectionsListState.ts`** (new):

  ```ts
  type CollectionsSortKey = "followUp" | "overdue" | "amount";
  type CollectionsListState = {
    sort: CollectionsSortKey;
    dir: "asc" | "desc";
    showNotDue: boolean;
  };
  const DEFAULT_LIST_STATE = { sort: "followUp", dir: "asc", showNotDue: false };
  ```

  `parseCollectionsListState(searchParams)` (unknown values fall back to the default),
  `collectionsListStateToParams(state)` (omits what equals the default; `csort` = `follow` |
  `overdue` | `amount`, `cdir` = `asc` | `desc`, `cnotdue` = `1`), `nextSortState(state, key)` (the
  same key flips the direction, another key sorts that key descending).

- **`utils/collectionsRows.ts`** (new): `buildCollectionsRows(sources, today, currencyOf)` returns
  `{ eventId, eventName, taskId, dueDate, note, amountDueCents, currency, daysOverdue }[]` by
  calling `collectionsBalances` (spec 03) per event; `sources` is the tasks joined to their
  events, and the line totals, installments and payments of those events.
- **`utils/collectionsSort.ts`** (new): `filterCollectionsRows(rows, state, today)` (drops
  `dueDate > today` unless `showNotDue`) and `sortCollectionsRows(rows, state)` with the chains of
  §1; a null `daysOverdue` sorts as 0. Pure; spec 10 calls the same functions.
- **`utils/relativeDays.ts`** (new): `followUpLabel(dueDate, today)` and `overdueLabel(days)`
  with the wording of §1; uses `daysBetween` from spec 03.
- **`hooks/useCollectionsData.ts`** (new): reactive. One query for the open tasks joined to
  `Events` with `event_status = 'booked'` and `deleted = 0` (columns: task id, due date, note, event
  id, name, `event_start`, `booked_at`, tax fields, office); three narrow queries for line totals,
  installments and payments restricted to those events (`event_uuid IN (SELECT event_uuid FROM
ArEventTasks WHERE completed = 0)`); `useToday(timezone)`; `useOfficeCurrencies`. Returns
  `{ rows, isLoading, error, today }`, `rows` memoized from one pass. Use `useTypedQuery` and
  `expect<T>()` (project rule). Keep the watcher count low (see
  `docs/specs/slow-local-db-step1-split-watchers.md`).

## 4. Tests

Red first.

- **`collectionsSort.test.ts`:** the default order (oldest task first; equal dates, the larger
  amount first; then more days; then id); sorting by amount descending and ascending (the user's
  example: from the largest, the next row is smaller; from the smallest, the next is larger);
  by Payment Overdue both ways; each of the three tie chains with rows equal in the first one and
  two keys; a null `daysOverdue`; the filter with and without Show Not Due Yet (a task due today
  stays, tomorrow goes); the order is total (shuffling the input never changes the output).
- **`collectionsListState.test.ts`:** defaults; round trip; unknown or missing values; defaults are
  omitted; `nextSortState` for the same and for another key.
- **`relativeDays.test.ts`:** a table: 0, 1, 3, 29, 30, 59, 60, 89, 90, 365 days, past and future,
  singular and plural, and the tomorrow case.
- **`collectionsRows.test.ts`:** a schedule event, a no-schedule event inside and outside the
  window, a part-paid event, a CAD event, a row with Amount Due 0, two open tasks of one event.
- **`useCollectionsData.test.tsx`:** the task query joins `Events`, keeps only booked and
  non-deleted events, only open tasks; the other three queries are limited to those events.
- **`listTabs.test.ts` (changed):** `collections` is first; the opening tab is `collections`;
  `?tab=collections`, a missing and an unknown tab open it; the other tab ids still parse.
- **Page test (changed):** the existing AR tabs still render as before.
- **Parameters survive:** a test of the query-string writer shows `csort`, `cdir`, `cnotdue` are not
  dropped when `useListPageState` rewrites the URL.
- **Gate:** `npm run tc`, `npx vitest run`, `prettier --check` on touched files. E2E: SKIPPED
  here (spec 09).

## 5. Files

**Counted: 6 files** (limit 10): `quotesAndBookings/utils/listTabs.ts` (changed) and the new
`utils/collectionsListState.ts`, `utils/collectionsRows.ts`, `utils/collectionsSort.ts`,
`utils/relativeDays.ts`, `hooks/useCollectionsData.ts`. **Not counted:** their tests,
`listTabs.test.ts`, the page test.

## 6. Edge cases and error handling

- **Sync lag.** A new task from the cron, or a completion from a trigger, appears after the next
  sync; no reload is needed.
- **A long list.** There is no paging. If it passes a few hundred rows, measure the render and
  report; do not add paging without a decision.
- **A tab bookmarked as `/accountant?tab=ar`** still opens AR; a bare `/accountant` now opens
  Collections.
- **A different timezone.** `today` follows the timezone selector, so Show Not Due Yet and the
  wording shift with it; the cron uses Toronto's date (spec 03 §1).
- **A hard-deleted event** takes its tasks with it (cascade).
- **An event with no name or no office.** The row shows a dash for the name; the currency falls
  back to USD, as on the AR tabs.

## 7. Out of scope

- The screen (spec 09), Previous / Next (10), the invoice data (08).
- Search, filters, paging, Show Deleted, a Status selector, a Paid or Cancelled list.
