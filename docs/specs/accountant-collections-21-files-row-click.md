# Accountant Collections 21: the whole Files row opens the file

Status: **Draft**, written 2026-11-11, waiting for "Approved". 0 open decisions (one answered,
§1); readings to confirm in §1.
Build order: **21**. Needs: [13](accountant-collections-13-task-history-and-files.md). Needed by:
none. Branch: `q4-sprint3-finance`.

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

- **The whole row of the Files table is clickable** (the design: README change 6).
- **A click either downloads the file or opens it in a new window;** the file must not open in
  the page's own window, as it does now.
- **The delete button stays where it is and looks the same.** Its rule is spec 13's: only a file
  attached by hand (`source = 'upload'`) has it, and it asks "Delete file?" first.

**Decision taken by the user (asked, 2026-11-11):**

- **D1 What a click does.** Asked: everything in a new tab; by file type (PDF and images in a new
  tab, the rest downloaded); or everything downloaded. The user's answer: **everything in a new
  tab.** A click on the row opens the file in a new tab: the browser shows what it can (PDF,
  images) and downloads what it cannot (Word, Excel). **The Download icon really downloads** the
  file and never takes the page away.

**Replaces in spec 13:** §1, "The file name is plain text. The design draws no link" and the
reading that a file is opened "only through Download"; §7, "Images only download here".

**Readings to confirm at review:**

- **How the row is clickable.** The File Name cell holds a real `<button type="button">` with the
  name, and an overlay (`after:absolute after:inset-0`) stretches it over the whole row, as
  `CollectionsTable` does with its link and as the design does (`.iv-rowlink::after`). The Action
  cell sits above the overlay (`relative z-10`), so a click on Download or Delete does what it
  did and does not also open the file. No other cell needs a handler.
- **Hover and focus.** The row gets a light grey background and the name is underlined on hover;
  the pointer is a hand. The name button is the Tab stop; Enter and Space open the file; while it
  has keyboard focus the whole row shows a 2 px outline in the page's blue (`lightBlue`). The
  design draws the same.
- **Tooltip** of the name button: "Opens the file in a new tab".
- **Opening.** The new tab is opened in the click itself (a tab opened after an `await` can be
  blocked), cut off from the page (`opener = null`), and then pointed at a fresh signed link
  (one hour, as today). If the signed link cannot be made, the blank tab is closed and a toast
  says `Could not open the file` with the reason. If the browser blocks the tab, the toast says
  to allow pop-ups for this site (the wording of Open PDF, spec 15).
- **Download.** The link is asked for with the storage "download" flag (the file name), so the
  storage answers with `Content-Disposition: attachment` and the browser saves the file without
  leaving the page. It is clicked through a temporary anchor with no `download` attribute (the
  header does the work). A failure shows the existing `Download failed` toast.
- **A row with no `storage_path`:** the name is plain text, the row is not clickable and has no
  hover; Download and Delete are disabled, as now.
- **The quote card's Files tab is not changed.** The shared helper only gains an optional
  parameter.
- **The permissions matrix does not change:** the same people open and download the same files.

## 2. Research findings

- **Today's Download** (`components/InvoiceFiles.tsx`, `handleDownload`): asks for a signed link
  (`createEventFileUrl`) and clicks an anchor with `link.download = row.name`. The link points to
  Supabase Storage's own host, and browsers ignore `download` on a link to another origin, so the
  click navigates the page's own tab (a PDF opens in it, which is what the user sees). Not
  verified in a browser; the code and the user's report agree.
- **`createEventFileUrl(supabase, storagePath)`**
  (`quotesAndBookings/utils/eventFileStorage.ts`, from spec 13) picks the bucket (`contracts/`
  prefix: the `contracts` bucket, any other path: `event-files`) and calls
  `createSignedUrl(path, 3600)`. The quote card's `FilesTab` and `InvoiceFiles` use it.
- **The installed storage client** (`@supabase/storage-js` 2.7.1, under supabase-js 2.49.4):
  `createSignedUrl(path, expiresIn, options?: { download?: string | boolean; transform? })`; a
  `download` value makes the link return `Content-Disposition: attachment`, with the string as
  the file name.
- **`OpenPdfButton.tsx`** exports `openSignedPdf({ target, openTab, createSignedUrl, showError })`:
  opens the blank tab first, cuts `opener`, points it at the signed address, closes it on an error
  and has its own wording about the PDF. The pattern to follow; it is not reused because of that
  wording, and spec 15's code is not touched.
- **`CollectionsTable.tsx`** makes a whole table row a link with a `Link` in the first cell and
  `after:absolute after:inset-0` on it (the `tr` is `relative`).
- **Design** (`Invoice.dc.html`): `.iv-row{position:relative;cursor:pointer}`,
  `.iv-row:hover{background:#f9fafb}`, `.iv-rowlink::after{content:"";position:absolute;inset:0}`,
  `.iv-row:hover .iv-rowlink{text-decoration:underline}`,
  `.iv-row:has(.iv-rowlink:focus-visible){outline:2px solid #1d62a3;outline-offset:-2px}`,
  `.iv-rowact{position:relative;z-index:1}`; the name is a `button` titled "Click to open or
  download the file" (written before D1).
- **Tests that pin the old behaviour:** `InvoiceFiles.test.tsx`, "writes the file name as plain
  text: no link, and no name inside a button" (changes with this spec); the others in
  `FilesTable` (Download on every row, Delete by source, disabled without a path) stay.
  `FilesTab.test.ts` and `eventFileStorage.test.ts` must keep passing.
- **A bucket note from spec 13 still stands:** whether an accountant can open a `signed_contract`
  file (bucket `contracts`) was not verified; its policy is not in `supabase/migrations`.

## 3. Design

- **`src/features/quotesAndBookings/utils/eventFileStorage.ts`** (changed):
  `createEventFileUrl(supabase, storagePath, options?: { download?: string | boolean })`; when
  `options` is given it is passed as the third argument of `createSignedUrl`; without it the call
  is exactly as before.
- **`utils/openFileInNewTab.ts`** (new): `openFileInNewTab({ openTab, createUrl, showError })`:
  `openTab()` first (null means blocked: `showError` with the pop-up wording and no link is
  asked for); `opener = null`; `tab.location.href = await createUrl()`; on an error close the tab
  and `showError(["Could not open the file", reason])`. The same shape as `openSignedPdf`, with
  file wording; it never throws.
- **`components/InvoiceFiles.tsx`** (changed): `FilesTable` gets `onOpen(row)`; the row is
  `relative` with the hover and focus styles of §1; the name cell holds the button (or plain text
  without a path); the action cell is `relative z-10`. `InvoiceFiles` adds `handleOpen`, which
  calls `openFileInNewTab` with `window.open("", "_blank")` and `createEventFileUrl`, and changes
  `handleDownload` to ask for `{ download: row.name || true }` and click an anchor without the
  `download` attribute.

## 4. Behaviour scenarios

Playwright, written, **not run**. Roles: accountant, admin. S65 to S68. The existing S25 (a
Download starts a file) stays and now describes a real download.

- **S65** A click on a row, away from its buttons, opens the file in a new tab (the popup's
  address is a signed link to the file); the invoice page stays on the same event and tab.
- **S66** The Download icon starts a download with the file's name and opens no tab; the page's
  address does not change.
- **S67** Delete (and cancelling its confirmation) opens no tab; with the keyboard, Tab reaches
  the name and Enter opens the file; the row shows the focus outline.
- **S68** A row with no storage path is not clickable and its two buttons are disabled.

## 5. Tests

Red first.

- **`eventFileStorage.test.ts`:** with `{ download: "a.pdf" }` the option reaches
  `createSignedUrl` for a `contracts/` path and for any other; without options the call is as
  before (the existing cases).
- **`openFileInNewTab.test.ts`:** the tab is opened before the link is asked for; `opener` is
  cut; the tab is pointed at the link; a blocked tab shows the pop-up toast and asks for no link;
  a failing `createUrl` closes the tab and shows the toast with the reason; it never throws.
- **`InvoiceFiles.test.tsx`:** the name is a button inside the row, with the overlay classes;
  the Action cell is above it; a row without a path has the name as plain text and no button;
  the title; Download and Delete are as before; `handleDownload` asks for the link with the
  download flag and the file name.
- **Gate:** `npm run tc`, `npx vitest run`, `prettier --check` on the touched files (note that
  `FilesTab.tsx` and `FilesTab.test.ts` were not Prettier-clean at an earlier `HEAD`; they are not
  touched). E2E: written, **SKIPPED** (not run locally, by instruction).

## 6. Files

**Counted: 3 files** (limit 10): `quotesAndBookings/utils/eventFileStorage.ts`,
`utils/openFileInNewTab.ts`, `components/InvoiceFiles.tsx`. **Not counted:** the tests and the
Playwright specs. Nothing in the database, the sync rules, `AppSchema.ts` or
`permissionPageData.ts`.

## 7. Edge cases and error handling

- **Pop-ups blocked:** the toast with the wording of Open PDF; nothing else happens.
- **The signed link fails** (offline, a storage error): the blank tab is closed, the toast
  `Could not open the file` with the reason. Opening a file is online only, as before.
- **The object is missing in storage:** the new tab shows the storage's own error page; this
  cannot be told from here, and the quote card behaves the same.
- **A file the browser cannot show** (Word, Excel): the new tab starts the download and may
  close itself, as browsers do.
- **A click on the grey space of the row** opens the file; a click on Download or Delete never
  does.
- **A long name:** cut with an ellipsis and the whole name in `title`, as spec 13 built it.
- **A row that is being deleted** (the confirmation is open): the dialog sits above; the page
  behind is not clickable.

## 8. Out of scope

- Previewing files inside the page; changing the quote card's Files tab; renaming; drag and
  drop; choosing open or download by file type (decided: new tab for all).
- The Task History table (18, 19), Open PDF (15).
