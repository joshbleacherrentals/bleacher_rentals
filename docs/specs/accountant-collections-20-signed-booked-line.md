# Accountant Collections 20: the Signed / Booked line under Invoice

Status: **Draft**, written 2026-11-11, waiting for "Approved". 0 open decisions; readings to
confirm in §1.
Build order: **20**. Needs: [08](accountant-collections-08-invoice-data.md),
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

- **Under `Invoice: {number}`** in the invoice card of the Information tab the page shows
  **Signed:** when and by whom the contract was signed.
- **If the contract became booked but there is no signature,** the line says **Booked:** (when
  and by whom) instead of Signed. "Usually a manager simply changed the invoice to booked after
  getting the signature in person."
- **The look** is the design's (`Invoice.dc.html`, README change 5): a second line in the left
  group of the strip, grey label, the value after it:
  `Signed  Oct 22, 2026 at 3:14 PM EDT by Dana Whitfield`; the Account Manager stays on the right.

**Replaces in spec 09:** §3 `InvoiceInformation`, the strip with Invoice and Account Manager
only; **in spec 08:** `InvoiceData.event` gains the line.

**Readings to confirm at review:**

- **Which line.** An **active signature** gives Signed. With none, an event whose status is
  `booked` gives Booked. Any other event (draft, quoted, lost, unsigned changes) with no active
  signature has no line at all. A signature that was invalidated (the contract was edited after
  signing) does not count; if the event is then booked again by hand, the line reads Booked.
  When both exist, Signed wins (the user's wording).
- **Signed:** the `signed_at` of the active signature, and `signer_name` as typed by whoever
  signed (the customer, or the accountant signing for the customer in Customer view, spec 16).
  With several active rows (the signing route retires the old one first, so normally one) the
  latest is used.
- **Booked: when and by whom come from the same row,** the latest `EventChangeLog` row of the
  event whose `field_name` is `event_status` and whose `next_value` is `booked`. It is written
  by the status button on the quote card (`status_change`) and by the edit page's save
  (`update`); its time is the time and `changed_by_user_uuid` is the manager. Taking both from
  one row keeps "when" and "who" of the same booking when an event was booked, changed, and
  booked again; `Events.booked_at` is not guaranteed to be the time of the latest booking (§2).
- **The fallback.** With no such row (an event booked before status changes were logged), the
  time is `Events.booked_at` and the line has no "by …". With neither, there is no line.
- **The name** of the manager is the one the page already shows for staff (`useUserNames`). A
  user the local `Users` table does not know gives no "by …".
- **The time** is written in the office's time zone (the page's other times), as
  `MMM d, yyyy at h:mm a ZZZZ`, for example `Oct 22, 2026 at 3:14 PM EDT`: the zone's short name
  is part of it, as in the design.
- **Typography:** the label is grey like `Invoice`; the value is regular weight (the invoice
  number is semibold); a long name wraps inside the left group.
- **The permissions matrix does not change:** the line shows data both roles already read.

## 2. Research findings

- **Signed.** `ContractSignatures` (in `AppSchema.ts`): `event_uuid`, `signer_name`,
  `signed_at`, `signed_pdf_path`, `status`, `invalidated_at`, `created_at`, … The signing route
  (`app/api/contracts/sign/route.tsx`) marks the previous active row `invalidated`, inserts a
  new row with `status = 'active'` and `signed_at`, sets the event to `booked` with
  `booked_at = signed_at`, and writes an `EventChangeLog` row `field_name = 'signature'`,
  `action_type = 'sign'` with no user. `hooks/useSignedPdf.ts` (spec 15) already reads the
  active signature for `signed_pdf_path`.
- **Booked.** `utils/statusTransitions.ts`: "`booked` is set when the client signs, or by hand."
  `db/changeQuoteStatus.ts` sets `booked_at` on the way to booked (it does not send it when
  coming back from `unsigned_changes`, and its comment says that keeps the first date) and calls
  `logSingleChange(..., "event_status", from, to, "status_change")`, which stores
  `field_name = 'event_status'`, `next_value = 'booked'` (`serialize` keeps a string as it is)
  and the user's `Users.id`. The edit page's save goes through `logEventChanges`, where
  `event_status` is a tracked field and the row keeps the raw key, with
  `action_type = 'update'`. A database trigger (`sync_events_booked_at_once`, migration
  `20260212175842_scorecard.sql`) sets `booked_at := now()` on every move into booked, a return
  from `unsigned_changes` included, so the code's comment and the trigger may disagree about
  that return (not run). That is why the line takes its time from the log row and uses
  `booked_at` only as a fallback.
- **Local data.** `ContractSignatures`, `EventChangeLog` and `Users` are in `AppSchema.ts`, and
  `../br_powersync/config/sync_rules.yaml` syncs the first two to the accountant and the admin,
  so the line reads the local database; no sync rule or migration is needed.
- **`useInvoiceData`** already holds `quote.eventStatus`, `quote.bookedAt` and the staff names
  (`useUserNames`, `staffNames` in `InvoiceData`); its header says it composes narrow queries for
  what `useQuoteDetail` does not read.
- **Time spellings.** Timestamps in the local database can come in two spellings (a
  Postgres-style `2026-11-03 14:15:00+00` and the app's own `2026-11-03T14:15:00.000Z`), so a
  text sort is not a time sort; `toEpochMs` (`allocatePayments.ts`) parses both, and
  `invoiceFiles.ts` already sorts with it.
- **`utils/invoiceView.ts`:** `inZone`, `zonedDate` (exported) and the private `zonedTime`
  (`h:mm a`) write times in the office's zone with luxon, `en-US`.
- **`InvoiceInformation.tsx`** draws the strip: a div with `Invoice` and the number on the left,
  `Account Manager` and the name on the right, in a flex row that wraps.

## 3. Design

All under `src/features/accountantCollections/`.

- **`utils/invoiceView.ts`** (changed): the types `SignatureRow { signer_name, signed_at }` and
  `BookedLogRow { changed_by_user_uuid, changed_at }`; `zonedMoment(value, timezone)` (the
  `MMM d, yyyy at h:mm a ZZZZ` text; an unparsable value gives an empty string); and
  `buildSignedLine({ signatures, bookedLogs, eventStatus, bookedAt, staffNames, timezone })`
  returning `{ label: "Signed" | "Booked"; text: string } | null` by the rules of §1. The two
  row arrays are every matching row; the builder picks the latest of each with `toEpochMs`.
- **`hooks/useInvoiceData.ts`** (changed): two narrow queries through `useTypedQuery` with
  `expect<T>()`: `ContractSignatures` where `event_uuid` is the event and `status = 'active'`,
  selecting `signer_name, signed_at`; and `EventChangeLog` where `event_uuid` is the event,
  `field_name = 'event_status'` and `next_value = 'booked'`, selecting
  `changed_by_user_uuid, changed_at`. `InvoiceData.event` gains `signedLine`; both queries count
  in `isLoading`.
- **`components/InvoiceInformation.tsx`** (changed): the left group of the strip becomes a
  column: the Invoice line and, when `event.signedLine` is not null, a second line with the label
  and the text.
- **`components/invoiceFixtures.ts`** (changed): the invoice fixture carries a `signedLine`.
- **E2E fixtures:** `e2e/helpers/collectionsFixtures.ts` gets
  `addBookedLog(eventId, { userUuid, at })` (a service-role insert of the
  `event_status → booked` row); `addSignature` (spec 15) is reused for Signed.

## 4. Behaviour scenarios

Playwright, written, **not run**. Roles: accountant, admin. S60 to S64.

- **S60** An event with an active signature shows `Signed` with the date, the time with its
  zone and the signer's name.
- **S61** A booked event with no signature and a status log row shows `Booked` with that row's
  time and the manager's name.
- **S62** With both a signature and a booked log row, the line is Signed.
- **S63** A booked event with no log row shows `Booked` with the `booked_at` time and no name.
- **S64** An event that is not booked and has no active signature shows no second line; an event
  whose signature was invalidated and that is booked again by hand shows Booked.

## 5. Tests

Red first.

- **`invoiceView.test.ts`:** `buildSignedLine` for each rule of §1: Signed alone; Booked alone;
  both (Signed wins); neither; not booked; an invalidated signature is not passed in (the query
  filters it, a test of the hook covers that); several rows, the latest by time in both
  spellings (a space-separated and a `T…Z` value); a missing name; a name unknown to `Users`;
  the fallback to `booked_at`; no time at all. `zonedMoment` in `America/Toronto` in summer
  (`EDT`) and winter (`EST`), near midnight, and with an unparsable value.
- **`InvoiceInformation.test.tsx`:** the second line is drawn under Invoice with the label and
  the text, and left out when `signedLine` is null; Account Manager is still there.
- **`useInvoiceData.test.tsx`:** the two queries (their tables, filters and columns); `isLoading`
  waits for them; the line is built from their rows.
- **Gate:** `npm run tc`, `npx vitest run`, `prettier --check` on the touched files. E2E:
  written, **SKIPPED** (not run locally, by instruction).

## 6. Files

**Counted: 3 files** (limit 10): `utils/invoiceView.ts`, `hooks/useInvoiceData.ts`,
`components/InvoiceInformation.tsx`. **Not counted:** the tests, the Playwright specs and
fixtures, `components/invoiceFixtures.ts`. Nothing in the database, the sync rules,
`AppSchema.ts` or `permissionPageData.ts`.

## 7. Edge cases and error handling

- **The signer's name is blank:** not possible through the signing route (it refuses a blank
  name); a blank value would give `Signed … ` with no "by".
- **A booked event nobody logged** (old data, or booked by the system): the line has the time
  and no name (§1).
- **The manager has left** (`Users` row present with a name): the name still shows; a removed
  row gives no "by".
- **A time zone with no short name:** luxon writes an offset such as `GMT+2`; nothing breaks.
- **The event is signed again after a change:** the new active row replaces the old one; the
  line shows the new time.
- **A failed read** of either query is treated as no rows (the line is simply absent); the page
  has no error state for it.

## 8. Out of scope

- A link to the signed PDF in the line (Open PDF, spec 15, does that); the signer's IP or other
  signing details; showing the line on the quote card.
- Writing a log row for a booking made by the system; filling old events' names.
