# Event change log 02: files uploaded and deleted

Status: **APPROVED and IMPLEMENTED 2026-11-05, uncommitted** (§3 amended the same day, A1:
`removeEventFile` gets the event id, then approved again). 0 open decisions; readings to confirm in §1.
Build order: **02 of 07**. Needs: [01](event-change-log-01-payment-recorded.md) (the `eventLogInsert`
row builder and the `ActionType` list). Needed by: nothing.
Plan: [event-change-log-plan.md](event-change-log-plan.md). Branch: `q4-sprint3-finance`.

## 0. The change request of 2026-11-05 (the same in all seven specs)

The user asked to refactor the event change log (the `EventChangeLog` table, the Log tab of a
quote). The pages `/accountant/invoice?id={id}` and `/quotes-bookings/{id}` were audited for what
the Log does not record. The user took these decisions (plan §3):

- Must be recorded: Record payment, Upload file, Delete file, the Lost reason and note, a Stripe
  payment received, Payment Schedule changes on the Edit page.
- Not recorded, by the user's choice: Responded / Awaiting, Internal chat, New Task, QuickBooks
  Check again.
- The rows of a status change and of the Edit page move from a direct Supabase request to
  PowerSync. Delete quote stays a direct request.
- Seven small specs, one logic each. Old payments and files are not filled in.

This spec is the second: **Upload file** and **Delete file** write a Log row. Both pages use the
same two helpers: `uploadEventFile` (`utils/eventFileUpload.ts`) and `removeEventFile`
(`utils/eventFileStorage.ts`), called by the quote's Files tab (`FilesTab.tsx`) and by the invoice
page's Files section (`InvoiceFiles.tsx`). Neither writes a Log row.

## 1. What this spec decides

**D4 (plan §3): new row types for files.**

- **Question:** how an uploaded and a deleted file are recorded. "File added" already exists, for
  files added in the send dialog, with the second line "Attached to the email and saved to Files".
- **Options:** new types; or `file_add` for both and only a new delete type.
- **User's answer:** new types, `file_upload` and `file_delete`. One file is one row. `file_add`
  stays as it is, for the send dialog only.

**Readings to confirm:**

- **R1:** `field_name` is `file`, as in `file_add`. An upload has the file's name in `next_value`,
  a delete has it in `prev_value`.
- **R2:** the row is written in the helper, right after the step that makes the change succeed:
  after the `EventFiles` row is inserted (upload), after the `EventFiles` row is deleted
  (delete). A file that failed to upload leaves no row.
- **R3:** a batch of files makes one row per file, each written as soon as its file is up, so a
  failure on the third file leaves rows for the first two.
- **R4:** a Log row that cannot be written never undoes the file. The helper reports it with an
  error toast ("The file was saved, but its Log row could not be written") and goes on.
- **R5:** only files uploaded by hand are written by this spec. The files made by the app (sent
  quote, signed contract, email attachment) have no Delete button and are not changed.
- **R6:** the roles are not checked by the app or the database for files (the matrix row "Quote
  Files" says so), so a viewer's upload or delete is recorded under the viewer's name.
  `permissionPageData.ts` is not edited: nobody gains or loses an ability.

**A1 (amendment of §3, 2026-11-05): how `removeEventFile` learns the quote the Log row belongs to.**

- **Found while starting the implementation:** the first version of §3 gave `removeEventFile` only
  `{ id; storage_path; file_name }` and `changedByUserUuid`, but `logFileDeleted` needs `eventId`
  (the quote whose Log gets the row, `EventChangeLog.event_uuid`). The function did not have it, and
  the `EventFiles` row it deletes cannot give it back after the delete.
- **Question:** who passes the event id into `removeEventFile`.
- **Options:** A, inside the `file` object; B, a separate parameter; C, read from the deleted row
  (`delete().eq("id", id).select("event_uuid")`).
- **User's answer:** **B**, a separate parameter:
  `removeEventFile(supabase, file, { eventId, changedByUserUuid })`. `file` stays
  `{ id; storage_path; file_name }`.

## 2. Research findings

- `uploadEventFile` stores the object in `event-files`, inserts the `EventFiles` row, and removes
  the object again if the insert fails. It is called only by `FilesTab` and `InvoiceFiles`, with
  `source: "upload"`.
- `removeEventFile` removes the object, ignores the answer of that step (the quote card never read
  it), and deletes the `EventFiles` row; it throws the error of the row delete only.
- Both components know the user's Clerk id (`useAuth`), which is stored in `EventFiles.uploaded_by`.
  The Log needs the `Users.id` instead: `usePermissionsStore().userId`.
- The upload and the delete go to Supabase Storage and to Supabase directly, so they work online
  only. The Log row is a local write and is uploaded by PowerSync.
- `LogTab.tsx` knows `file_add`: icon 📎, title "File added: <name>", detail `FILE_ADD_DETAIL`.

## 3. Design

**Types.** `ActionType` gains `"file_upload"` and `"file_delete"`.

**`db/logEventFile.ts` (new).**

```ts
/** After the file went up. Writes one `file_upload` row (field `file`, next = the file name). */
export function logFileUploaded(p: {
  eventId: string;
  fileName: string;
  changedByUserUuid: string | null;
}): Promise<void>;

/** After the file was deleted. Writes one `file_delete` row (field `file`, prev = the file name). */
export function logFileDeleted(p: {
  eventId: string;
  fileName: string;
  changedByUserUuid: string | null;
}): Promise<void>;
```

Each is one `typedExecute(eventLogInsert({...}))`.

**`uploadEventFile`** gains the parameter `changedByUserUuid: string | null`. After the
`EventFiles` insert succeeds it calls `logFileUploaded` with `file.name`; a throw from it is caught,
logged to the console and shown as the toast of R4. The returned id is unchanged.

**`removeEventFile`** (A1) takes `file: { id; storage_path; file_name }` and a third parameter
`{ eventId: string; changedByUserUuid: string | null }`:

```ts
export async function removeEventFile(
  supabase: SupabaseClient<any>,
  file: { id: string; storage_path: string; file_name: string },
  log: { eventId: string; changedByUserUuid: string | null },
): Promise<void>;
```

After the row delete succeeds it calls `logFileDeleted` with `log.eventId`, `file.file_name` and
`log.changedByUserUuid`, with the same catch.

**Components.** `FilesTab.tsx` and `InvoiceFiles.tsx` read `userId` from `usePermissionsStore` and
pass it to both helpers. They pass the file's name into `removeEventFile` (`file_name` / `name`) and
the quote's id as `eventId` (`quoteId` in `FilesTab`, `eventId` in `InvoiceFiles`; both are the
`eventId` they already hand to `uploadEventFile`). Nothing else in them changes.

**`LogTab.tsx`.**

- `ACTION_CONFIG.file_upload`: 📎, green, "File uploaded"; `file_delete`: 🗑️, red, "File deleted".
- `getTitle`: `"File uploaded: " + (next_value ?? "file")` and `"File deleted: " + (prev_value ??
"file")`. `getDetail` is `null` for both.
- `ChangeDetailModal`: one block "File" with the name, and no "Attached to the email" note.

No database change and no sync rules change.

## 4. Behaviour scenarios (Playwright, written, not run)

- **S1:** on the quote's Files tab, stage and save two files; the Log lists "File uploaded: a.pdf"
  and "File uploaded: b.pdf", each with the user's name.
- **S2:** delete one of them; the Log lists "File deleted: a.pdf".
- **S3:** the same upload and delete on the invoice page's Files section; the rows are on the
  quote's Log.
- **S4:** a file refused for its type or size (before any upload) leaves no row.
- **S5:** a file sent from the send dialog still shows "File added", with its note.

## 5. Tests (Vitest)

- `logEventFile.test.ts` (new): the row of each function (field, values, action, author).
- `eventFileUpload.test.ts`: a row after a successful upload; none when the storage step fails;
  none when the insert fails (and the object is removed, as now); a failing Log write does not
  throw and shows the toast.
- `eventFileStorage.test.ts`: a row after the row delete, with the given event id (A1), the file's
  name and the author; none when the delete throws; a storage error still does not stop the row
  delete; a failing Log write does not throw and shows the toast.
- `LogTab.test.ts`: title, detail and modal of both types; `file_add` is unchanged.
- `FilesTab.test.ts`, `InvoiceFiles.test.tsx`: the user id, the event id and the name reach the
  helpers.

## 6. Files

Production, 7: `db/logEventFile.ts` (new), `utils/eventFileUpload.ts`, `utils/eventFileStorage.ts`,
`db/logEventChanges.ts` (`ActionType` only), `components/quoteDetail/tabs/FilesTab.tsx`,
`accountantCollections/components/InvoiceFiles.tsx`, `components/quoteDetail/tabs/LogTab.tsx`.

Tests: the five of §5, and `e2e/fileLog.admin.spec.ts`, `accountantCollections/e2e/fileLog.accountant.spec.ts` (new).

## 7. Edge cases and error handling

- **Offline.** The upload and the delete need the network, so they fail with their own toast and
  leave no row. The row of a file that did go up is local and is uploaded when the connection is back.
- **A batch fails half-way.** The files up before the failure have rows; the staged list keeps only
  the rest (spec accountant-collections-13).
- **Orphaned object.** A failed `EventFiles` insert removes the object and writes no row.
- **The storage step of a delete fails and the row is deleted.** The delete is recorded: the row
  is what the user sees go.
- **No user id** (not loaded). The row is written with a null author and shows "System".
- **Auth error from Clerk.** The upload fails before anything is written, as now.

## 8. Out of scope

- Download and open (reading). Files made by the app. The send dialog's `file_add`.
- Moving `uploadEventFile` and `removeEventFile` to PowerSync (they use Storage).
- A "restore a deleted file". Filling in old uploads (plan D11).
