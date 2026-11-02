# Accountant Collections 14: the New Task window

Status: **Implemented 2026-11-02** (approved by the user the same day). Two decisions taken at
build time, both written into §1, §3, §4, §5 and §7 above: (1) moving holds the left, right and top
edges and lets the body hang off the bottom while the top 48 px stay on screen, whereas opening, a
reload and a browser resize pull the whole window inside; (2) leaving an event closes the window
for good, through the pure function `windowOpenForEvent` and a reset during render. Deviations,
none changing a contract: (a) `viewport` is `{ w, h }`, the spec left its shape open; (b) the
form wrapper `NextTaskForm` is now exported (it was private in `DoneNextTaskDialog.tsx`), and
`NextTaskFormView` was restyled to fill the window (the note grows with the height and no longer
resizes by hand, Save sits in a footer), with no change to its props or text; (c) the calendar
block is full width with the 36 px grid centred in it, because `TaskMonthGrid` stays unchanged;
(d) the Playwright scenarios S30 to S37 are in `collections.accountant.spec.ts` in full and in
`collections.admin.spec.ts` as S30 to S32, written and **not run**, and the modal steps of S6, S17
and S23 (both files) now use the window, with `exact: true` on the New Task button because "Close
New Task window" also contains those words; (e) the pointer gestures of `NewTaskWindow` are covered
only by static markup and by Playwright, not seen in a browser (the invoice page needs a Clerk
sign-in). Not touched, outside §6: the comments in `nextTaskDefaults.ts`, `validateNextTask.ts`
and `saveNextTask.ts` that still say "Done / Next Task". Original header: written 2026-11-02;
0 open decisions, readings to confirm in §1.
Build order: **14**. Needs: [12](accountant-collections-12-tabs-and-messages.md),
[13](accountant-collections-13-task-history-and-files.md). Needed by: nothing. Branch:
`q4-sprint2-collections`.

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

- **The New Task window replaces the Done / Next Task modal.** It is **not a modal**: no overlay,
  no focus trap, no scroll lock; the accountant can click anything else on the page and scroll it
  while the window is open.
- **It can be moved** (by its title bar) **and resized**: the east edge changes only the width,
  the south edge only the height, the south-east corner both.
- **It closes** when the accountant goes to another event with Previous / Next Task; what was
  typed is lost (decision 3). It also ends when the page is left.
- **Its size and place are remembered in the browser** (decision 3): the next opening, and a
  reload, start where it was left. On a smaller screen the window is pulled inside it.
- **What Save does is unchanged** (spec 06 `saveNextTask`): the open task is completed and the next
  one created. The button that opens the window is disabled without an open task (spec 12).

**Replaces in spec 09:** §0 decision 6's "modal" (it is a window now), §3 `DoneNextTaskDialog.tsx`
and the popover calendar of `TaskDatePicker.tsx` (the calendar is drawn inside the window, as in
the design), scenario S6's modal steps. In spec 12 the New Task button opened the modal; here it
opens the window.

**Readings to confirm at review:**

- **Starting place and size** are the design's: 430 by 360 pixels with its top-left corner at 730,
  250, then pulled inside the screen. Minimum 320 by 240. **Decided by the user at build time,
  2026-11-02:** while moving, the window may hang off the bottom edge as long as its top 48 px
  (the title bar) stay on screen; it never goes past the top, left or right edge. Opening, a reload
  and a browser resize pull the **whole** window inside the screen (so a window left hanging off
  the bottom is pulled up the next time). While resizing, the window cannot grow past the screen
  edge and never goes below the minimum.
- **Only the east edge, the south edge and the south-east corner resize**, as drawn. No west or
  north handles, no keyboard moving or resizing.
- **One window.** New Task while it is open does nothing more.
- **Save** closes the window on success; on failure the toast shows, the window stays and Save
  works again.
- **Each opening starts from the defaults** (today + 2 days, the note `Follow-up needed`); only
  the geometry is remembered, not the text.
- **The window belongs to the page,** not to a tab: switching between Information and Messages
  keeps it open with what was typed.
- **Leaving the event closes the window for good** (decided by the user at build time,
  2026-11-02): going Next Task and then Previous Task back to the first event does not reopen it.
- **If the open task is completed while the window is open** (a payment arrives), the window stays
  and Save still creates a task, exactly as the modal did.
- **The calendar** opens inside the window under the date button (as drawn), pushes the note down,
  and closes when a day is picked; it keeps the month arrows spec 09 added.
- **Escape does not close it** (the design draws a close button only).
- **The geometry is stored under one key** in `localStorage` for every event; a failed read or
  write (private window) falls back to the defaults and never breaks the page.
- **The window stays above the sticky header and below dialogs** (Record Payment still opens
  above it).

## 2. Research findings

- No library for moving or resizing windows is in `package.json`; the design builds it with mouse
  events. This spec uses Pointer Events (one code path for mouse, pen and touch) with
  `setPointerCapture`.
- `DoneNextTaskDialog.tsx` holds `dueLabel`, `canSaveNextTask`, `submitNextTask`,
  `NextTaskFormView` and the Radix `Dialog` wrapper; `TaskDatePicker.tsx` holds the month grid
  (`TaskMonthGrid`, `shiftMonth`, `monthCells`) and a Popover wrapper. The helpers are tested.
- The page keeps one component when only `?id=` changes (spec 10 §2), so state in `InvoicePage`
  survives Previous / Next; the window state must be keyed by the event.
- The design (`Invoice.dc.html`, boards `InvoiceNewTask` and `InvoiceNewTaskPicker`): a fixed
  window with a dark gradient title bar (grip icon, "New Task", a close button), the date button,
  the calendar block, the note, Save; three resize handles.
- Dialogs of the app (Radix) sit at `z-50`; the page's sticky header at `z-10`.
- No database, sync or schema change.

## 3. Design

All under `src/features/accountantCollections/`.

- **`utils/windowRect.ts`** (new): pure, with the numbers `DEFAULT_RECT = { x: 730, y: 250,
w: 430, h: 360 }`, `MIN_SIZE = { w: 320, h: 240 }`, `KEEP_VISIBLE = 48`, and
  `clampRect(rect, viewport)` (the whole window inside), `moveRect(start, dx, dy, viewport)`
  (left, right and top edges held, the bottom one lets all but the top 48 px hang off),
  `resizeRect(start, edge, dx, dy, viewport)` (`edge` is `"e" | "s" | "se"`; `viewport` is
  `{ w, h }` everywhere),
  `parseStoredRect(raw)` (invalid or partial gives `null`), `readStoredRect()` /
  `writeStoredRect(rect)` over `localStorage` with the key `accountantCollections.newTaskWindow`,
  wrapped in try/catch.
- **`components/NewTaskWindow.tsx`** (new): `position: fixed`, `z-40`,
  `role="dialog"`, `aria-modal="false"`, `aria-labelledby` the title "New Task". Title bar:
  grip icon, title, close button (`aria-label="Close New Task window"`); a pointer-down on the bar
  starts a move (the close button stops it). Three handles, `tabIndex={-1}` buttons labelled
  `Resize window width`, `Resize window height`, `Resize window`. Geometry is state; it is saved
  when a move or resize ends, and re-clamped when the browser window is resized. The body is the
  form. It receives `{ eventId, today, onClose }`.
- **`components/NextTaskForm.tsx`** (renamed from `DoneNextTaskDialog.tsx`): keeps
  `NextTaskFormView`, `dueLabel`, `canSaveNextTask`, `submitNextTask` and the form wrapper; the
  Radix `Dialog` and the title "Done / Next Task" go. `DoneNextTaskDialog.test.tsx` is renamed to
  match.
- **`components/TaskDatePicker.tsx`** (changed): the Popover wrapper becomes an inline one: the
  date button (`aria-expanded`) toggles the month grid under it; picking a day closes the grid.
  `TaskMonthGrid` and the month helpers are unchanged.
- **`components/InvoicePage.tsx`** (changed): the state `windowOpenFor: string | null`, the event
  the window was opened on. The window is open while it equals `eventId`; when `eventId` changes
  the state is reset during render (no effect) through the small pure function
  `windowOpenForEvent(openFor, eventId)`, which gives `openFor` back when it equals `eventId` and
  `null` otherwise, so returning to the first event does not reopen the window. The New Task button
  sets it; the modal of spec 12 goes; `<NewTaskWindow key={eventId} ...>` is rendered at the page
  level.

## 4. Behaviour scenarios

Playwright, written, **not run**. Roles: accountant, admin. S30 to S37.

- **S30** New Task opens the window at the design's place and size; the page behind is not dimmed.
- **S31** while it is open, a click on the Messages tab works and the page scrolls; the window
  keeps its screen position.
- **S32** dragging the title bar moves it and cannot take it off the screen.
- **S33** dragging the east edge changes only the width, the south edge only the height, the corner
  both; the minimum size holds.
- **S34** after a move and a resize, closing and reopening, and a reload, keep the geometry.
- **S35** Save completes the open task and creates the next one; the window closes; Task History
  shows the new Open row.
- **S36** Previous Task / Next Task closes the window; the next event's window opens clean;
  going back to the first event does not reopen it.
- **S37** the calendar opens inside the window; a day can be picked while the window is moved.

## 5. Tests

Red first.

- **`windowRect.test.ts`:** the defaults; `clampRect` on a screen smaller and larger than the
  window; `moveRect` at each edge with the 48 px rule; `resizeRect` for `e`, `s`, `se` including
  the minimum and the screen edge; `parseStoredRect` with garbage, missing fields, strings,
  negative and non-finite numbers; read and write with a throwing `localStorage`.
- **`NextTaskForm.test.tsx`:** the former dialog tests of the helpers and of the form markup.
- **`NewTaskWindow.test.tsx` (static markup):** `role="dialog"` with `aria-modal="false"`, the
  title, the close button, the three handles and their labels, no overlay element.
- **`TaskDatePicker.test.tsx`:** `aria-expanded` on the button; the month helpers as before.
- **`InvoicePage.test.tsx`:** the window is open only for its own event id
  (`windowOpenForEvent`: same id kept, another id or `null` gives `null`); the New Task button is
  still disabled without an open task.
- **Gate:** `npm run tc`, `npx vitest run`, `prettier --check` on touched files. E2E: written,
  **SKIPPED** (not run locally, by instruction).

## 6. Files

**Counted: 5 files** (limit 10): `utils/windowRect.ts` and `components/NewTaskWindow.tsx` (new),
`components/NextTaskForm.tsx` (renamed from `DoneNextTaskDialog.tsx`), `components/TaskDatePicker.tsx`
and `components/InvoicePage.tsx` (changed). **Not counted:** the tests and the Playwright specs.
The permissions matrix is unchanged: no role gains or loses anything. Nothing in the database, the
sync rules or `AppSchema.ts`.

## 7. Edge cases and error handling

- **A screen smaller than the window:** the window is pulled in; if the screen is narrower than
  320 px the width is the screen's.
- **The browser window shrinks while the window is open:** it is pulled in at once.
- **Stored geometry that no longer fits** (a smaller screen than last time): clamped on open.
- **Two browser tabs:** each reads the stored geometry when it opens a window; the last one to
  finish a move or resize wins.
- **Back to the first event** with Previous / Next Task: the window stays closed.
- **A move that starts on the close button** does not move the window.
- **Pointer lost** (release outside the browser, `pointercancel`): the gesture ends where it is
  and the geometry is saved.
- **Offline:** Save writes locally and uploads later (spec 06).
- **The page is left while the window is open:** the window unmounts and nothing is saved.

## 8. Out of scope

- Keyboard moving and resizing, Escape to close, snapping, minimising, several windows, a window
  for anything other than New Task, remembering the typed text.
