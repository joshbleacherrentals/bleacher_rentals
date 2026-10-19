# Quote send: recipients, Cc, Bcc, subject and attachments

Status: **Approved by the user on 2026-10-19 and implemented (Playwright written, not run
locally).** Written from the user's
answers of 2026-10-16 and 2026-10-19. Builds on
[quote-send-confirmation.md](quote-send-confirmation.md), which made the review dialog.

## 1. The request

In the review dialog (`SendQuoteDialog`, the screen before an email goes to the customer) the
manager can change, for this one send:

- who gets it: any number of addresses in To, Cc and Bcc;
- the subject;
- the attachments: remove the ones that are there, add files from their computer.

The body of the email is **not** editable (user, 2026-10-16: "без body, бо це може вийти
погано"). It stays what the office's template produces.

The change applies to this send only. The office's template is not changed.

## 2. Decisions taken (user, 2026-10-16)

- **D1, entering addresses:** chips plus suggestions from the address book. The person types
  an address and presses Enter or a comma, and it becomes a chip that can be removed. While
  typing, matching contacts from Companies & Contacts are offered. A typed address works the
  same as a suggested one.
- **D2, the body:** not editable. An earlier idea of editing a text part of the template was
  dropped.
- **D3, attachments:** the person can remove the attachments that are there and add files
  from their computer. Picking a file already in the quote's Files tab was not chosen.
- **D4, a file added from the computer:** it goes into the quote's Files tab and stays there.
  It is uploaded only when Send is pressed, not when the file is picked. Cancelling the dialog
  uploads nothing.
- **D5, what is recorded about the send:** the addresses (To, Cc, Bcc), the subject and the
  list of attachments, in the quote's email log (`EventEmailLog`). The body is not stored.
- **D6, who:** whoever may send the quote may also change these. Today that is an admin or any
  account manager. No new right.

Decisions taken 2026-10-19 (these replace the former open section 8):

- **D7, source of a file added in the dialog (was O1):** a new `EventFiles.source` value
  `email_attachment`, shown as "Email Attachment". `FilesTab.tsx` gets one more label.
- **D8, an empty subject (was O2):** it falls back to the template's subject and, as the code
  does today for an empty rendered one, to the trigger's name and the quote number. Send is
  not disabled for an empty subject. The empty Subject input shows the placeholder
  "Leave empty to send the template's subject".
- **D9, Postmark limits (was O3):** the dialog counts recipients (To, Cc and Bcc together,
  at most 50) and attachment size (about 10 MB in total, counting the quote PDF and the
  template's files), and disables Send with a message that says which limit is exceeded. The
  figures are to be checked against Postmark's documentation at implementation (F9).
- **D10, the "email sent" line in `EventChangeLog` (was O4):** the browser writes To, Cc and
  Bcc together, for example "To: a; Cc: b; Bcc: c". An empty Cc or Bcc part is left out.
- **D11, the quote PDF (was O5):** it cannot be removed from the attachments. The dialog shows
  it without a remove button, and the server ignores `quote_pdf` in `removedAttachmentKeys`.
  Template attachment files (for example FAQs) can be removed. So the quote PDF is always
  attached and always saved to the Files tab as `sent_quote`, as today. A file the person
  added in the dialog and then removed before Send is never uploaded and never saved.
- **D12, the same address in two fields (was the open point in section 9):** the interface
  refuses it. See section 4.

- **D13, a "file added" line per added file (2026-10-19):** for each file the person added in
  the dialog and that went out with the email (an `EventFiles` row with source
  `email_attachment` in the final `addedFileIds`), the browser writes one `EventChangeLog` row
  after the successful send, in the same place and the same best-effort way as the "email sent"
  line (written before it, see below): `action_type` `file_add`, `field_name` `file`, `next_value` the file name. The file lines are written first, in
  dialog order, and the "email sent" line last, each with a strictly increasing `changed_at`
  (base time plus its index in ms), so the Log tab, newest first, shows "Quote Sent to ..." on
  top with the file lines beneath it in the order the files were added. The Log tab's
  Internal Activity list shows it as "File added: <name>" with the second line "Attached to the
  email and saved to Files". The quote PDF and template files are never logged; a file removed
  before Send is never uploaded, so never logged; a file uploaded in a send that failed is
  logged only when a later retry succeeds with it still in the list. The Files tab does not log
  uploads (F7), so this is a new entry type.

## 3. What the code does today (read 2026-10-16)

- **F1, one dialog, two callers:** `SendQuoteDialog` is opened from the quote page
  (`QuoteDetailView`) and from the create form (`CreateQuoteForm`). Both pass
  `recipientEmails`, today the contact's email and the finance contact's. Changing the
  dialog changes both.
- **F2, the preview:** `GET /api/quotes/{id}/send-preview?recipients=a,b` runs the same
  resolver as sending (`resolveTriggerEmail`) and returns `from`, `to`, `subject`, `htmlBody`
  and `attachments` (`name` and `url` each). The body does not depend on the recipients.
- **F3, the send:** `POST /api/quotes/{id}/send` takes `{ recipientEmails }`. It builds the
  quote PDF, calls `sendTriggerEmail`, then saves the PDF into the Files tab with source
  `sent_quote`. `sendTriggerEmail` puts the template's files after the PDF, and sends with
  Postmark. The route checks only that the person is signed in.
- **F4, Cc exists but is not the person's:** `resolveTriggerEmail` returns a `cc`, used only
  for two internal triggers (finance gets a copy). For the quote sent to a client it is empty.
  There is no Bcc anywhere.
- **F5, the development allowlist:** in the development environment an email only goes to an
  address on the allowed list (`guardEmailRecipients`). It filters To and Cc. A Bcc would
  bypass it unless it is filtered too.
- **F6, the logs:** `EventEmailLog` has one row per attempt: `trigger`, `status`, `reason`,
  `to_email` (the To line as one text), `template_id`, `fired_at`. It is written by the server
  only, and shown in the quote's Log tab. The "email sent" line in `EventChangeLog`
  (`logQuoteSentLocal`) is written by the browser after a successful send and holds the
  recipients as one text.
- **F7, the Files tab upload:** `FilesTab` uploads from the browser straight to the
  `event-files` bucket and inserts an `EventFiles` row (source `upload`). Its limit is 20 MB
  a file and a list of accepted types. A source value it does not know is shown as "Upload".
- **F8, a limit of the host:** the server runs on Vercel, where a request body is limited to
  about 4.5 MB. A file therefore cannot travel inside the Send request; it is uploaded to
  storage first and the server reads it from there.
- **F9, Postmark limits (from its documentation, to be checked at implementation):** at most
  50 recipients across To, Cc and Bcc, and about 10 MB for the whole message including
  attachments.

## 4. Behaviour

The review panel on the left keeps From, the Desktop/Mobile switch and the buttons. Four
things become editable:

1. **To, Cc, Bcc.** Three chip inputs. To starts with the addresses the dialog is given today.
   Cc and Bcc start empty. An address that is not valid is refused when typed, with a short
   message. An address that is already present in any of To, Cc or Bcc is refused in the
   same way, with a short message saying where it already is (D12).
2. **Subject.** A text field that starts with the template's subject. If the person clears
   it, the placeholder "Leave empty to send the template's subject" is shown and the
   template's subject is sent (D8).
3. **Attachments.** The list as today. Template attachment files each have a remove button;
   the quote PDF (key `quote_pdf`) is shown without one (D11). An "Add file" button adds
   files. Added files are shown in the list as waiting, and each has a remove button; removing
   one drops it from the dialog and nothing is uploaded.
4. **Send.** Disabled while To has no address and while the message is over a limit (D9): more
   than 50 recipients across To, Cc and Bcc, or attachments over about 10 MB in total. The
   dialog shows a message saying which limit is exceeded. An empty subject does not disable
   Send (D8).

On Send, in this order:

1. The browser uploads each added file still in the list to `event-files` and inserts its
   `EventFiles` row with source `email_attachment` (D4, D7).
2. The browser posts the send with the final To, Cc, Bcc, subject, the template attachments
   removed and the ids of the added files.
3. The server sends, then writes the log (section 6) and saves the quote PDF to Files as
   `sent_quote`, as today (D11).
4. After a successful send the browser writes one "file added" line for each added file (D13),
   then the "email sent" line to `EventChangeLog` in the form of D10, so the Log tab, newest
   first, shows the email on top.

The preview on the right does not change when the left side is edited: the body does not
depend on any of these fields.

## 5. Types

```ts
// src/features/quotesAndBookings/utils/sendQuote.ts
export type SendQuoteInput = {
  to: string[];
  cc: string[];
  bcc: string[];
  subject: string;
  // Attachments of the preview the person removed, by `key` (see SendPreview).
  // The server ignores "quote_pdf" here (D11).
  // An empty `subject` means "use the template's subject" (D8).
  removedAttachmentKeys: string[];
  // EventFiles rows the browser added for this send.
  addedFileIds: string[];
};

export async function postSendQuote(
  eventId: string,
  input: SendQuoteInput,
): Promise<{ ok: true } | { ok: false; message: string }>;
```

```ts
// SendPreview.attachments: each attachment gets a stable key.
export type PreviewAttachment = {
  key: string; // "quote_pdf" or the id of the template's attachment row
  name: string;
  url: string;
  // Size in bytes, so the dialog can count the limit of D9. Filled for the template's files;
  // null for the quote PDF, whose size is not known until the server renders it (the dialog counts
  // the estimate `QUOTE_PDF_ESTIMATE_BYTES`, 1 MB, instead). Optional and additive (user-approved 2026-10-19).
  sizeBytes?: number | null;
};
// No `removable` field: the dialog treats the key "quote_pdf" as locked (D11).
```

```ts
// SendQuoteDialogProps (src/.../sendQuote/SendQuoteDialog.tsx)
// `recipientEmails` stays as the starting value of To; nothing else about the props changes.
```

`POST /api/quotes/{id}/send` takes `SendQuoteInput`. The old `recipientEmails` field is
dropped: the dialog is its only caller.

`sendTriggerEmail` gets optional `cc`, `bcc` and `subject` overrides, and a way to leave out
attachments by key. The development allowlist is applied to Bcc as well as To and Cc (F5).

The chip input and the contact suggestions are a new component, written to be reusable
(three of them sit in the dialog).

Other files touched (besides section 6): `SendQuoteDialog.tsx`, the new chip input component,
`sendQuote.ts`, the send route, the send-preview route (adds `key`), `sendTriggerEmail`
and its test, `FilesTab.tsx` (the "Email Attachment" label, D7), `logQuoteSentLocal` (the
line of D10), `permissionPageData.ts` (section 7).

The 10 MB limit of D9 is checked on the base64-encoded size (raw bytes \* 4/3), as Postmark
counts the encoded message; this is what `checkSendLimits` does. The quote PDF is rendered by
the server, so its size is unknown to the dialog; it counts the documented estimate
`QUOTE_PDF_ESTIMATE_BYTES` (1 MB) for it, and other files count their real size.

## 6. Database

`EventEmailLog` gets three columns, all nullable text (null on rows written before this):

- **`cc_emails`:** the Cc line, as `to_email` holds the To line.
- **`bcc_emails`:** the Bcc line.
- **`subject`:** the subject that was sent.

and one more, for the attachments:

- **`attachment_names`:** the names of the files that were attached, as one text.

Files touched for the schema: a migration, `database.types.ts` (by hand, because
`npm run gtl` is not safe while the local database lags), `AppSchema.ts` (the four columns
in `EventEmailLogCols`), `LogTab.tsx` (to show them). `sync_rules.yaml` is not changed: it
selects `EventEmailLog.*`.

`EventFiles.source` is a free text column. The value written for a file added in this dialog
is `email_attachment` (D7); no migration is needed for it.

## 7. Permissions

D6: no new right. `permissionPageData.ts` gets a new Send To Client row (it did not exist
before; user-approved 2026-10-19): admin and account manager full, every other role none. The
note for the two says the sender can send a quote to the customer and, for that send, change the
To, Cc and Bcc addresses, the subject and the attachments (the quote PDF stays attached).

The send route still checks only that the person is signed in (decision of 2026-09-23 in
`quote-send-confirmation.md`, not changed here). This spec makes that more serious than
before: through the route anyone signed in could now choose any To, Cc and Bcc. Recorded, not
decided here.

## 8. Decisions taken

The former open section 8 (options O1 to O5) is closed by D7 to D11 in section 2. Nothing is
open in this spec.

## 9. Edge cases

- **Uploads succeed, the send fails (D4):** the added files are already in Files. The dialog
  keeps its state, so Try again does not upload them a second time. A file uploaded during an
  attempt whose send then failed stays in Files as an `email_attachment` row even if the
  person removes it from the dialog before retrying; removing and re-adding the same file then
  uploads it again (accepted, per D4 "stays there").
- **Cancel or close before Send:** nothing is uploaded (D4).
- **Offline:** the send needs the server, as before; the dialog shows its error phase.
  Uploading the added files needs it as well.
- **The same address in two fields (D12):** the interface refuses it. On the server, an
  address that still appears in more than one field is sent once, as the first of To, Cc,
  Bcc; this is a defensive de-duplication only.
- **An added file removed before Send (D11):** it is never uploaded and never saved.
- **The quote PDF (D11):** it cannot be removed; a `quote_pdf` key in
  `removedAttachmentKeys` is ignored by the server.
- **Development environment:** an address that is not on the allowed list is dropped from
  all three fields; if To ends empty the send is refused with the same message as today (F5).
- **A file with a name already in the list:** both are attached; names are not made unique.
- **Signed-out session:** the route answers 401 and the dialog shows the "sign in again"
  message, as today.

## 10. Tests

- **Vitest, pure logic:** the address parsing and validation, the refusal of an address already
  present in another of To, Cc, Bcc (and de-duplication within a field), the
  `SendQuoteInput` builder from the dialog state, the fallback to the template's subject when
  the subject is empty, the limit check (recipient count of 50 across the three fields,
  attachment total of about 10 MB including the quote PDF and the template's files), the
  "email sent" change-log line format ("To: a; Cc: b; Bcc: c", empty Cc/Bcc left out).
- **Vitest, "file added" lines (D13):** which files are logged (only the uploaded added files in
  the final `addedFileIds`; none when nothing was added; names kept; nothing before a
  successful send); one `file_add` row per file written before the email line, in dialog order, with strictly increasing `changed_at`; a failing file row does not stop the others or the email row; the Log tab's title and
  second line.
- **Vitest, component:** the dialog shows the placeholder "Leave empty to send the template's
  subject" when the subject is cleared and Send stays enabled; the quote PDF has no remove
  button while template files do; Send is disabled with the message naming the limit when one
  is exceeded.
- **Vitest, server:** `sendTriggerEmail` with `cc`, `bcc`, `subject` and removed attachments
  (the existing `sendTriggerEmail.test.ts` is extended); the allowlist applied to Bcc; `quote_pdf` in the
  removed keys is ignored (the PDF is still attached and saved as `sent_quote`); an empty
  subject sends the template's subject.
- **Vitest, route:** the send route with the new body; a body with no To is refused.
- **Playwright (written, not run locally, as agreed):** a manager opens Send To Client,
  adds a Cc and a Bcc, changes the subject, removes a template file, adds a file, presses Send; the
  Log tab shows the addresses, the subject and the attachment names; the Files tab shows the
  added file.

## 11. Not in scope

- Editing the body (D2).
- Choosing a file already in the Files tab (D3).
- Saving these choices back to the template, or remembering them for the next send.
- A role check on the send route (F6, section 7).
- The reply-to address.
