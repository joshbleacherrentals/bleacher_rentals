# Event change log 04: the Edit page, fields and line items on PowerSync

Status: **DRAFT 2026-11-05, waiting for "Approved"**. 0 open decisions; readings to confirm in §1.
Build order: **04 of 07**. Needs: [01](event-change-log-01-payment-recorded.md) (the `eventLogInsert`
row builder). Needed by: [05](event-change-log-05-payment-schedule-rows.md).
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

This spec is the fourth: the **Edit button** on the quote leads to `/quotes-bookings/{id}/edit`.
`updateQuoteEvent` saves the quote and writes the changed fields (`logEventChanges`) and the changed
line items (`logLineItemChanges`) with direct Supabase requests, after the local write. Offline, or
after a failed request, the change stays and its rows are lost. This spec moves both to PowerSync.

## 1. What this spec decides

**D8 (plan §3): three transactions.** The Edit save is grouped as: the quote's fields with their
rows; the line items with their rows; the Payment Schedule with its rows (spec 05). Each group is
one transaction. The user's wish: a quote changed through Edit leaves all of it in the Log; what
did not change leaves nothing.

**D10 (plan §3):** the rows move to PowerSync.

**D12a (plan §3):** Venue and Address changes are written by name, not by id.

**Readings to confirm:**

- **R1:** the old functions that take a Supabase client, `logEventChanges` and
  `logLineItemChanges`, are replaced by pure builders `buildEventChangeRows` and
  `buildLineItemRows` that return rows, and the writes use `eventLogInsert`. `logSingleChange`
  stays (Delete quote, the contract signature route).
- **R2:** names are read from the local database before the write: `Contacts`, `SalesOffices`,
  `EventTypes`, `TermsAndConditions`, `Users`, and now `Venues` (its name) and `Addresses`
  ("street, city, state zip"). A name that is not found locally falls back to the id, as today.
- **R3:** `updateQuoteEvent` loses its `supabase` parameter, because the two Log calls were its
  only use of it. The four call sites in `CreateQuoteForm.tsx` are changed.
- **R4:** the `Addresses` insert or update that comes first (venue-history spec) stays a separate
  write, as now. It is not a Log row; the address change is logged through `address_uuid`.
- **R5:** only changed fields and changed line items get a row, as now (`valuesEqual`, the
  label-based line item comparison). Nothing changed means no row and no extra write.
- **R6:** the row texts and labels are unchanged except for Venue and Address.
- **R7:** `permissionPageData.ts` is not edited.

## 2. Research findings

- `updateQuoteEvent.ts`: reads the old `Events` row and the old line items; writes `Events` with
  `typedExecute`; calls `logEventChanges` and `logLineItemChanges` (both insert through Supabase,
  and only log an error); then `syncEventLineItems`; then `syncPaymentInstallments`.
- `syncEventLineItems` already writes the line items in one `typedWriteTransaction`.
- `logEventChanges.ts` resolves ids to names with Supabase `select`s, for contacts, sales offices,
  event types, terms and users. `venue_uuid` and `address_uuid` are in `UUID_FIELDS_TO_SKIP_RAW`
  but have no branch in `resolveUuid`, so the Log shows the raw id.
- `Venues` has `name`; `Addresses` has `street`, `city`, `state_province`, `zip_postal`. Both are
  PowerSync tables.
- In "venue" mode only `venue_uuid` is written and the database sets `address_uuid`, so an address
  row appears only in "manual" mode.
- `ScheduleBlockedError` from `syncPaymentInstallments` can end the save after the first two groups
  are committed; the editor then keeps the draft. With D8 each committed group has its rows.

## 3. Design

**Row builders** (`db/logEventChanges.ts`, pure):

```ts
export function buildEventChangeRows(p: {
  eventId: string;
  changedByUserUuid: string | null;
  oldState: Record<string, unknown>;
  newState: Record<string, unknown>;
  names: Record<string, string>;
  currency: string;
}): EventLogRow[];

export function buildLineItemRows(p: {
  eventId: string;
  changedByUserUuid: string | null;
  oldItems: SimpleLineItem[];
  newItems: SimpleLineItem[];
  currency: string;
}): EventLogRow[];
```

They carry the logic of the two old functions (field comparison, cents and Yes/No wording,
`lostReasonLabel`, the line item add / remove / change rules) and make rows, not requests.

**Names** (`db/resolveLogNames.ts`, new): `resolveLogNames(pairs: {field; id}[]):
Promise<Record<string, string>>`, one local `typedGetAll` per field kind, keyed `field:id`.

**`updateQuoteEvent`** (new signature `updateQuoteEvent(eventId, state, currentUserUuid)`):

1. The address block and the old-state reads, as now.
2. Names for the changed id fields, from the local database.
3. **Transaction 1:** `typedExecuteBatch([updateEvents, ...fieldRows.map(eventLogInsert)])`.
4. **Transaction 2:** `syncEventLineItems(eventId, items, currency, lineItemRows)`, which gains an
   optional last parameter, the Log rows, executed inside its existing transaction after the writes.
5. `syncPaymentInstallments` and the rest, as now (spec 05 changes the schedule).

`CreateQuoteForm.tsx` drops the `supabase` argument at its four call sites. `createQuoteEvent`
already writes its "create" row through PowerSync and does not change.

No database change, no sync rules change.

## 4. Behaviour scenarios (Playwright, written, not run)

- **S1:** an admin edits the event name and the status; the Log has a row for each, with old and new.
- **S2:** an admin adds one line item and changes the price of another; the Log has "Line Item
  Added" and "Line Item Changed".
- **S3:** Save with nothing changed; the Log gets no row.
- **S4:** the venue is switched to another venue; the Venue row shows the two venue names.
- **S5:** the address is edited by hand; the Address row shows two readable addresses.
- **S6:** the contact is changed; the row shows two contact names (unchanged behaviour).

## 5. Tests (Vitest)

- `logEventChanges.test.ts`: rewritten for the two builders (every case the old file covers, now
  asserting rows), `FIELD_LABELS`, `formatCentsForLog` unchanged.
- `resolveLogNames.test.ts` (new): each kind, the fallback to the id, Venue and Address.
- `updateQuoteEvent.lineItems.test.ts`, `updateQuoteEvent.invoiceCheck.test.ts`: the new signature
  and mocks.
- `updateQuoteEvent.log.test.ts` (new): the `Events` update and its rows share one batch; the
  line item rows are passed into `syncEventLineItems`; nothing changed means no insert; no Supabase
  client is touched; a throw in transaction 2 leaves transaction 1 as written.
- `eventLogInsert` is covered by spec 01.

## 6. Files

Production, 5: `db/updateQuoteEvent.ts`, `db/logEventChanges.ts`, `db/resolveLogNames.ts` (new),
`db/eventLineItems.ts`, `components/createQuote/CreateQuoteForm.tsx`.
Tests: the four of §5, and `e2e/editQuoteLog.admin.spec.ts` (new).

## 7. Edge cases and error handling

- **Offline.** The save and its rows are local and uploaded together, per group.
- **Upload refused for one group.** That group's transaction is discarded with its rows; the
  other groups stay (D8).
- **ScheduleBlockedError.** The first two groups are saved with their rows, the draft stays in the
  editor, and a second Save finds nothing new to log for them.
- **A name not synced to the device** (for example a deleted contact). The id is written, as today.
- **A save by an account manager.** Names come from the tables their device has; the Log insert is
  open to any signed-in user.
- **No user id.** `currentUserUuid` null writes a null author, as today.

## 8. Out of scope

- The Payment Schedule rows (spec 05). The status button (spec 03). Delete quote (plan D9).
- Making the three groups one transaction (plan D8 chose three).
- Moving `createQuoteEvent` or the `Addresses` write.
