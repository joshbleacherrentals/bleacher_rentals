# Accountant Collections 17: the Open Q/I button

Status: **Draft**, written 2026-11-11, waiting for "Approved". 0 open decisions; readings to
confirm in §1.
Build order: **17**. Needs: [09](accountant-collections-09-design.md),
[15](accountant-collections-15-open-pdf.md). Needed by: none. Branch: `q4-sprint3-finance`.

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

- **The header gets an Open Q/I button.** It opens `/quotes-bookings/{id}` in a separate tab.
  `{id}` is the event's id, the same `eventId` the invoice page works with.
- **Where it stands** is the design's (README, change 1): the first button of the header's
  button group, before Open PDF.

**Replaces in spec 15:** §1, "left of the View customer page toggle and Record Payment": Open
PDF is no longer the first button; Open Q/I is.

**Readings to confirm at review:**

- **A real link.** `<a href="/quotes-bookings/{id}" target="_blank" rel="noopener noreferrer">`,
  not a button that calls `window.open`: a click opens a new tab, and the browser's own "open in
  a new tab" (middle click, context menu) works too. The invoice page is left as it is.
- **The quote opens as the quote card opens by itself:** no `?tab=` is added.
- **Look:** the same as Open PDF (white outline on the dark header, `h-9`, 14 px medium text),
  with the Lucide `ExternalLink` icon and the text `Open Q/I`. Tooltip (`title`): "Opens the quote
  and invoice page of this event in a new tab" (the design's wording).
- **Shown in both views** of the page (Information / Messages and Customer view), as Open PDF
  is; the design draws it in both.
- **Shown to every role that sees the invoice page** (admin and accountant). Both may open
  `/quotes-bookings/{id}`: the accountant has the prefix in `accessConfig` (read-only), the admin
  has every path.
- **The permissions matrix does not change:** the link opens a page the two roles already open;
  nothing new is allowed. `permissionPageData.ts` stays as it is.
- **A missing event** shows "Invoice not found" without a header (spec 09), so no link is drawn.

## 2. Research findings

- `InvoiceHeader.tsx` draws, in one `flex shrink-0 items-center gap-2` group on the right:
  `OpenPdfButton`, the Customer view button, Record Payment (when allowed) and the status badge.
  The group wraps under 820 px (`max-[820px]:flex-wrap`); the name on the left is
  `min-w-0 truncate`, so a fifth button cuts the name with an ellipsis, never moves the buttons
  (the design README says the same for 1040 px).
- `OpenPdfButton.tsx` holds the look in a private constant (`BUTTON`: white outline on the dark
  header, `h-9`, `rounded-md`, 14 px medium) and draws a plain
  `<a target="_blank" rel="noopener noreferrer">` for the quote PDF: the pattern to follow.
- `/quotes-bookings/[id]` exists (`src/app/quotes-bookings/[id]/page.tsx`, with `edit` and
  `preview` below it). The accountant's `allowedPaths` has `/quotes-bookings`; the quote card is
  read-only for them (`accessConfig.ts`).
- `utils/invoiceUrl.ts` holds the links of this feature (`invoiceHref`, `collectionsHref`).
- Design: `Invoice.dc.html` lines 58 to 61 (the button), README change 1.
- Nothing is added to the database, the sync rules or `AppSchema.ts`.

## 3. Design

All under `src/features/accountantCollections/` unless stated.

- **`utils/invoiceUrl.ts`** (changed): `quoteCardHref(eventId)` returns
  `/quotes-bookings/${encodeURIComponent(eventId)}`.
- **`components/OpenPdfButton.tsx`** (changed): the class string `BUTTON` is renamed
  `HEADER_BUTTON` and exported, so the two header buttons share one look. Nothing else in the
  file changes.
- **`components/InvoiceHeader.tsx`** (changed): draws the link first in the button group, with
  the `ExternalLink` icon and `HEADER_BUTTON`. The doc comment lists the new button.

## 4. Behaviour scenarios

Playwright, written, **not run**. Roles: accountant, admin. S49 and S50.

- **S49** The header has Open Q/I before Open PDF; it is a link to `/quotes-bookings/{id}` with
  `target="_blank"` and `rel` containing `noopener`; it is there in Customer view too.
- **S50** A click opens the quote card of the same event in a new tab (the popup event); the
  invoice page stays where it was, with its tab and list state.

## 5. Tests

Red first.

- **`invoiceUrl.test.ts`:** `quoteCardHref` for a uuid; an id with characters that need
  encoding is encoded.
- **`InvoiceHeader.test.tsx`:** the link exists with the right `href`, `target`, `rel` and text;
  it stands before the Open PDF button; it is present with `customerView` on and off, and for a
  header without Record Payment.
- **Gate:** `npm run tc`, `npx vitest run`, `prettier --check` on the touched files. E2E:
  written, **SKIPPED** (not run locally, by instruction).

## 6. Files

**Counted: 3 files** (limit 10): `utils/invoiceUrl.ts`, `components/OpenPdfButton.tsx`,
`components/InvoiceHeader.tsx`. **Not counted:** the tests and the Playwright specs. Nothing in
the database, the sync rules, `AppSchema.ts` or `permissionPageData.ts`.

## 7. Edge cases and error handling

- **A pop-up blocker** does not apply: a click on a link opens its tab.
- **A narrow window** (under 820 px): the buttons wrap with the rest of the group (spec 09's
  rule); nothing new.
- **An id that is not a uuid** cannot reach the header (the page shows "Invoice not found").
- **Opening the quote card in a second tab** starts a second copy of the app in that tab; the
  invoice page's state is untouched.

## 8. Out of scope

- Any change to the quote card; opening it on a chosen tab (`?tab=`); showing the quote inside
  the invoice page; a keyboard shortcut.
- The other header changes: Open PDF (15) and Customer view (16) are as built.
