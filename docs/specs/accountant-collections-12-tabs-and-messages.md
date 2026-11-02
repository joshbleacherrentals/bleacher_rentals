# Accountant Collections 12: the Messages tab and the New Task button

Status: **Implemented 2026-11-02** (approved by the user the same day). Deviations, none changing a
contract: (1) the New Task blue is not the "nearest token": `lightBlue` in `globals.css` is exactly
the design's `#1d62a3`, so the button uses `bg-lightBlue`; (2) the Playwright scenarios S20 to S23
are in `collections.accountant.spec.ts` in full and in `collections.admin.spec.ts` in a lighter
form (S21 there does not send a message or press Next Task), written and **not run**; (3) the
Vitest file also checks that Messages is the only tab that mounts the chat and that Previous Task
and Next Task keep `tab=messages`. Original header: written 2026-11-02; 0 open decisions, readings
to confirm in §1.
Build order: **12**. Needs: [09](accountant-collections-09-design.md),
[10](accountant-collections-10-prev-next.md). Needed by: 13, 14. Branch: `q4-sprint2-collections`.

## 0. The change request of 2026-11-02 (the same in all five specs)

This spec is one of five (12 to 16). They change the invoice page that specs 06 to 10 built,
after the author redrew its design. Each is built in its own chat, so this section is repeated
in every spec.

**The series** (`docs/specs/`, in build order):

- **12** `accountant-collections-12-tabs-and-messages.md`: the Messages tab and the New Task
  button join the tab bar.
- **13** `accountant-collections-13-task-history-and-files.md`: the Tasks tab goes; Task History
  and Files appear in Information.
- **14** `accountant-collections-14-new-task-window.md`: a floating New Task window replaces the
  Done / Next Task modal.
- **15** `accountant-collections-15-open-pdf.md`: the Open PDF button in the header.
- **16** `accountant-collections-16-customer-page-view.md`: the View customer page toggle.

**The request** (the author's numbered list of 2026-11-02, with their sketch and the redrawn
design):

1. The Tasks tab disappears; its table moves into the Information tab. In the tab bar a **New
   Task** button takes its place.
2. Between the Tasks tab and the New Task button comes a **Messages** tab, identical to the
   Messages tab of `/quotes-bookings/{id}?tab=messages`.
3. The header gets **Open PDF**: it opens the signed invoice PDF; if there is none, the quote PDF.
4. The header gets a **View customer page** toggle: on shows the customer's page, off is the page
   as it is now.
5. Information gets a **Task History** table (the tasks moved from the Tasks tab).
6. Information gets a **Files** table: the files attached to the quote / invoice.
7. **New Task** opens a draggable, resizable window, not a modal: the rest of the page stays
   usable (click, scroll) while it is open. Width and height resize separately, and dragging a
   corner changes both.

**Where the work is.** Branch `q4-sprint2-collections`. Design: `docs/design/accountant-collections/`
(README, `Invoice.dc.html` and its boards, redrawn 2026-11-02; never run Prettier on them) and the
author's sketch `Untitled-2026-11-02-1931.excalidraw` (not in the repository). Stack and rules:
`CLAUDE.md`, `docs/POWERSYNC_ARCHITECTURE.md`. Earlier series: specs 01 to 11 (09 built the page,
10 the Previous / Next Task links).

**What stays as built:** the Collections list, `useInvoiceData`, the header's Record Payment and
status badge, the Information cards, the Previous / Next Task footer, "Back to tasks", the table
`ArEventTasks` and its rules (one open task per event; the sync of spec 11), access for admin and
accountant only. Spec 09 is not edited; each spec of this series says which of its points it
replaces.

**Decisions taken by the user (they hold for the whole series):**

1. **Open task.** It is the last row of Task History, marked Open. There is no separate "current
   task" block.
2. **New Task** is enabled only when the event has an open task. It then completes that task and
   creates the next one (the Done / Next Task action of spec 06, unchanged; an event has at most
   one open task). Without an open task the button is disabled.
3. **The window** closes when the accountant moves to another event with Previous / Next Task;
   whatever was typed is lost. Its size and place are remembered in the browser.
4. **View customer page** shows the live page `/quote/<event id>` in a frame under the header. It
   writes nothing to the event's activity log. Sign works for real, as for the customer. Pay
   opens Stripe in a new tab.
5. **Files.** Download on every file; Delete only on files attached by hand (source `upload`).
   Attach File lists the chosen files and a Save button uploads them; there is no drag and drop.
6. **Not built:** Send Email, assigning tasks, anything the sketch does not draw.

## 1. What this spec decides

**From the user's own words (not options):**

- **The tab bar** reads Information, Messages, New Task, in that order (the sketch and the
  design). While spec 13 is not built the Tasks tab is still there, so the bar reads Information,
  Tasks, Messages, New Task; the user's wording "between the Tasks tab and the New Task button"
  describes exactly this place.
- **Messages is the quote card's Messages tab**, "looking exactly the same": the Internal /
  External switch, the event's internal chat, and "External messaging coming soon.".
- **New Task** is a button, not a tab, drawn blue at the right end of the bar. It is **disabled
  while the event has no open task** (decision 2).
- In this spec the button opens the existing **Done / Next Task modal** (spec 09). Spec 14
  replaces the modal with the window.

**Readings to confirm at review:**

- The chat is the quote card's own component, `MessagesTab`, mounted with the event id. So it
  keeps everything the card gives: Internal for admin, account manager and accountant (here
  admin and accountant), unread marks, mentions.
- `?tab=messages` is the URL value; Previous Task and Next Task keep it (spec 10 already carries
  the tab).
- The chat sits in the page's white card with no extra frame; the design's border is the
  component's own.
- The New Task blue is the project's nearest token to the design's `#1d62a3` (same reading as
  the colours in spec 09 §1).
- A disabled New Task is dimmed, shows `cursor-not-allowed` and the tooltip "There is no open
  task".
- The permissions matrix gets one sentence in the Collections row (§3); no role gains or loses
  anything, because an accountant already has the same chat on the quote card.

## 2. Research findings

- `InvoicePage.tsx` has `TABS` (info, tasks), `selectTab` and the sticky header; the tab type
  and `parseInvoiceTab` are in `utils/invoiceUrl.ts` (`"info" | "tasks"`).
- `MessagesTab` (`src/features/quotesAndBookings/components/quoteDetail/tabs/MessagesTab.tsx`)
  takes `{ quoteId, can }` where `can` is `Pick<QuotesBookingsCapabilities, "useInternalChat">`.
  `InvoicePage` already calls `useQuotesBookingsCapabilities()`.
- `useInvoiceData(...).tasks.open` is the open task or `null`; `data.today` is `YYYY-MM-DD`.
- `DoneNextTaskDialog` takes `{ open, onOpenChange, eventId, today }`; today only `InvoiceTasks`
  uses it.
- The design (`Invoice.dc.html`): the two tabs sit in a group worth two thirds of the bar, the
  New Task button (plus icon, `aria-haspopup="dialog"`) one third, joined to the header.
- The internal chat for the accountant was built by `accountant-quotes-11`.

## 3. Design

All under `src/features/accountantCollections/`.

- **`utils/invoiceUrl.ts`** (changed): `InvoiceTab = "info" | "tasks" | "messages"`;
  `parseInvoiceTab` returns `tasks` for `tasks`, `messages` for `messages`, and `info` for
  anything else. `invoiceHref` is unchanged.
- **`components/InvoicePage.tsx`** (changed):
  - `TABS` gets Messages after Tasks. The tab list (`role="tablist"`, the tabs only) takes two
    thirds of the bar; the New Task button, outside the tablist, one third.
  - The Messages panel: `<div role="tabpanel" aria-label="Messages">` holding
    `<MessagesTab quoteId={eventId} can={can} />`.
  - New Task: `type="button"`, a `Plus` icon, `aria-haspopup="dialog"`, `disabled` when
    `data.tasks.open === null`. A click sets `newTaskOpen`; the page renders its own
    `<DoneNextTaskDialog open={newTaskOpen} onOpenChange={setNewTaskOpen} eventId={eventId}
today={data.today} />`. `InvoiceTasks` keeps its own dialog until spec 13 removes the tab.
- **`src/features/userAccess/permissionPageData.ts`** (changed): in the Collections row's
  description add after the sentence about opening an invoice page: "The page has a Messages tab
  with the booking's internal chat, the same as on the quote." Levels and notes stay.

## 4. Behaviour scenarios

Playwright, written, **not run** (project rule). Roles: accountant, admin. S20 to S23.

- **S20** the tab bar order is Information, Tasks, Messages, New Task.
- **S21** Messages shows Internal and External; External says "External messaging coming soon.";
  a message sent in Internal appears and `?tab=messages` is in the URL; Next Task keeps the tab.
- **S22** an event with an open task: New Task is enabled; an event without one: it is disabled.
- **S23** New Task opens the Done / Next Task modal; Save completes the task and creates the next.

## 5. Tests

Red first. Vitest under the node environment (static markup, as the rest of the page's tests).

- **`invoiceUrl.test.ts`:** `messages` parses to `messages`; `tasks` still parses; a missing or
  stale value gives `info`; `invoiceHref` writes `tab=messages`.
- **`InvoicePage.test.tsx`:** the bar's order and labels; `aria-selected` follows the URL; New
  Task is disabled without an open task and enabled with one; Messages renders `MessagesTab`
  (mocked) with the event id and the capabilities.
- **`permissionPageData.test.ts`:** the Collections description contains the new sentence.
- **Gate:** `npm run tc`, `npx vitest run`, `prettier --check` on touched files (never on the
  design files). E2E: written, **SKIPPED** (not run locally, by instruction).

## 6. Files

**Counted: 2 files** (limit 10): `utils/invoiceUrl.ts` and `components/InvoicePage.tsx`.
**Not counted:** the tests, the Playwright specs, `permissionPageData.ts`. Nothing in the
database, the sync rules or `AppSchema.ts`.

## 7. Edge cases and error handling

- **Open task completed while the modal is open** (a payment arrives): the modal stays and Save
  still works, as in spec 09.
- **A role without the chat capability** would see `MessagesTab`'s own sentence; it cannot reach
  this page.
- **A narrow window:** the bar keeps its proportions and the labels may truncate.
- **Offline:** the chat reads local data like the quote card; sending follows its own rules.

## 8. Out of scope

- External messaging, an unread badge on the Messages tab, anything else the quote card's Messages
  tab does not do; removing the Tasks tab (13); the window (14).
