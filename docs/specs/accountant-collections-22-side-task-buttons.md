# Accountant Collections 22: Previous / Next Task beside the page

Status: **Draft**, written 2026-11-11, waiting for "Approved". 0 open decisions (one answered,
§1); readings to confirm in §1.
Build order: **22**. Needs: [10](accountant-collections-10-prev-next.md),
[09](accountant-collections-09-design.md). Needed by: none. Branch: `q4-sprint3-finance`.

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

- **If there is enough room outside the central column,** Previous Task and Next Task are also
  placed outside it, in the layout, to the left and right, and are **sticky.**
- **If there is not enough room,** nothing changes: only the buttons at the bottom of the page.
- **The buttons at the bottom stay in every case;** the side ones are an addition when there is
  room.

**Decision taken by the user (asked, 2026-11-11):**

- **D1 How much room, and measured where.** The design draws the column at 1040 px with a
  168 px button and a 16 px gap on each side, from a 1440 px window, with no sidebar. The app has
  a 224 px sidebar and 32 px of page padding, so the same sizes need a window of about 1664 px (a
  Windows scrollbar adds about 17 px): on a laptop of 1440 or 1536 px only the bottom buttons
  remain. Asked: keep the drawn size, or narrower arrow-only buttons (about 1424 px, needing a
  redrawn design). The user's answer: **as drawn.** The room is measured on the page's own box,
  not on the window.

**Replaces in spec 10:** §3 and §1, "the footer buttons are the only Previous / Next Task
buttons"; the destination, the disabled rule and the frozen neighbours stay exactly as spec 10
built them.

**Readings to confirm at review:**

- **The rule in numbers** (the design's): the side buttons exist when the page's box is at least
  1040 + 2 × (168 + 16) = **1408 px** wide. Below that, none are drawn. The page's box is the
  area `AccountantLayout` gives the page (the window minus the sidebar, if the user has one,
  minus the 32 px of padding).
- **They repeat the bottom buttons:** the same two destinations (the neighbours fixed when the
  page opened), the same tab and list state in the address, and the same dimmed, not-a-link state
  when there is no neighbour or the neighbours are not ready.
- **Look (the design's):** 48 px high, 8 px radius, white, a 1 px `#10365a` border (`darkBlue`),
  a light shadow, 15 px medium text in `#10365a`, filling the 168 px rail. Previous: an arrow
  pointing left and `Previous Task`; Next: `Next Task` and an arrow pointing right. The bottom
  buttons in the app are grey and 40 px high (spec 10 built them so); they are not changed here,
  so the two sets do not look the same.
- **Sticky:** a rail starts 48 px below the top of the page's box (`padding-top: 48px`) and its
  button sticks 24 px below the top of the scrolling area (`top: 24px`), so it follows the page
  as it scrolls. The scrolling area is the app's `<main>`.
- **A pointer shortcut, hidden from assistive technology:** each rail has `aria-hidden="true"`
  and its link `tabIndex={-1}`: the bottom buttons are the accessible ones (the design README
  says so).
- **Only in the internal view** (Information and Messages). In Customer view the bottom buttons
  are hidden, and so are the side ones.
- **The mechanism is a `ResizeObserver` on the page's box, not a CSS container query.** A
  container-query box applies layout containment, which makes it the containing block of its
  `position: fixed` descendants, and the New Task window (spec 14) is `position: fixed` and
  rendered inside the page. The rule above is the same either way.
- **Nothing is drawn until the width is measured** (the first frame has no side buttons); the
  column does not move when they appear, because the rails are symmetric.
- **The permissions matrix does not change:** the same links, the same people.

## 2. Research findings

- `components/InvoicePage.tsx` returns one root, `mx-auto max-w-[1040px] px-8 pb-14 pt-2`, with
  "Back to tasks", the sticky header and tab bar, the content box with the bottom buttons
  (`FooterLink`: `h-10`, `border-gray-300`, `text-sm`), then `NewTaskWindow` and
  `RecordPaymentDialog`. `neighbourHref(id)` already returns a link or null (null until the
  neighbours are ready).
- **The page's frame:** `src/app/accountant/layout.tsx` wraps the page in
  `<div className="p-4">`; `components/SignedInComponents.tsx` puts it in
  `<main className="flex-1 bg-gray-50 overflow-auto">` next to the sidebar
  `components/sidebar/Sidebar.tsx` (`w-56`, 224 px, drawn when the role's `showSidebar` is true,
  which it is for admin and accountant).
- **`NewTaskWindow.tsx`** is `className="fixed z-40 …"`, rendered inline (no portal), with its
  place computed against the viewport (`windowRect.ts`).
- The app already measures boxes with `ResizeObserver` (for example `app/accountant/page.tsx`);
  there is no shared hook, so a small one is added.
- **Design** (`Invoice.dc.html`, `InvoiceWide.dc.html`): the outer
  `display:flex; justify-content:center; align-items:stretch; gap:16px`; the rail
  `flex:0 0 168px; padding-top:48px`, shown from a 1440 px window; the button
  `position:sticky; top:24px; height:48px`; the column `flex:0 1 1040px; min-width:0`. README
  change 7.
- **Not verified in a browser** (the pane could not load a test page): that a sticky element
  inside a flex rail follows the `<main>` scroll as drawn. It is ordinary sticky positioning
  with no `overflow` between the rail and `<main>`; check it at build time.

## 3. Design

All under `src/features/accountantCollections/`.

- **`utils/sideLinkRoom.ts`** (new): constants `COLUMN_WIDTH = 1040`, `RAIL_WIDTH = 168`,
  `RAIL_GAP = 16`, `MIN_WIDTH_FOR_SIDE_LINKS = COLUMN_WIDTH + 2 * (RAIL_WIDTH + RAIL_GAP)`
  (1408), `hasRoomForSideLinks(width: number | null): boolean` (null or below the minimum is
  false) and `sideLinksShown(enabled: boolean, width: number | null): boolean`, which is
  `enabled && hasRoomForSideLinks(width)`.
- **`hooks/usePageWidth.ts`** (new): `usePageWidth()` returns `{ ref, width }`; the width is
  `ref.current.clientWidth`, measured in an effect and again on every `ResizeObserver` callback;
  `null` until the first measure; the observer is disconnected on unmount.
- **`components/InvoicePageFrame.tsx`** (new): two exports.
  `InvoicePageFrameView({ rails, previousHref, nextHref, frameRef, children })`: an outer `div`
  (`w-full`, `ref`) holding a `flex items-stretch justify-center gap-4` row of left rail, the
  column (`min-w-0 flex-[0_1_1040px] px-8 pb-14 pt-2`, which is today's root without `mx-auto`)
  and right rail; the rails are drawn only when `rails` is true, each `aria-hidden="true"`,
  `w-[168px] shrink-0 pt-12`, with a `sticky top-6` link inside.
  `InvoicePageFrame({ sideLinks, previousHref, nextHref, children })` calls `usePageWidth` and
  passes `rails = sideLinksShown(sideLinks, width)`. The link is a `next/link` `Link` with
  `tabIndex={-1}`, or a dimmed `span` with `aria-disabled` when its href is null.
- **`components/InvoicePage.tsx`** (changed): the main return is wrapped in `InvoicePageFrame`
  (`sideLinks={!customerView}`, the two hrefs from `neighbourHref`); the old root's classes move
  into the frame. The "Invoice not found" and "Loading invoice…" branches keep their own roots
  and have no side buttons. The footer is not changed.

## 4. Behaviour scenarios

Playwright, written, **not run**. Roles: accountant, admin. S69 to S71.

- **S69** In a 1800 px wide window both side buttons exist, each outside the column's box (left
  of its left edge, right of its right edge), and after scrolling the page they are still in
  view; the bottom buttons are there too.
- **S70** In a 1440 px wide window there are no side buttons and the bottom ones are there;
  widening the window to 1800 px adds the side buttons and narrowing it back removes them, with
  no reload.
- **S71** A side button goes where the same bottom button goes (same address: the event, the
  tab and the list state); at the first event Previous is dimmed on both, at the last event Next
  is; Customer view hides the side buttons.

## 5. Tests

Red first.

- **`sideLinkRoom.test.ts`:** the minimum is 1408; `hasRoomForSideLinks` for null, 0, 1407, 1408,
  1409 and 2560; `sideLinksShown` is false when disabled (Customer view) even with room, and
  false with no measured width.
- **`InvoicePageFrame.test.tsx`** (static markup of the pure view): with `rails` true both rails
  are drawn, `aria-hidden="true"`, each link has `tabindex="-1"`, the classes `sticky` and
  `top-6`, the labels in the right order with their arrows; with `rails` false neither is drawn
  and the column is the same; a null href gives the dimmed span and no link; the column's
  classes carry today's root padding and `flex-[0_1_1040px]`.
- **`InvoicePage.test.tsx`:** the existing cases keep passing. Static markup measures nothing, so
  no side buttons are drawn there and the bottom buttons stay the only Previous / Next Task
  links (the tests that look for those links are not disturbed).
- **Gate:** `npm run tc`, `npx vitest run`, `prettier --check` on the touched files. E2E:
  written, **SKIPPED** (not run locally, by instruction). The layout itself, and that the
  buttons stay sticky, are checked by S69 to S71 only; a browser check at build time is
  advised.

## 6. Files

**Counted: 4 files** (limit 10): `utils/sideLinkRoom.ts`, `hooks/usePageWidth.ts`,
`components/InvoicePageFrame.tsx`, `components/InvoicePage.tsx`. **Not counted:** the tests and
the Playwright specs. Nothing in the database, the sync rules, `AppSchema.ts` or
`permissionPageData.ts`.

## 7. Edge cases and error handling

- **A role with no sidebar** has more room: the rule is on the page's box, so the side buttons
  simply appear earlier.
- **Browser zoom and the scrollbar** change the box's width and so the moment the buttons
  appear; no special handling.
- **A short window:** `top-6` keeps the button 24 px from the top of the scrolling area; the
  sticky header of the page is inside the column and does not overlap the rails.
- **The New Task window** can be dragged over a rail; it sits above (`z-40`) and the rail stays
  usable around it.
- **The neighbours are not ready** (the list is still loading): both side buttons are dimmed,
  as the bottom ones are.
- **`ResizeObserver` is missing** (an old browser, a test): the width stays null and only the
  bottom buttons show.

## 8. Out of scope

- Changing the bottom buttons (their size or colour), keyboard shortcuts, narrower arrow-only
  side buttons (decided: as drawn), side buttons anywhere but the invoice page.
- The header and the tab bar (17, 12).
