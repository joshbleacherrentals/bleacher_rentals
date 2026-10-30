# Accountant Collections 10: Previous Task and Next Task

Status: **Implemented 2026-10-30** (approved by the user the same day). Deviations, none changing a
contract: (1) the repo has no DOM renderer, so `useTaskNeighbours.test.tsx` replaces `useState` with
a slot that survives between calls (the pattern of `useUserAccess.test.ts`), instead of rendering the
hook; (2) a disabled Previous / Next Task is drawn as `<span role="link" aria-disabled="true">`, with
no `href` and no `tabindex`; (3) the Playwright scenarios are S13–S19 in
`collections.accountant.spec.ts` plus one in `collections.admin.spec.ts`, written and **not run**;
(4) the permissions matrix is unchanged: no role gained or lost anything. Original header: written
2026-10-28; 0 open decisions; readings to confirm in §1. Build order: **10** (last). Needs: [07](accountant-collections-07-collections-list.md),
[09](accountant-collections-09-design.md). Needed by: nothing. Branch: `q4-sprint2-collections`.

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

- **Previous Task and Next Task follow the order of the list's current sort.** The user's
  examples: sorted by Amount Overdue with the largest first, Next Task is the next smaller amount;
  sorted smallest first, the next is larger; sorted by task date with the oldest first, the next is
  a little newer; and the other way round.
- **The list's state travels in the URL** (the sort column, its direction and Show Not Due Yet,
  spec 07), and the invoice page **rebuilds the same ordered list from the local database**
  (user's answer). It uses the very functions the list uses, so the two cannot disagree.
- **The neighbours are fixed when the invoice page opens.** They are the rows before and after
  the event in the list **as it stood when the page opened**, and they stay so until the
  accountant moves to another page (user's answer: "from the position where the event stood").
  So after Save, even if the event has left the list (its new task is in the future and Show Not
  Due Yet is off), Next Task still leads to who was next before saving.
- After Save the accountant stays on the page (spec 06 and 09); Next Task is a button.
- **Back to tasks** returns to `/accountant?tab=collections` with the same list state.

**Readings to confirm at review:**

- At the first row of the list Previous Task is disabled; at the last row Next Task is disabled.
  An event that was **not in the list** when the page opened (a direct link, or a task hidden by
  Show Not Due Yet) has both disabled.
- "When the page opened" means the first moment the list has loaded for that event. While the list
  is loading, both buttons are disabled.
- A neighbour whose task has been completed in the meantime is **not skipped**; it opens and the
  Tasks tab says "No open task".
- The neighbour's page opens on the same tab (Information or Tasks) as the current page.
- Only the three list parameters are carried (`csort`, `cdir`, `cnotdue`).

## 2. Research findings

- **The pieces from spec 07:** `useCollectionsData`, `filterCollectionsRows`,
  `sortCollectionsRows`, `parseCollectionsListState`, `collectionsListStateToParams`. Spec 09
  creates `utils/invoiceUrl.ts` (`invoiceHref`, `collectionsHref`) and draws the two buttons
  inactive.
- **Next.js App Router** keeps the same page component when only the query changes
  (`?id=A` to `?id=B`), so state held in the component survives a Previous / Next click. The
  frozen neighbours must therefore be reset when `id` changes, not only when the page mounts.
- **The list is reactive** and changes under the accountant's feet (a completed task leaves it);
  that is why the neighbours are frozen.
- **No server round trip** is involved: the order is computed from local data.

## 3. Design

All under `src/features/accountantCollections/`.

- **`utils/taskNeighbours.ts`** (new): pure.
  - `orderedEventIds(rows, listState, today)`: `filterCollectionsRows` then
    `sortCollectionsRows`, mapped to event ids.
  - `neighboursOf(ids, currentId)`: `{ found, previousId, nextId }`; `found` is false when the id
    is not in `ids`, and then both ids are null; the first row has no previous, the last no next.
- **`hooks/useTaskNeighbours.ts`** (new): `useTaskNeighbours({ eventId, listState })` returns
  `{ isReady, previousId, nextId }`. It reads `useCollectionsData()`; the first time `isLoading` is
  false for a given `eventId` it computes `neighboursOf(orderedEventIds(...), eventId)` and keeps the
  result in state keyed by `eventId`; later data changes do not touch it; a different `eventId`
  starts again. `isReady` is false until then.
- **`components/InvoicePage.tsx`** (changed, from spec 09): the footer buttons become links to
  `invoiceHref({ eventId: previousId | nextId, tab, listState })`, disabled (`aria-disabled`, not
  focusable as links) when the id is null or `isReady` is false; "Back to tasks" uses
  `collectionsHref(listState)`; `listState` comes from `parseCollectionsListState` on the page's
  search parameters.

## 4. Tests

Red first.

- **`taskNeighbours.test.ts`:** with a fixed set of rows: amount descending (next is the next
  smaller, previous the next larger), amount ascending, follow-up oldest first and newest first,
  Payment Overdue both ways; the first row (no previous), the last (no next), a single row, an id
  that is not there; Show Not Due Yet on and off changes the neighbours; rows equal in the first
  key follow the tie chains of spec 07, the same as the list.
- **`useTaskNeighbours.test.tsx`:** nothing is ready while loading; after the first load the
  neighbours are fixed; a later change of the data (the event's task completed, a row added) leaves
  them as they were; a different `eventId` recomputes; an event outside the list gives two nulls
  and stays so.
- **`InvoicePage` tests (changed):** the buttons link to the right events with the tab and the
  three parameters kept; disabled states; Back to tasks keeps the list state.
- **Playwright (written, not run), roles accountant and admin:** sorted by amount largest first,
  Next Task opens the next smaller amount and Previous returns; the same smallest first; by task
  date; with Show Not Due Yet; the first row has no Previous and the last no Next; after Save with
  a future date and Show Not Due Yet off, Next Task still opens the pre-save neighbour; a direct
  link has both disabled; Back to tasks keeps the sort.
- **Gate:** `npm run tc`, `npx vitest run`, `prettier --check`. E2E: written, **SKIPPED** (not run
  locally, by instruction).

## 5. Files

**Counted: 3 files** (limit 10): `utils/taskNeighbours.ts` and `hooks/useTaskNeighbours.ts` (new),
`components/InvoicePage.tsx` (changed). **Not counted:** the tests and the Playwright spec.

## 6. Edge cases and error handling

- **A list that is still syncing.** The first emission after a cold start may hold only part of the
  tasks; the neighbours are then fixed from that part. If an accountant sees a button disabled
  that should not be, reloading the page rebuilds them. Not handled further.
- **Two browser tabs or devices.** Each fixes its own neighbours.
- **The browser Back button** returns to the previous URL and recomputes the neighbours for it.
- **A neighbour deleted meanwhile** (the event is gone): its page says "Invoice not found".
- **Timezone.** "Today" for the Show Not Due Yet filter is the date in the timezone store, the
  same as the list.
- **A single-row list** has both buttons disabled.

## 7. Out of scope

- Changing the list's sort from the invoice page; skipping completed neighbours; keyboard
  shortcuts; counting position ("3 of 40").
