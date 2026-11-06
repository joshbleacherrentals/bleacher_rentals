# Accountant Collections 13: Task History and Files in Information

Status: **Implemented 2026-11-02** (approved by the user the same day, readings of §1 included).
Deviations, none changing a locked type or contract:
(1) **A contradiction in the spec, decided by the user.** §1 and §3 say `FilesTab`'s behaviour does
not change, §5 lists "a storage error is thrown" for the removal. The user chose "as the card does
now": `removeEventFile` does not read the answer of the storage `remove`, the row is deleted
either way, and only the error of the row delete is thrown. "A storage error is thrown" therefore
holds for the signed link only; one more test pins that a storage error does not stop the row delete;
(2) **A gap filled with the card's wording.** The spec gave no text for an event with no files; the
table says "No files uploaded yet", as the quote card does. Change it in `FilesTable` if another is
wanted;
(3) the errors and refusals use `createErrorToastNoThrow` (same texts), not `createErrorToast`,
which throws after showing the toast: with it, one refused file of a batch would drop the others
and a failed upload would end in an unhandled rejection;
(4) after an upload failure the staged list keeps only the files that did not go up (each file
leaves the list as soon as it is uploaded), so a retry does not send a file twice;
(5) `InvoiceInformation` gives `InvoiceFiles` `key={eventId}`: Previous Task and Next Task change
`?id=` without leaving the page, and without the key the files staged for one event would be
uploaded to the next; `InvoiceInformation.test.tsx` (new) reads the element tree for it;
(6) `zonedDate` in `invoiceView.ts` is now exported so `invoiceFiles.ts` writes dates as the rest of
the page does; `StagedFilesList`, `FilesTable` and `splitRefused` are exported from
`InvoiceFiles.tsx` for the tests (same file, no new file);
(7) the new matrix sentence stands after "...writes the next task." and before the Messages
sentence, so "Its Information tab" reads as the invoice page;
(8) Playwright: S24 to S29 are in `collections.accountant.spec.ts` in full and S24 to S26 in
`collections.admin.spec.ts` in a lighter form; S6, S7, S9, S12, S17, S20, S23 and the paths of
S13 to S19 were rewritten for the missing Tasks tab (the Done / Next Task modal still opens from
New Task until spec 14); `helpers/collectionsFixtures.ts` gained `addTask`, `addEventFile`,
`eventFilesOf` and `cleanupBookings` now removes the stored objects. Written and **not run**;
(9) `FilesTab.tsx` is not Prettier-clean at `HEAD`, so it was not reformatted; its edits follow its
own style.
Not verified: that an accountant can open a `signed_contract` file (bucket `contracts`): the bucket's
policy is not in `supabase/migrations`, and the quote card has the same dependency.
Original header: written 2026-11-02; 0 open decisions, readings to confirm in §1.
Build order: **13**. Needs: [12](accountant-collections-12-tabs-and-messages.md). Needed by: 14.
Branch: `q4-sprint2-collections`.

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

- **The Tasks tab is removed.** Its table moves into Information as **Task History**, columns
  `#`, `Date`, `Note`, the first section of Information (the design puts it at the top).
- **The open task is the last row** of Task History, marked Open (decision 1).
- **Files** is a table at the end of Information, after Payment History, with the columns
  `#`, `File Name`, `Type`, `Date`, `Action` and an **Attach File** button in its header. It lists
  the files attached to the quote / invoice: the same rows as the quote card's Files tab.
- **Download** is on every row; **Delete** only on files attached by hand, `source = 'upload'`
  (decision 5). The signed contract, the sent quote PDF and e-mail attachments have no Delete.
- **Attach File:** the chosen files are listed and a **Save** button uploads them; there is no
  drag and drop (decision 5).

**Replaces in spec 09:** §0 decision 10 (tabs Information and Tasks, "No open task"), §3
`InvoiceTasks.tsx`, scenarios S6 and S9, §8 "A stale `tab`" (any value other than `messages` now
opens Information, so an old `tab=tasks` link lands on Information).

**Readings to confirm at review:**

- **Order of Task History.** Oldest due date first, numbered 1 to n; the open task last (the
  design draws the history oldest first); equal dates: the task created first comes first.
- **The Date column** uses the list's wording (`followUpLabel`, spec 07): `11 days ago`,
  `Month ago`; for the open task `Due Today`, `Due tomorrow`, `3 days after`, or `N days ago` when
  it is overdue. It is relative only, as the old Tasks tab was.
- **The Open mark** is a small blue tag `Open` after the note; the design draws none (the open
  row is the user's later answer).
- **Empty history:** one row "No tasks yet.".
- **Type** is the file name's extension in capitals (`PDF`, `PNG`, `DOCX`), `—` without one. The
  quote card prints the end of the mime type, which for Office files is a long string.
- **Date** of a file is `created_at` in the office's time zone, `MMM d, yyyy`, like the page's
  other dates.
- **The file name is plain text.** The design draws no link; the quote card opens the file from
  the name, this table only through Download.
- **Order of files:** `created_at`, oldest first, as on the quote card.
- **Delete** asks "Delete file?" first (the quote card's confirmation), removes the stored object
  and the row; a failure shows an error toast and the row stays.
- **Attach File** uses the quote card's list: after choosing, `Ready to Upload (N)` with each
  file's name or thumbnail, an X to drop one, `Clear All`, and `Save`. A file the card would refuse
  (type, 20 MB) is refused with the same toast. Several files can be chosen at once.
- **A shared helper.** The storage steps (which bucket a path belongs to, the signed link, the
  delete) are in one new file used by both this table and the quote card's `FilesTab`, so the
  `contracts/` prefix rule lives once. `FilesTab`'s behaviour does not change.
- **Online only.** Upload, Download and Delete go to Supabase Storage, as on the quote card. The
  list itself reads the local table.
- The permissions matrix gets one sentence in the Collections row (§3); the accountant and admin
  already may add and delete files on any quote (matrix row "Quote Files").

## 2. Research findings

- `InvoiceInformation.tsx` draws, in order: the invoice / account manager strip, the contacts, the
  Venue and Event cards, Money, Payment Schedule, Payment History.
- `useInvoiceData().tasks` is `{ open: TaskView | null, completed: TaskView[] }` from
  `buildTaskLists` (`utils/invoiceView.ts`): completed newest due date first, ties newest created
  first. `TaskView` is `{ id, dueDate, note, followUpLabel }`.
- `FilesTab.tsx` (quote card): reads `EventFiles` (`id, event_uuid, file_name, storage_path,
mime_type, file_size_bytes, source, uploaded_by, created_at`) where `event_uuid`; a path starting
  with `contracts/` lives in the `contracts` bucket, any other in `event-files`; the signed link
  lives 3600 s; Delete removes the object and the row; upload is `uploadEventFile` with the Clerk
  user id and source `upload`; `fileRefusal`, `ACCEPTED_TYPES`, `MAX_SIZE_MB` come from
  `utils/eventFileUpload.ts`.
- Sources written by the app: `upload`, `sent_quote`, `signed_contract`, `email_attachment`.
- `EventFiles` is in `AppSchema.ts` and syncs to the accountant and the admin (checked in
  `../br_powersync/config/sync_rules.yaml`). The table and the `event-files` bucket are open to
  every signed-in user (RLS `using (true)`).
- The design (`Invoice.dc.html`): Task History first with `#`, `Date`, `Note`; Files last, header
  button with a paperclip; `Signed_Contract.pdf` has Download only, `Check_Scan.pdf` Download and a
  red Delete.
- Nothing is added to the database or the sync rules.

## 3. Design

All under `src/features/accountantCollections/` unless stated.

- **`utils/invoiceView.ts`** (changed): `buildTaskHistory(tasks)` returns
  `TaskHistoryRow[]` = `{ number, id, dateLabel, note, isOpen }`: the completed tasks reversed to
  oldest first, then the open one; numbers 1 to n. `buildTaskLists` stays (it feeds
  `useInvoiceData`).
- **`utils/invoiceFiles.ts`** (new): pure. `buildFileRows(files, timezone)` returns
  `{ number, id, name, typeLabel, dateLabel, storagePath, canDelete }[]` sorted by `created_at`;
  `fileTypeLabel(name)`; `canDeleteFile(source)` is `source === "upload"`.
- **`src/features/quotesAndBookings/utils/eventFileStorage.ts`** (new): `eventFileLocation(path)`
  returns `{ bucket, path }`; `createEventFileUrl(supabase, storagePath)`;
  `removeEventFile(supabase, { id, storage_path })`. The three steps now inside `FilesTab`.
- **`src/features/quotesAndBookings/components/quoteDetail/tabs/FilesTab.tsx`** (changed): calls
  the helpers; nothing else.
- **`components/TaskHistoryTable.tsx`** (new): the section "Task History", the table, the Open
  tag, the empty row.
- **`components/InvoiceFiles.tsx`** (new): the section "Files": the query on `EventFiles`
  (`useTypedQuery`, `expect<T>()`), the header with Attach File, the staged list, the table with
  Download and Delete, the confirmation, the toasts. A hidden `<input type="file" multiple
accept={ACCEPTED_TYPES}>`.
- **`components/InvoiceInformation.tsx`** (changed): Task History first, Files last; new prop
  `tasks`.
- **`components/InvoicePage.tsx`** (changed): `TABS` is Information and Messages; the Tasks panel
  and the `InvoiceTasks` import go; `tasks` is passed to Information.
- **`utils/invoiceUrl.ts`** (changed): `InvoiceTab = "info" | "messages"`; `parseInvoiceTab` gives
  `messages` or `info`.
- **Deleted:** `components/InvoiceTasks.tsx` and `InvoiceTasks.test.tsx`.
- **`src/features/userAccess/permissionPageData.ts`** (changed): in the Collections description
  add: "Its Information tab shows the booking's task history and its files; the accountant can
  attach files and delete the ones attached by hand." Levels and notes stay.

## 4. Behaviour scenarios

Playwright, written, **not run**. Roles: accountant, admin. S24 to S29. The existing S6 and S9 in
`collections.accountant.spec.ts` (they open the Tasks tab) are rewritten for this spec and spec 14.

- **S24** Information opens with Task History: completed tasks oldest first, the open one last
  with Open; an event with no tasks says "No tasks yet."; there is no Tasks tab and
  `?tab=tasks` opens Information.
- **S25** Files lists the event's files; each has Download; a Download starts a file.
- **S26** Delete appears only on a file attached by hand; the confirmation deletes it and the row
  goes; a signed-contract row has none.
- **S27** Attach File: choose two files, `Ready to Upload (2)` shows, drop one, Save; the row
  appears; there is no drop zone.
- **S28** a file of a wrong type or over 20 MB is refused with a toast and is not listed.
- **S29** when a payment closes the open task, its row loses the Open tag after the sync.

## 5. Tests

Red first.

- **`invoiceView.test.ts`:** `buildTaskHistory`: order, numbering, the open task last, equal dates,
  labels for past, today, tomorrow and future, only an open task, no tasks.
- **`invoiceFiles.test.ts`:** type label (`a.PDF` to `PDF`, no extension, several dots), delete
  rule per source, ordering, date in the office time zone, numbering.
- **`eventFileStorage.test.ts`:** `contracts/x/y.pdf` goes to bucket `contracts`, path `x/y.pdf`;
  any other to `event-files`; the signed link and the removal call the right bucket (fake client);
  a storage error is thrown.
- **Component tests (static markup):** the tables' headers and rows; the Open tag; Delete only
  where allowed; the header button; no drop zone; `InvoicePage` has no Tasks tab.
- **`FilesTab.test.ts`** keeps passing (the card's behaviour is unchanged).
- **`permissionPageData.test.ts`:** the new sentence.
- **Gate:** `npm run tc`, `npx vitest run`, `prettier --check` on touched files. E2E: written,
  **SKIPPED** (not run locally, by instruction).

## 6. Files

**Counted: 9 files, plus 2 deleted** (limit 10; the two deletions are the Tasks tab going, one
logic): `utils/invoiceView.ts`, `utils/invoiceFiles.ts`, `utils/invoiceUrl.ts`,
`components/TaskHistoryTable.tsx`, `components/InvoiceFiles.tsx`, `components/InvoiceInformation.tsx`,
`components/InvoicePage.tsx`, `quotesAndBookings/utils/eventFileStorage.ts` (new),
`quotesAndBookings/.../FilesTab.tsx` (changed). **Not counted:** the tests,
the Playwright specs, `permissionPageData.ts`. Nothing in the database, the sync rules or
`AppSchema.ts`.

## 7. Edge cases and error handling

- **Many tasks:** the table grows; no paging.
- **The system completes the open task while the page is open:** the row changes from Open to a
  completed row through the sync.
- **A row with no `storage_path`:** its Download and Delete are disabled.
- **Upload fails** (offline, storage error): the toast "Upload failed" and the list stays so the
  accountant can try again. **Download or Delete fails:** a toast; nothing changes.
- **A long file name** is cut with `title` holding the whole name.
- **Images** only download here; there is no preview.
- **Clerk:** the upload uses the Clerk user id like the quote card; a signed-out session is
  handled by the existing layout.

## 8. Out of scope

- Renaming files, previewing images, drag and drop, the Size and Source columns, sorting the
  tables, the window (14), Open PDF (15), the customer page (16).
