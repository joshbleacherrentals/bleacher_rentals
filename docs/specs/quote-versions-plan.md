# Quote versions: plan

Status: **DRAFT 2026-10-16**, awaiting review. Specs follow from it; each one is its own
logic and its own "Approved". Only spec 01 is written; the others are named here and
written after 01 is approved.

Request (user, 2026-10-16): account managers want to edit a quote that was already sent,
without the client seeing the edit. If the edit does not work out they delete it. If it
does, they press Approve and then Send to client, and only then does the old version
change and the client sign again. Any manager must be able to open and edit these new
versions and leave them, and the work must stay saved. The list `/quotes-bookings` must
not fill up with copies.

## 0. Words

- **Main version:** the one row the client sees and everything else hangs on. One per quote.
  Its id never changes.
- **Draft version:** an edit in progress. There can be several per quote. Managers see
  them; the client does not.
- **Old version:** what the main version was before an approval. It keeps the status it had
  (booked, say) and its signature.
- **Quote:** the main version plus its drafts and old versions.

## 1. Decisions taken (user, 2026-10-16)

- **D1, drafts:** several drafts may exist for one quote. The client sees only the main one.
- **D2, old versions:** an old version keeps its status (booked stays booked) and, if it
  was signed, stays signed. Every old version is kept, however many there are.
- **D3, what is shared:** payments, files and chat belong to the quote, not to a version.
  The status is versioned.
- **D4, approval:** an approved draft becomes the main version, and what was main becomes old.
  The main row keeps its id (so payments, files, chat, bleachers, work trackers, the client
  link and Stripe stay where they are); its content is replaced.
- **D5, two buttons:** Approve and Send to client are separate. After approval the main
  version is `quoted`.
- **D6, a draft in progress:** while a version is `draft`, every action edits that same
  version. A new draft is made only when someone starts editing a `quoted`, `booked` or
  `lost` quote.
- **D7, choosing:** when someone starts editing a quote that already has drafts, they can
  open one of them or make a new one.
- **D8, a draft of a never-sent quote:** a new quote is `draft` and is edited in place,
  with no versions.
- **D9, invoice number:** all versions of a quote carry the same invoice number.
- **D10, status and "old":** these are two separate things. An old version has an ordinary
  status; "old" is a different mark.
- **D11, payments after approval:** money already paid stays on the quote, so it is shown on
  the main version after approval, which is `quoted`.

## 2. Findings that shape the plan (read from the code, 2026-10-16)

- **F1:** 14 tables point at `Events.id`: BleacherEvents, ContractSignatures,
  EventAttachments, EventChangeLog, EventEmailLog, EventFiles, EventLineItems,
  EventMessages, EventSubscriptions, EventTypingIndicators, PaymentHistory,
  PaymentInstallments, and WorkTrackers (pickup and dropoff).
- **F2:** `Events` is read directly by 48 source files (quotesAndBookings 13, alerts 9,
  api 8, dashboard 4, workTrackers 3, scorecard 3, eventConfiguration 2, eventChat 2,
  one each in weeklyLeaderboard, venues, stripe-integration, automaticEmails) and
  mentioned in 18 migration files. Every reader of the main list of events must learn that
  a draft or old row is not an event of its own. An old version has status `booked`, so a
  reader that counts bookings by status would count it twice.
- **F3:** `Events.invoice_number` has a unique index
  (`Events_invoice_number_key`, migration 20260614220000). Versions share the number (D9),
  so the index has to change.
- **F4:** `PaymentHistory.installment_id` points at a `PaymentInstallments` row. When a
  draft is approved, the main version's installments must be updated in place, not deleted
  and created again, or its payments lose the installment they were applied to.
- **F5:** the trigger `events_auto_subscribe_owner` inserts an `EventSubscriptions` row on
  every insert into `Events`. A version row would get a subscription of its own.
- **F6:** the hashes `content_hash` and `contract_hash`, and the signature invalidation
  that follows `contract_hash`, are all computed by triggers, per row. A signature moved
  to an old version must keep its status; that depends on the old copy getting the same
  `contract_hash` as the original had. To be measured in spec 04.
- **F7:** the work tracker links (`pickup_event_uuid`, `dropoff_event_uuid`) are computed
  from `BleacherEvents`. A version row has no `BleacherEvents` row, so they ignore it,
  provided that stays true.
- **F8:** `Events` is synced to every role that gets any event (admins, account managers,
  viewers, maintainers, accountants, and so on) with `SELECT "Events".*`. A version row
  would be synced to all of them. Where to hide it from roles that must not see it is
  open (section 4).

## 3. The specs

- **01, the data model:** [quote-versions-01-data-model.md](quote-versions-01-data-model.md).
  How a row says it is a main, draft or old version; the rules that never break; the
  invoice number index. No screen changes.
- **02, readers see the main version:** every reader of `Events` that must ignore draft
  and old rows (F2, F8). Not yet written.
- **03, starting, choosing and deleting a draft:** copying the main version into a draft,
  the choice between existing drafts and a new one (D7), deleting a draft. Not yet written.
- **04, approving:** the old copy, the overwrite of the main row, the signature, the status
  `quoted` (D4, D5, F4, F6). Not yet written.
- **05, the version list:** what a manager sees when opening a quote that has versions.
  Not yet written.

## 4. Open, to be decided with the user in the spec that needs it

- Which roles must never receive draft and old rows, and whether that is done in the sync
  rules (a deploy makes every web client download its data again) or in each app (spec 02).
- What happens to drafts and old versions when the main version is deleted (not defined).
- Whether a deleted draft is removed for good or only marked deleted (spec 03).
- How a version is named in the list (spec 05).

## 5. Not in scope

- Anything about how the page edits a draft (the block editing built on the quote page).
- Changes to who may do what; the permission matrix is not edited by 01 and is decided in
  the specs that add actions.
