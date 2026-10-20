# Quote detail page, reactive: plan

Status: **ALL FOUR SPECS IMPLEMENTED 2026-10-15** (written 2026-10-14). Four specs follow from
it; each is its own logic and its own "Approved", and each was committed on its own. The sync
rules of spec 02 are committed in `br_powersync` and not deployed. Page: `/quotes-bookings/[id]`.
Request (user, 2026-10-14): analyse where the quote detail page is not reactive and write a
plan to move it to PowerSync. It was noticed because a title changed in another tab did not
change on an open detail page, and neither did the line items.

## 0. The four specs

- **01, the quote itself:** [quote-detail-01-reactive-quote.md](quote-detail-01-reactive-quote.md).
  Title, status, contacts, address, dates, notes, account manager, deleted flag.
- **02, the contract signature:** [quote-detail-02-contract-signature.md](quote-detail-02-contract-signature.md).
  The Signed banner on the Contract tab.
- **03, the history panels:** [quote-detail-03-history-panels.md](quote-detail-03-history-panels.md).
  The Contact and Venue side panels.
- **04, line items written locally:** [quote-detail-04-line-items-local.md](quote-detail-04-line-items-local.md).
  The Save step that replaces line items.

Each spec stands alone and none needs another to be merged first; the numbering is not a
release order. The user's choice of four specs: "one logic per spec".

**Not in scope of any spec:**

- The change log (`logEventChanges`, `logLineItemChanges`), soft delete (`softDeleteEvent`)
  and the Files tab writes stay direct Supabase writes (D4).
- The edit page: `loadQuoteIntoStore` keeps its one-time read, because a form must not be
  overwritten by another tab while someone types in it.
- The send-quote preview (`/api/quotes/:id/send-preview`): the server renders the email.
- Other pages and the public page `/quote/[id]`.

## 1. Decisions taken

**D1 — the contract signature.** Options: keep the HTTP call; read the local table (the
accountant stream has none, so accountants lose the banner); read the local table and add it
to the accountant stream (needs a sync rules deploy).
User's answer: **read the local table and add it to the accountant stream.** Asked again
after the resync fact (section 2, F5: the deploy makes every web client download its data
again) and confirmed the same day.

**D5 — how the new sync rules line is written** (spec 02, section 1). Options: one line with
the roles joined by OR; one line with no role check; one line on a derived database flag;
separate lines as the file has them. User's answer: **separate lines.**

**D2 — the shape of the quote query.** Options: one query with the five JOINs; small queries
merged in JS (step 1 of [slow-local-db-plan.md](slow-local-db-plan.md)).
User's answer: **small queries and a merge in JS.**

**D3 — the history side panels.** Options: leave them; reactive while open.
User's answer: **reactive while open.**

**D4 — writes that go straight to Supabase.** Options: reads only; reads and line items
local; reads and all four writes local.
User's answer: **reads, and line items local.**

**Answers at review (2026-10-14):**

- Four specs, not one document.
- A change to line items or to other contract terms (Sales Office, event details and so on)
  invalidates the signature; that rule exists and stays. Spec 04 only stops a Save that
  changes nothing from invalidating it (F1).
- No role's rights change; `permissionPageData.ts` is not edited.
- A line item that is already soft-deleted (`deleted = 1`) is left alone; removing an item
  in the form stays a real delete, as now.
- Two people saving one quote: unlikely, and the behaviour is the same as today (spec 04,
  section 6).
- The Signed banner stays hidden when the event has no terms, as the API does.
- `fetchQuoteDetail` stays for the edit loader.

## 2. Findings that shape the plan

**F1 — measured, local database, rolled back (2026-10-14).** Quote `db8b1b09…` (1 line item,
an active signature). Replaying the Save's line item step with the SAME rows (delete them,
insert them back): the signature went `active` to `invalidated` right after the delete and
stayed so after the insert; the `Events` row was updated 0, then 2, then 3 times
(`recompute_quote_hashes` writes `content_hash` and `contract_hash` when the hash moves;
invalidating the signature moves `content_hash` again). So today a Save that changes no line
item still invalidates the signature of a quote that has line items. In production the delete
and the insert are two requests, so these are separate commits replicated to every client.
Not run through the app's UI.

**F2 — read in code.** `updateQuoteEvent` awaits both Supabase calls but never reads their
`error`: a failed delete with a good insert leaves duplicates, a good delete with a failed
insert loses the items.

**F3 — read in a migration comment.** The June 2026 "line-item duplication" came from a row
level security rule that made a delete by another account manager match zero rows without an
error (`20260619120000_relax_event_line_items_rls.sql`); the policies were relaxed to admin
and account manager in the same commit that moved the writes to Supabase. Whether the move
was also needed after the policy change is not recorded.

**F4 — hypothesis, not measured.** F1 means one Save puts about three `Events` commits on the
wire for every connected client, each waking the watchers on `Events`, which includes the
heavy chat and alert watchers that step 1 of the slow-database plan split. The production
PowerSync log shows bursts of tiny checkpoints about 0.2 s apart to all clients with the
writer unknown (2026-10-09, 16:07:49Z); matching them with quote saves would confirm or drop
this.

**F5 — read in documentation, not tested on this server.** The sync file is Sync Streams
edition 3 and production runs `powersync-service:1.20.5` with MongoDB storage and no storage
version set (`br_powersync/docker-compose.coolify.yml`, `config/powersync.yaml`). PowerSync's
documentation says that without incremental reprocessing a deploy recreates every bucket from
scratch and existing clients download their data again; incremental reprocessing needs
storage version 4 and arrived experimentally in v1.23.2. So adding one table to one role's
stream is expected to make EVERY web client download its set once: for an admin about 48k to
65k operations, which blocked the database worker for about 24 s on a Mac in the earlier
measurement.

## 3. Measurement (per spec)

- **M1 (spec 04):** local database, rolled back, as F1: a Save with no line item change gives
  3 `Events` updates and an invalidated signature today; the target is 0 and an active
  signature. A one-item change gives 1 hash update.
- **M2 (spec 04):** production log, F4: checkpoints per quote Save, before and after.
- **M3 (spec 04):** a line item changed in tab B, stopwatch until tab A shows it; the target
  in the same browser is immediate.
- **M4 (spec 01):** `perfLog.report()` on the detail page before and after: six more live
  watchers, expected, reported and not a gate.

## 4. What stays as it is

- Change log rows, soft delete and Files writes are direct Supabase calls. After the specs,
  in another tab, the Log tab, the deleted banner and the Files list still appear only after
  a sync round trip.
- `QuoteDetailView` and `ContractTab` still both call `useEventLineItems` and
  `useEventCurrency` (duplicate watchers).
- The leaked `tablesUpdated` listeners of `@powersync/react` (see the slow-database notes)
  grow with page visits for every hook, new ones included.

## 5. Permissions

Nobody gains or loses a right in any spec. The accountant already sees the signature on the
Contract tab; only the source of the data would change in spec 02. Writing line items needs
admin or account manager on the server, the same roles as `manageQuote`.

## 6. Definition of done (every spec)

`npm run tc`, `npx vitest run`, Prettier on the touched files only. E2E scenarios are written
as the spec says and **not run locally** (standing instruction); the report marks the step
SKIPPED with that reason.
