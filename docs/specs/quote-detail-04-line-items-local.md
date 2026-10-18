# Quote detail 04: line items written through the local database

Status: **IMPLEMENTED 2026-10-15, uncommitted, awaiting review** (approved the same day).
0 open decisions (D4 answered; the
`deleted` question answered at review). Spec 4 of
[quote-detail-reactive-plan.md](quote-detail-reactive-plan.md). Request (user, 2026-10-14):
line items on an open page did not change when the quote was saved in another tab.

## 0. The request, and what it is not

**In scope:** step 5 of `updateQuoteEvent`, which replaces a quote's line items.

**Not in scope:** `createQuoteEvent` (it already writes line items locally), the change log
(`logLineItemChanges`), soft delete of a quote, the Files tab, the payment installments
step, and moving the `Events` update into the same transaction.

## 1. Decisions taken

**D4 — the writes that go straight to Supabase.** Line items, change log, soft delete and
files do, so another tab sees them only after a sync round trip. Options: reads only; reads
and line items local; reads and all four local.
User's answer: **reads, and line items local.**

**Answer at review — rows already soft-deleted.** Options: leave a row with `deleted = 1`
alone; make removal of an item a soft delete. User's answer: **leave the rows that are
already deleted.** Removing an item in the form stays a real delete, as now.

## 2. What the code does today

- `updateQuoteEvent.ts:275-285`: `supabase.from("EventLineItems").delete().eq("event_uuid",
id)` removes every row of the event, including soft-deleted ones, then one `insert` writes
  the form's items with new `crypto.randomUUID()` ids. Neither call's `error` is read (F2).
  The rows reach the local database, and other tabs, only through sync.
- Every Postgres row operation on `EventLineItems` fires `recompute_quote_hashes`, which
  rewrites `Events.content_hash` and `contract_hash` when the hash moves; a moved
  `contract_hash` invalidates an active signature whose `signed_contract_hash` differs. The
  contract hash covers event type, dates, tax, terms, sales office, venue address, line items
  (non-deleted) and installments.
- Measured (F1, local, rolled back): replacing identical rows invalidates the signature and
  causes 3 `Events` updates.
- Form items keep the id of the row they were loaded from (`fetchLineItemsForEvent`); an item
  added in the form has the `crypto.randomUUID()` it got when added. The form has no
  reordering.
- The June 2026 duplication came from a row level security rule (F3); the policies now allow
  admin and account manager.
- The Save that keeps the form open after "Preview" calls `updateQuoteEvent` again with the
  same form items.

## 3. The change

New `utils/diffLineItems.ts` (pure) and `db/eventLineItems.ts`; step 5 of `updateQuoteEvent`
calls `syncEventLineItems(eventId, state.lineItems, state.currency)` instead of the two
Supabase calls. Modelled on `syncPaymentInstallments`: write only what changed.

- Inside one `typedWriteTransaction`, read the event's rows (`event_uuid = ?` and `deleted =
0`) and compare them with the form items **by id**:
  - **toDelete:** a row whose id is not in the form.
  - **toUpdate:** the id is in both and one of `header`, `description`,
    `bleacher_type_uuid`, `value_cents`, `quantity`, `currency`, `is_price_overridden`
    differs. The values come from `toEventLineItemValues` (discounts keep their
    `lineTotalCents` as the value; the flag is stored as 0 or 1).
  - **toInsert:** the id is only in the form. The row uses the form item's id, so a retry, or
    the Save that keeps the form open, finds its own rows and writes nothing twice.
    `is_template` and `deleted` are 0, and `created_at` is the current ISO time: the list is
    ordered by `created_at`, and an empty value would sort first until the server value
    syncs back.
- One local commit and one upload transaction. On any error the transaction rolls back and
  the error propagates, so the editor keeps the draft, as `updateQuoteEvent` already
  promises.
- A row with `deleted = 1` is not read and not touched.
- Order of the steps in `updateQuoteEvent` is unchanged: the `Events` update, the change
  log, then line items, then installments.

## 4. Locked contracts

```ts
// utils/diffLineItems.ts
export type ExistingLineItem = {
  id: string;
  header: string | null;
  description: string | null;
  bleacher_type_uuid: string | null;
  value_cents: number | null;
  quantity: number | null;
  currency: string | null;
  is_price_overridden: number | null;
};
export type LineItemWrite = {
  id: string;
  values: ReturnType<typeof toEventLineItemValues>;
};
export function diffLineItems(
  existing: ExistingLineItem[],
  items: LineItem[],
  eventId: string,
  currency: Currency,
): { toDelete: string[]; toUpdate: LineItemWrite[]; toInsert: LineItemWrite[] };
// db/eventLineItems.ts
export function syncEventLineItems(
  eventId: string,
  items: LineItem[],
  currency: Currency,
): Promise<void>;
```

`updateQuoteEvent`'s signature is unchanged (the `supabase` argument is still used by the
change log). No migration; `AppSchema.ts`, `database.types.ts` and `sync_rules.yaml` do not
change.

## 5. Behaviour that must not change

- After a Save, the quote's line items are exactly the form's items, with the same values.
- The list order on the page and in the PDF is the form's order.
- A real change to line items, sales office, event details, tax, terms, venue or installments
  invalidates an active signature, as now.
- The editor keeps the draft when the Save fails.
- The change log entries for line items are written as before.

## 6. Edge cases and error handling

- **A Save that changes no line item** writes no `EventLineItems` statement, so it no longer
  moves the contract hash and no longer invalidates the signature (F1). A change to other
  contract terms still does, through the `Events` update.
- **A remove-and-re-add of an item with the same content** passes through a different hash
  between the two uploaded operations and invalidates the signature, though the final terms
  are equal. Today every Save does this; it is not made worse.
- **Row level security refuses a write** (a role the interface lets save but the server does
  not; the policies allow admin and account manager, the roles that can manage a quote): the
  upload discards the rest of that transaction (`BackendConnector`, classes 23 and 42501) and
  the local rows revert after the next checkpoint. This is the visible form of the June 2026
  bug (F3). No such role is known.
- **Two people save the same quote:** unlikely, and the outcome is the same as today. The
  diff compares the form with the rows in the database now, not with what the form loaded, so
  the last Save decides the whole set: an item the other person added since is removed, an
  item they removed comes back. What changes is only that unchanged rows keep their ids.
- **An id that already exists under another event:** the insert fails on the primary key, the
  Save throws, the draft is kept. No flow found that copies ids between events.
- **Currency changed in the form:** every row differs and every row updates.
- **All items removed:** every row is in `toDelete`; installments are unaffected.
- **Save, then Save again with the form still open:** the second Save writes nothing for
  unchanged items.
- **A failure in the middle:** the transaction rolls back; nothing of this step is saved.
- **Offline:** the Save works for this step; the old step failed without a message.
- **A row with `deleted = 1`:** stays, and the hash ignores it.

## 7. Tests (TDD: red first, then code)

1. `utils/diffLineItems.test.ts` (18 tests): delete; update (each compared column alone);
   insert under the form's id; no change gives three empty lists; discounts; currency change;
   a row saved without the override flag is read as overridden; each list in a stable order.
2. `db/eventLineItems.test.ts` (11 tests) on the fake PowerSync database
   (`src/lib/powersync/testing/fakePowerSyncDb.ts`, in-memory `node:sqlite`): no change writes
   no statement but the read; a second Save writes nothing; only the changed row is updated and
   its `created_at` kept; an insert uses the form's id and sets `created_at`; delete, update
   and insert share one transaction; another event's rows and a `deleted = 1` row are untouched;
   a failure in the middle rolls everything back and reaches the caller.
3. `db/updateQuoteEvent.lineItems.test.ts` (4 tests): the step hands the form's items and
   currency to `syncEventLineItems`, sends nothing to Supabase, runs after the change log and
   before the payment schedule, and a failed sync reaches the caller and stops the Save. As
   built, the statements themselves are asserted in test 2; this one asserts the wiring.
4. Playwright, written per CLAUDE.md and **not run locally**: `e2e/lineItemsLocal.admin.spec.ts`
   (as an admin): open a quote in tab A; in tab B change the price of its line item and save;
   tab A's list and Contract Total change with no reload.

Mutation-checked: a missing override flag read as 0, `created_at` not written on insert, the
read ignoring which event a row belongs to, and the quantity not compared are each caught.

## 8. Measurement

- **M1 — done (2026-10-15), local Postgres, each case in a rolled-back transaction, the pending
  migration `20261013140000_event_line_items_is_price_overridden.sql` applied inside it** (the
  local database lacks it). Quote `db8b1b09…`, one line item, an active signature. What the
  server does to the `Events` row and to the signature for each Save:
  - old Save, nothing changed (delete and re-insert): 3 `Events` updates, signature invalidated.
  - new Save, nothing changed: 0 statements, 0 updates, signature active.
  - new Save, one price changed: 2 `Events` updates (the hash, then the invalidation flips
    `content_hash`), signature invalidated, as the rule says.
  - new Save, only the override flag changed: 0 updates, signature active.
  - new Save, one item added, or the item removed: 2 updates each, signature invalidated.
    Without an active signature a real change would be 1 update; that case was not run.
- **M2** — production log: checkpoints per quote Save, before and after (F4). The user's.
- **M3** — a line item changed in tab B, stopwatch until tab A shows it; the target in the same
  browser is immediate. A change made in Supabase Studio still goes through sync and measures
  the pipeline. The user's.

## 9. Rollback and commits

One commit, `reactive(quote-detail): save line items through the local database`. Rollback
is `git revert`; rows written by either path are valid, so nothing is migrated back.

## 10. Permissions

None changes. Writing line items needs admin or account manager on the server, the same
roles as `manageQuote` in `getQuotesBookingsCapabilities`. `permissionPageData.ts` is not
edited.

## 11. Files

3 counted files under `src/features/quotesAndBookings/`: `utils/diffLineItems.ts`,
`db/eventLineItems.ts`, `db/updateQuoteEvent.ts`. Also touched, outside the count: a stale
comment in `db/toEventLineItemValues.ts` (it still said the update writer used Supabase).

## 12. Definition of done

As in the plan, section 6. Result (2026-10-15):

- `npm run tc`: the same errors as before the change (12 lines), none in these files; they come
  from an uncommitted regeneration of `database.types.ts` that is not part of this spec.
- `npx vitest run`: 325 files, 3780 tests, all pass.
- Prettier: clean on the 8 touched files. E2E: SKIPPED, not run locally.
- Not checked in a browser: the page is behind a Clerk sign-in.
- The local Supabase database lacks migration `20261013140000` (the column
  `EventLineItems.is_price_overridden`). Every line item upload carries that column, as the
  create writer's already did, so on that database an upload of line items fails until the
  migration is applied. Production is not known to lack it.

## 13. To confirm at review

- The June 2026 duplication is read as a row level security failure (F3), now fixed by the
  relaxed policies; the move to Supabase in the same commit is read as not required today.
  Confirm, or say what else made it necessary.
- Soft-deleted rows are never purged by a Save after this change (today they are).
