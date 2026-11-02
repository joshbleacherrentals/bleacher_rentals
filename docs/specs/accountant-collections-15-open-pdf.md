# Accountant Collections 15: Open PDF

Status: **Draft 2026-11-02, waiting for "Approved"**; 0 open decisions, readings to confirm in §1.
Build order: **15**. Needs: [09](accountant-collections-09-design.md). Needed by: nothing.
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

- **The header gets an Open PDF button** (document icon, white outline on the dark header, left of
  the View customer page toggle and Record Payment). It is shown in both views of the page.
- **It opens the signed invoice PDF; if there is none, the quote PDF.**

**Readings to confirm at review:**

- **"The signed one"** is the PDF the app makes the moment the customer signs
  (`ContractSignatures.signed_pdf_path`, stored in the `contracts` bucket, the file the Files table
  lists as "Signed Contract - <quote number>.pdf"). The event's **active** signature counts, the
  newest if there are two. A signature that an edit of the quote has invalidated does not: the
  quote is then no longer what was signed.
- **"The quote PDF"** is the live one the quote card's Contract tab already links to,
  `/api/quotes/<event id>/pdf`, in the contact's language.
- **No signature, or a signature whose PDF was never stored** (`signed_pdf_path` empty: the app
  saves the signature even when the PDF upload failed) opens the quote PDF.
- **A signed PDF that cannot be opened** (the object is gone, no connection) shows an error toast;
  it does **not** fall back to the quote PDF, so the accountant never reads a different document
  by mistake.
- **A new browser tab** opens, so the invoice page keeps its state.
- **While the signature is still being read** from the local table the button is disabled for the
  moment that takes.
- The permissions matrix is unchanged: the accountant and admin already open the same files on the
  quote card (Files tab) and the quote PDF is a public route.

## 2. Research findings

- `ContractSignatures` is in `AppSchema.ts` (`event_uuid, status, signed_at, signed_pdf_path, ...`)
  and syncs to the accountant and the admin (checked in `../br_powersync/config/sync_rules.yaml`);
  `useContractSignature` reads the active signature the same way (newest `signed_at`).
- The sign route (`/api/contracts/sign`) renders `QuotePdfDocument`, stores it as
  `contracts/<event id>/<signature id>.pdf`, writes `signed_pdf_path = "<event id>/<signature
id>.pdf"` (no bucket prefix), and inserts an `EventFiles` row with source `signed_contract` and
  `storage_path = "contracts/..."`. If the upload fails the signature is kept and the path stays
  empty.
- The quote card opens signed files with `createSignedUrl(path, 3600)` on the `contracts` bucket
  (`FilesTab`), through `useClerkSupabaseClient`.
- `/api/quotes/[id]/pdf` is a public route (`src/proxy.ts`) and returns the PDF inline.
- **Not verified from the repository:** the storage policy of the `contracts` bucket (the bucket is
  declared in `supabase/config.toml`; no migration holds a policy). `FilesTab` already opens
  signed contracts for every role that sees the card, so the accountant most likely can. The build
  must check this once by hand; if it is refused, a policy is a separate change, not part of this
  spec.
- A tab opened after an `await` can be blocked by the browser; the usual fix is to open the blank
  tab inside the click and set its address afterwards.

## 3. Design

All under `src/features/accountantCollections/`.

- **`utils/pdfTarget.ts`** (new): pure. `pdfTarget({ eventId, signedPdfPath })` returns
  `{ kind: "signed", bucket: "contracts", path }` when the path is non-empty, else
  `{ kind: "quote", href: "/api/quotes/<eventId>/pdf" }`.
- **`hooks/useSignedPdf.ts`** (new): `useSignedPdf(eventId)` returns `{ signedPdfPath, isLoading }`
  from a narrow query on `ContractSignatures` (`status = 'active'`, newest `signed_at`, one row),
  `useTypedQuery` with `expect<T>()`.
- **`components/OpenPdfButton.tsx`** (new): for a quote target an `<a target="_blank"
rel="noopener noreferrer">` styled as the button; for a signed target a button whose click
  opens a blank tab (`window.open("", "_blank")`, then `opener = null`), asks
  `createSignedUrl("contracts", path, 3600)` through `useClerkSupabaseClient`, and sets the tab's
  address; on an error the blank tab is closed and `createErrorToast` shows the message. If the
  browser blocks the blank tab the toast says so.
- **`components/InvoiceHeader.tsx`** (changed): renders `OpenPdfButton` before the other buttons;
  new prop `eventId`.
- **`components/InvoicePage.tsx`** (changed): passes `eventId` to the header.

The button's tooltip is the design's: "Opens the signed invoice PDF, or the quote PDF if there is
no signed invoice".

## 4. Behaviour scenarios

Playwright, written, **not run**. Roles: accountant, admin. S38 to S40.

- **S38** an event with no signature: Open PDF opens a new tab on `/api/quotes/<id>/pdf`.
- **S39** an event with an active signature and a stored PDF: it opens the signed file (a signed
  URL on the `contracts` bucket).
- **S40** an event whose signature was invalidated, or whose `signed_pdf_path` is empty: it opens
  the quote PDF; a signed path pointing at a missing object shows the toast and opens nothing else.

## 5. Tests

Red first.

- **`pdfTarget.test.ts`:** a path gives the signed target; empty, `null` and blank give the quote
  target with the event's id in the address.
- **`useSignedPdf` test:** the query picks the active signature, the newest of two, ignores an
  invalidated one, returns an empty path as such (on a real SQLite, the pattern of
  `useContractSignature.test.tsx`).
- **`OpenPdfButton.test.tsx` (static markup):** a link for the quote target with
  `target="_blank"` and the right `href`; a button for the signed one; disabled while loading.
- **`InvoiceHeader` markup:** the button is present, before Record Payment.
- **Gate:** `npm run tc`, `npx vitest run`, `prettier --check` on touched files. E2E: written,
  **SKIPPED** (not run locally, by instruction).

## 6. Files

**Counted: 5 files** (limit 10): `utils/pdfTarget.ts`, `hooks/useSignedPdf.ts` and
`components/OpenPdfButton.tsx` (new), `components/InvoiceHeader.tsx` and
`components/InvoicePage.tsx` (changed). **Not counted:** the tests and the Playwright specs. The
permissions matrix is unchanged. Nothing in the database, the sync rules or `AppSchema.ts`.

## 7. Edge cases and error handling

- **Offline:** the signed link and the quote PDF both need the server; the first shows a toast,
  the second the browser's own offline page in the new tab.
- **Two active signatures** (the sign route invalidates the old one first, so this should not
  happen): the newest `signed_at` wins.
- **The quote was edited after signing:** the signature is invalidated, so Open PDF opens the live
  quote PDF, which shows the edit.
- **An event with no contract template:** no signature ever exists; the quote PDF opens.
- **The quote PDF cannot be built** (a server error): the new tab shows the route's error; not
  handled further.
- **Pop-up blocked:** a toast; nothing opens.

## 8. Out of scope

- A QuickBooks invoice PDF, downloading instead of opening, choosing the language, opening several
  signed versions, a storage-policy change for the `contracts` bucket.
