# QuickBooks invoice — the create route

Status: **DRAFT 2026-10-22 — awaiting "Approved".** 0 open decisions.
Implementation order: **04 of 10**. Plan: [qbo-invoice-plan.md](qbo-invoice-plan.md).
Branch: `q4-sprint1-finance-role`.
Needs: [01](qbo-invoice-01-link-and-hash.md) (the columns), [02](qbo-invoice-02-customer.md)
(the customer), [03](qbo-invoice-03-payload.md) (the body). Spec 03b (the Class) is not
required to build this, but see the plan: until it is decided an invoice carries no Class.

## 0. The request, and what it is not

`POST /api/quickbooks/invoice` creates the QuickBooks invoice of a booked quote that has none.
The caller sends only the event's id; everything else is read on the server.

It is **not** reachable by any screen yet (spec 07), so no role gains a visible ability here.

**Not part of this spec:** updating an invoice, overwriting one found by number, the
"invoice was deleted" case (spec 05); the totals comparison (spec 06, which hooks in at the
marked step); any screen.

## 1. Decisions (all taken by the user)

**From the user's own words (not options):**

- **Who:** admin and accountant, on a quote of any office.
- **When:** only when the event status is exactly `booked` (user's answer).
- **The link is written by the server with the service role** (plan D1).
- **`is_qbo`** is set to true automatically when the invoice is created.
- **An invoice with the same number already in QuickBooks:** the user is told, and may
  overwrite it. This spec stops and tells; the overwrite is spec 05.
- **Several matching customers:** the accountant chooses (the choice itself is spec 07).
- **The PDF:** the quote's own PDF is attached, not to an email. If attaching fails the
  invoice stays and the user gets a warning (user's answer).
- **The invoice is never sent to the client.**
- **Log:** creating the invoice is written to the quote's Log.

## 2. Research findings

- **A route's rights.** `createServerSupabaseClient` writes with the user's token, which for an
  accountant the `Events` guard narrows to `is_qbo`. The route therefore writes `Events` and
  `EventChangeLog` with a service-role client, as `payments/create-checkout` does, and checks
  the role itself with `requireAdminOrAccountant()` (401 and 403 as thrown `Response`s).
- **Who did it.** `requireAdminOrAccountant()` returns the Clerk id; the Log needs
  `Users.id`, which `resolveUserAccessForRequest(clerkId)` returns as `userId`.
- **Timing.** `create-bill` attaches its PDF after the response (`after()`) because on a plan
  capped at 10 s the render and upload could kill the request after the bill was made. Here
  the warning must be in the response, so the PDF is attached **before** the response, and the
  link is saved **before** the PDF so that a timeout can never leave an invoice nobody knows
  about.
- **Idempotency.** QuickBooks accepts a `requestid` on a write and returns the earlier result
  when the same id is sent again. To verify in a sandbox.
- **Errors.** `interpretQboBillError` is worded for bills; an invoice needs its own wording
  and falls back to QuickBooks' own text for what it does not know.
- **The Log.** `EventChangeLog` rows carry `field_name`, `prev_value`, `next_value` and
  `action_type`; the Log tab names a field through the label map in `logEventChanges.ts`.

## 3. The contract

**Request body:** `{ eventId: string, customerChoice?: CustomerChoice }`
(`CustomerChoice` is spec 02's). Anything else is a 400 "Missing or invalid eventId".

**Response, HTTP 200** — a `status` field says which:

- `created` — `docNumber`, `qboInvoiceId`, `warnings` (a list; may hold `pdf_not_attached`
  with its reason; spec 06 adds the totals result).
- `choose_customer` — `candidates` (spec 02's summaries). Nothing was written to QuickBooks
  or to `Events`.
- `invoice_number_exists` — `invoice`: id, number, customer name, total in cents. Nothing
  was written.

**Errors** — a JSON body `{ error }` with the status:

- 401 / 403 — not signed in / not admin or accountant.
- 404 — no such event.
- 409 — the quote already has an invoice (spec 05 turns this into an update).
- 400 — the event is not `booked`; or any `InvoiceIssue` of spec 03 (the messages joined);
  or the Item or customer error of specs 02 and 03.
- 502 — QuickBooks refused the invoice; the message is the interpreted fault.

## 4. Orchestration — `…/invoice/createInvoice.ts` (new)

In this order; a step that fails ends the request with its error and nothing after it runs.

1. `loadInvoiceSource` (spec 03). No event → 404. Already linked → 409.
2. Status must be exactly `booked`.
3. `validateInvoiceSource`; any issue → 400.
4. Remember the event's current `qbo_invoice_hash` (the hash the invoice will be built from).
   It is read before the data, so a quote edited meanwhile leaves the stored sent hash
   older, which can only read as "outdated", never as "up to date".
5. `findQboItem`.
6. Look for an invoice with this `DocNumber` in the connection's QuickBooks file. Found →
   `invoice_number_exists`, stop.
7. `resolveInvoiceCustomer` with the request's `customerChoice`. `choose` → `choose_customer`,
   stop.
8. `buildInvoicePayload`, then create the invoice, carrying a `requestid` made from the event
   id and the hash of step 4. QuickBooks refuses → 502.
9. Save the link in one `UPDATE Events … WHERE id = ? AND qbo_invoice_id IS NULL`:
   `qbo_invoice_id`, `qbo_invoice_connection_uuid`, `qbo_invoice_sent_hash` (step 4),
   `qbo_invoice_mismatch` false and `is_qbo` true. If no row changed because another request
   linked the same invoice first (same id), carry on; if it linked a different one, fail
   with the message of §8.
10. Write the Log (§6).
11. _Hook for spec 06: the totals check runs here and sets `qbo_invoice_mismatch`._
12. Attach the quote PDF (§5). A failure becomes the `pdf_not_attached` warning.
13. Return `created`.

## 5. The PDF — `…/invoice/attachQuotePdf.tsx` (new)

`attachQuotePdf(connectionId, qboInvoiceId, eventId)` builds the PDF as `api/quotes/[id]/pdf`
does (`buildQuoteDocumentData`, then `renderToBuffer(<QuotePdfDocument …/>)` in the quote's own
language), named `{invoice number}.pdf`, and uploads it to QuickBooks as an attachment of the
invoice, **not** marked to be included when the invoice is sent. It throws on failure; the
caller turns that into the warning. (The upload code of `create-bill` is not reused or
changed; this spec adds its own.)

## 6. The Log — `…/invoice/logInvoiceChange.ts` (new) and `logEventChanges.ts`

- `logInvoiceChange({ eventId, userUuid, kind, docNumber })` inserts into `EventChangeLog` with
  the service role: `field_name` `qbo_invoice`, `prev_value` "None", `next_value`
  "Created (invoice {docNumber})", `action_type` `update`, the user's `Users.id`, the time.
- When `is_qbo` was false before step 9, a second row for `is_qbo`, "No" to "Yes", exactly as
  `setEventIsQbo` writes it.
- `src/features/quotesAndBookings/db/logEventChanges.ts`: the label map gains `qbo_invoice`:
  "QuickBooks Invoice (made by the app)", so the Log tab does not show the raw field name.

## 7. Errors worded — `…/invoice/interpretQboInvoiceError.ts` (new)

Takes QuickBooks' fault and returns text for the accountant. Tax-calculation faults (code
`6000`) say that QuickBooks could not calculate the tax and to check the event address;
anything unrecognised returns QuickBooks' own `Detail`, then `Message`, then "Failed to create
invoice in QuickBooks." A platform error page (504 and the like, no JSON) goes through
`parseQboApiResponse`, whose text says to check QuickBooks before trying again.

## 8. Edge cases and error handling

- **Double press / two tabs.** The same `requestid` makes QuickBooks return the same invoice;
  step 9 then finds its own id already saved and carries on. If a different invoice was linked
  first, the message is "Another invoice was linked to this quote while this one was being
  made. The extra invoice {number} is in QuickBooks; delete it there." (rare; no
  automatic delete).
- **Customer created, invoice fails.** The customer and its link stay (spec 02).
- **Timeout after step 8.** The invoice exists; step 9 may not have run. The next press finds
  the invoice by number (step 6) and offers the overwrite, which links it (spec 05).
- **Timeout between steps 9 and 12.** The link is saved, the PDF is not. The user sees an
  error; Update (spec 05) retries the attachment.
- **A quote edited between steps 4 and 8.** The invoice is built from newer data than the
  stored sent hash; the quote shows "outdated" and Update fixes it.
- **Token expired / refresh gone.** The readable errors of `describeQboAuthError` are passed
  on, with 502.
- **Offline / PowerSync.** The route is online-only (the documented exception: it talks to
  QuickBooks). The columns it writes sync down to every client afterwards.
- **Clerk.** A missing or invalid session is the 401 above; nothing else is touched.

## 9. Behaviour scenarios

Playwright, written, **not run** (they replace the route with a fake, because the real one
reaches QuickBooks):

- **S1** admin posts a booked quote's id: `created`; reloading the quote shows
  `is_qbo` ticked.
- **S2** a quote that is not booked: 400 with the status message.
- **S3** a quote with no invoice number: 400 with the issue's message.
- **S4** an accountant on a quote of another office: allowed.
- **S5** a viewer and an account manager: 403.
- **S6** a quote that already has an invoice: 409.

## 10. Files

**Counted — 7 files** (limit 10):

1. `src/app/api/quickbooks/invoice/route.ts` — new
2. `src/features/quickbooks-integration/invoice/createInvoice.ts` — new
3. `src/features/quickbooks-integration/invoice/qboInvoiceApi.ts` — new: the QuickBooks calls
   (find an invoice by number, create one)
4. `src/features/quickbooks-integration/invoice/attachQuotePdf.tsx` — new
5. `src/features/quickbooks-integration/invoice/logInvoiceChange.ts` — new
6. `src/features/quickbooks-integration/invoice/interpretQboInvoiceError.ts` — new
7. `src/features/quotesAndBookings/db/logEventChanges.ts` — changed: one label

**Not counted:** the test files of §11; the Playwright spec of §9. No migration, no
`AppSchema.ts`, no `database.types.ts`, no `permissionPageData.ts` (nothing reachable by a
person yet; the matrix changes in spec 07).

## 11. Tests and implementation sequence

Red first. Prettier only on touched files.

- **`createInvoice.test.ts`** (QuickBooks, the loader and the database replaced by fakes that
  record calls and order):
  - the order of §4 is kept; a failing step stops the later ones;
  - 409, the booked rule, each issue → 400; nothing is written to QuickBooks in those cases;
  - `invoice_number_exists` and `choose_customer` write nothing to QuickBooks or to `Events`;
  - the saved row has the id, the connection, the sent hash from before the data was read,
    `qbo_invoice_mismatch` false and `is_qbo` true; the update is guarded by
    `qbo_invoice_id IS NULL`;
  - the link is saved before the PDF; a PDF failure still returns `created` with the warning;
  - a QuickBooks refusal returns 502 and writes nothing to `Events`;
  - the `requestid` is the same for the same event and hash and differs for another hash;
  - an `is_qbo` that was already true gets no second Log row.
- **`route.test.ts`:** 401, 403, 400 for a missing or non-uuid id, each `status` is relayed
  with the right HTTP code.
- **`attachQuotePdf.test.ts`:** the file name; the attachment is not set to be sent; a failed
  upload throws.
- **`logInvoiceChange.test.ts`, `interpretQboInvoiceError.test.ts`:** the rows written; each
  fault shape; the fallback chain.
- **Gate:** `npm run tc`, `npx vitest run`, `prettier --check` on the touched files. E2E:
  SKIPPED (not run locally, by instruction). A QuickBooks sandbox run is the user's, before
  release (the fields named "to verify" in specs 03 and 04).

## 12. Risks

- **R1 — the request can be long.** Create, a customer, the PDF render and its upload all
  happen before the response. On a plan capped at 10 s it can time out after the invoice
  exists; §8 says what the user then sees. The route sets a longer `maxDuration`, as
  `create-bill` does.
- **R2 — a duplicate invoice** in QuickBooks is possible in the rare race of §8; it is
  reported, not deleted.
- **R3 — `requestid` behaviour** is not confirmed (§2).

## 13. Out of scope

- Update, overwrite, "invoice deleted" (spec 05); the totals check (spec 06); screens.
- Deleting or voiding an invoice in QuickBooks, including the duplicate of §8.
- Sending the invoice to anyone.
- The QuickBooks Class (spec 03b).
- Changing `create-bill` or sharing its upload code.
