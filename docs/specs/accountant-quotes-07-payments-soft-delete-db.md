# Payments — edit and soft delete, the database layer

Status: **DRAFT — awaiting "Approved"** — 0 open decisions (D1–D7 answered 2026-10-03; the rules of §0 come
from the request).
Original request: №6, part 1 of 3. Implementation order: **07 of 11**. Needs
[06](accountant-quotes-06-am-read-only-payments.md) (only an admin writes payments). The next two parts:
[08](accountant-quotes-08-payments-readers-skip-deleted.md) (every reader skips deleted rows) and
[09](accountant-quotes-09-payments-edit-delete-ui.md) (the screen).
Branch: `q4-sprint1-finance-role`.
Builds on: [manual-payment-entry.md](manual-payment-entry.md), [payment-accounting-truth.md](payment-accounting-truth.md),
[payment-history-security.md](payment-history-security.md). **This spec changes a principle those specs state:**
the ledger was append-only — no UPDATE, no DELETE, mistakes corrected by a negative row. After 07 a manual
payment can be edited and soft-deleted; a negative row stays a valid way to record a refund.

## 0. The request, and what it is not

The `PaymentHistory` table gains **edit** and **soft delete**, enforced by the database:

- **Which rows:** only **manual** rows — `entry_source = 'manual'` with `payment_method_type` one of
  `manual_credit_card`, `ach`, `check` (the three values the table's own CHECK allows for a manual row; they
  are the "Credit Card / ACH / Check" of the request). **A Stripe row can be neither edited nor deleted.**
- **Delete is soft:** the row stays; it is marked deleted, with who, when and **a reason that is not null and
  not empty**. **No hard delete** — no DELETE policy exists for anyone and this spec adds none.
- **Edit** changes the fields the record dialog collects (D3); it is **logged** (D5, written by the app in
  spec 09).
- **A deleted payment cannot come back** (D4), and cannot be edited.
- **A soft delete also detaches the payment from its installment** (D7): `installment_id` becomes null;
  `intended_installment_id`, the historical fact, stays.
- **Who:** only an admin, for now (D6); the accountant joins in spec 10.

**Not part of this spec, so not changed:**

- the readers of `PaymentHistory` — balances, AR, the public quote page, PDFs — which will skip deleted rows in
  spec 08. **Until spec 08, nothing deletes a row from the screen, so no reader meets a deleted row.**
- the screen (the edit and delete buttons, the "Show deleted" switch) and the edit log write — spec 09;
- the accountant's rights — spec 10;
- the insert path, the amount rules (`amount_cents <> 0`, negatives allowed) and the Stripe webhook.

## 1. Decisions (all taken by the user)

**D1 — the soft-delete columns**

- **Option A — `deleted` (boolean) plus `deleted_at`, `deleted_by_user_uuid`, `delete_reason`,** like `Events`.
  **Option B — `deleted_at`, `deleted_by_user_uuid`, `delete_reason`:** a row is deleted when `deleted_at` is
  not null; no flag.
- **User's answer: B — `deleted_at` and the details, no flag.**

**D2 — a reason made only of spaces**

- **Option A — spaces count as empty:** `btrim(delete_reason) <> ''`. **Option B — spaces are allowed:** only
  null and `''` are refused.
- **User's answer: A — spaces count as empty.**

**D3 — which fields of a manual payment can be edited**

- **Option A — every field of the record dialog:** amount, paid date, method, payer, reference, notes, the
  installment it is applied to. **Option B — all but the amount and the installment.** **Option C — only the
  descriptive fields:** payer, reference, notes.
- **User's answer: A — every field of the dialog.** Never editable: the event, the currency, the author, the
  status, the creation time, the payer's email and every Stripe column.

**D4 — restoring a deleted payment**

- **Option A — not possible:** a deleted payment is frozen. **Option B — possible:** an admin restores it.
- **User's answer: A — not possible.**

**D5 — what is logged when a payment is edited**

- **Option A — a new log table,** written by a database trigger, one row per changed field. **Option B —
  `EventChangeLog`,** written by the app as for `is_qbo`: already shown on the Log tab, no payment column, open
  to any signed-in user to insert, so a client can skip it. **Option C — only who and when,** two columns on
  the row, no old values.
- **User's answer: B — `EventChangeLog`, written by the app.** The deleter, the time and the reason are kept
  in the row itself in every option.

**D6 — who may edit and soft-delete before spec 10**

- **Option A — only an admin,** the roles that may create (spec 06); the accountant joins INSERT and UPDATE
  together in spec 10. **Option B — admin and accountant at once** in the UPDATE policy, with the screen giving
  the accountant buttons only in spec 10.
- **User's answer: A — only an admin.**

**D7 — a deleted payment and its installment**

- **Question:** `PaymentHistory.installment_id` has a foreign key to `PaymentInstallments` with **no `ON DELETE`
  clause**, so any row that still points at an installment — a deleted one included — makes the database refuse
  to remove that installment. The schedule guard in the app (`describeBlockedRemovals`) counts only `succeeded`
  payments and knows nothing about deleted ones.
- **Option A — detach on delete:** a soft delete sets `installment_id` to null; `intended_installment_id`
  (no foreign key, the historical fact) stays. A deleted payment never blocks the schedule; a deletion changes
  four columns, not three. **Option B — keep the pointer and block the schedule:** the app's guard also counts
  deleted payments, so a user sees "cannot be removed … in payments" because of a payment the list hides.
  **Option C — change the foreign key to `ON DELETE SET NULL`:** removing an installment clears the pointer on
  every payment, active ones included, which drops the protection "do not remove an installment that holds
  money".
- **User's answer: A — detach on delete.**

## 2. Research findings

**The table today** (`database.types.ts`, `AppSchema.ts`): `id`, `event_uuid`, `installment_id`,
`intended_installment_id`, `amount_cents`, `currency`, `status`, `payment_method_type`, `payer_name`,
`payer_email`, `reference`, `notes`, `paid_at`, `created_at`, `entry_source`, `recorded_by_user_uuid`,
`stripe_payment_intent_id`, `stripe_checkout_session_id`, `stripe_connection_uuid`, `stripe_receipt_url`.
`installment_id` is the live link the allocation reads; `intended_installment_id` is the historical fact, and
the record function writes both with one choice.

**Constraints and policies today** (`20260904120000_manual_payment_entry.sql`, `20260805120000_payment_history_rls.sql`):

- `payment_history_entry_source_check`: `entry_source in ('stripe','manual')`;
  `payment_history_amount_nonzero_check`: `amount_cents <> 0`;
  `payment_history_manual_fields_check`: a manual row has `payment_method_type` in `('manual_credit_card',
'ach','check')`, a non-null `recorded_by_user_uuid`, and no Stripe session or intent id;
- policies: `payment_history_select`; `payment_history_insert` (admin only after spec 06, manual rows only);
  **no UPDATE policy and no DELETE policy for anyone**. The webhook writes with the service role;
- **the foreign key** `installment_id → PaymentInstallments(id)` has no `ON DELETE` clause; the migration of
  `intended_installment_id` says removing an installment that payments point at "stays refused by the
  `installment_id` FK" (`20260902120000_payment_history_intended_installment.sql`), and
  `intended_installment_id` has deliberately no foreign key (D7).

**The caller's id.** The earlier migration says RLS has no expression for the caller's `Users.id`;
`public.get_current_user_uuid()` exists (`20260513153019`, redefined in `20260525120000`) and is used by
recent policies, so the author of a deletion can be pinned to the caller.

**How a change reaches the server.** A local update becomes a `PATCH` with only the changed columns; a refusal
with code `42501` (an RLS refusal or an exception raised with that code) is discarded by the connector with the
toast "A change could not be saved and has been discarded." — the pattern used by `guard_work_tracker_group_is_paid`
and, in spec 05, `guard_events_accountant_columns` (they check `current_user = 'authenticated'` so the service
role, migrations and `SECURITY DEFINER` functions are not fenced).

**Sync.** The accountant, AM, viewer and admin buckets select `"PaymentHistory".*`, so new columns flow without a
sync-rules change. `AppSchema.ts` lists the columns the client knows and must gain the three new ones.

**Readers that will care (spec 08):** `allocatePayments`, `useAccountsReceivableData`, `usePaymentHistory`,
`server/eventPaymentContext`, `pdf/quoteDocumentData`, `pdf/PayInvoiceTab`, the public
`app/api/payments/history/route.ts` (service role, explicit column list), the webhook.

## 3. Database — `supabase/migrations/20261004160000_payment_history_edit_and_soft_delete.sql`

(After spec 06's `20261004150000`; renumber if `develop` has moved.)

1. **Columns:** `deleted_at timestamptz`, `deleted_by_user_uuid uuid references public."Users"(id)`,
   `delete_reason text` — all nullable, all null on existing rows.
2. **CHECK `payment_history_deleted_fields_check`:**
   - while `deleted_at` is null, `deleted_by_user_uuid` and `delete_reason` are null;
   - once `deleted_at` is set, `deleted_by_user_uuid` is not null and `delete_reason` is not null and
     `btrim(delete_reason) <> ''` (D2);
   - **only a manual row may be deleted:** `entry_source = 'manual' OR deleted_at IS NULL`;
   - **a deleted row points at no installment:** `deleted_at IS NULL OR installment_id IS NULL` (D7).
3. **UPDATE policy `payment_history_update`** (new): `to authenticated`, `USING` and `WITH CHECK`
   `public.get_user_roles() && '{admin}'::text[] AND entry_source = 'manual'` (D6). A Stripe row is invisible to
   it: an update that matches no row changes nothing.
4. **INSERT policy:** `ALTER POLICY payment_history_insert` — the `WITH CHECK` gains `AND deleted_at IS NULL`,
   so a row is never inserted already deleted.
5. **Guard trigger `guard_payment_history_update`** (`BEFORE UPDATE … FOR EACH ROW`, every column), a no-op
   unless `current_user = 'authenticated'`. It raises `42501` when:
   - any **immutable column** differs: `id`, `event_uuid`, `currency`, `status`, `entry_source`,
     `recorded_by_user_uuid`, `created_at`, `payer_email`, `stripe_payment_intent_id`,
     `stripe_checkout_session_id`, `stripe_connection_uuid`, `stripe_receipt_url` (D3);
   - the row was **already deleted** (`OLD.deleted_at` not null) and anything changes — a deleted payment is
     frozen and cannot be restored (D4);
   - a statement **deletes** (`deleted_at` goes from null to a value) **and** changes any column other than the
     four a deletion owns — `deleted_at`, `deleted_by_user_uuid`, `delete_reason` and `installment_id`, which a
     deletion must set to null (D7); `intended_installment_id` and every other column must stay as they were;
   - a deletion's `deleted_by_user_uuid` is not `public.get_current_user_uuid()`.
     The editable columns (`amount_cents`, `paid_at`, `payment_method_type`, `payer_name`, `reference`, `notes`,
     `installment_id`, `intended_installment_id`) pass; the existing CHECKs still decide whether a value is valid
     (non-zero amount; a manual method).
6. **Deliberately not changed:** no DELETE policy — a hard delete stays impossible for every signed-in user,
   an admin included; `payment_history_select`; the webhook's service-role path; every other table. (The
   service role bypasses RLS and could still delete a row; no code path does.)
7. **No sync-rules change** (`PaymentHistory.*` already carries the columns).

## 4. App changes (types only)

- `src/lib/powersync/AppSchema.ts`: `PaymentHistoryCols` gains `deleted_at`, `deleted_by_user_uuid`,
  `delete_reason` (all `column.text`).
- `database.types.ts`: the `PaymentHistory` `Row`, `Insert` and `Update` gain the three columns, **edited by
  hand** — `npm run gtl` is unsafe while the local database lags the migrations.
- No component, hook or function changes: nothing reads or writes the new columns before specs 08 and 09.
- **No permission changes visible to a user yet,** so `permissionPageData.ts` is not touched (spec 09 and 10
  change the rows).

## 5. Behaviour scenarios

There is **no screen in this spec**, so no Playwright scenario. Its behaviour is pinned by the SQL test of §7,
which is its only gate.

## 6. Files

**Counted — 2 files** (limit 10):

1. `supabase/migrations/20261004160000_payment_history_edit_and_soft_delete.sql` — new
2. `package.json` — changed: `test:db:paymentedit`, added to `test:db:all`

**Not counted:** `src/lib/powersync/AppSchema.ts`; `database.types.ts`; tests —
`supabase/tests/payment_history_edit_soft_delete.test.sql` (new); no `sync_rules.yaml`; no
`permissionPageData.ts`.

## 7. Tests and implementation sequence

Red first; the gate is the SQL test. Prettier only on touched files.

**7.1 The SQL test** — `supabase/tests/payment_history_edit_soft_delete.test.sql`, run through
`npm run test:db:paymentedit` and, as a dry-run, in `BEGIN … ROLLBACK` through the
`supabase_db_bleacher_rentals` container. **Each line is its own assertion, and every refusal also reads the
row back** (an update that RLS filters out does not raise):

- **Edit.** An admin changes each editable column of a manual row — amount, paid date, method (to each of the
  three manual values), payer, reference, notes, `installment_id` and `intended_installment_id` — and the row
  changes. A change to a zero amount is refused; a change of method to `card` is refused.
- **Immutable columns.** An admin cannot change `event_uuid`, `currency`, `status`, `entry_source`,
  `recorded_by_user_uuid`, `created_at`, `payer_email` or any Stripe column of a manual row — one assertion
  each.
- **Stripe rows.** An admin can neither edit nor soft-delete a Stripe row (no row matched, row unchanged).
- **Soft delete.** An admin deletes a manual row with a reason: `deleted_at`, `deleted_by_user_uuid` (= the
  caller) and `delete_reason` are set, **`installment_id` becomes null and `intended_installment_id` is
  unchanged** (D7). An installment that only a deleted payment pointed at can then be removed — the foreign key
  no longer refuses it. Refused: a null reason, `''`, `'   '`, a missing `deleted_by_user_uuid`,
  one that is not the caller, a deletion that leaves `installment_id` set, a deletion that also changes the
  amount, and a deletion that changes `intended_installment_id`.
- **Frozen.** After a soft delete an admin cannot change any column and cannot clear `deleted_at`.
- **Hard delete.** A `DELETE` removes nothing for an admin, a viewer or any other role.
- **Other roles.** An account manager (lead and junior), a viewer, a maintainer and an accountant cannot edit or
  delete — the row is unchanged (the accountant until spec 10).
- **Insert.** An admin cannot insert a row that is already deleted; the ordinary manual insert still works
  (`manual_payment_entry.test.sql` stays green after its spec-06 edit).
- **The service role.** A Stripe-style insert and an update through the service role are not blocked by the
  guard.
- **Existing rows.** Rows that existed before the migration have the three columns null.
- **The quote hashes.** An edit and a soft delete leave the event's `content_hash` and `contract_hash` as they
  were — payments are outside the quote hashes (`payment_does_not_invalidate_signature.test.sql` pins the
  insert; this adds the update and the soft delete).
- **Gate:** the new test, `manual_payment_entry.test.sql` and `rls_multi_role.test.sql` pass.

**7.2 Types:** `AppSchema.ts` and `database.types.ts`; **gate:** `npm run tc` and `npx vitest run` green,
`prettier --check` on the touched files. E2E: SKIPPED (no UI; not run locally by instruction).

## 8. Edge cases and error handling

- **Offline edit or delete.** The change is a local write that uploads later; if the server refuses it (the
  payment was deleted meanwhile, or the role changed), the connector discards it with the existing toast and the
  local row may differ until the next sync.
- **Two devices.** Last write wins for an edit; an edit of a payment another device already deleted is refused
  (the row is frozen).
- **A client clock.** `deleted_at` is the value the client sends, like `paid_at` and `created_at` today; the
  database does not overwrite it.
- **A role changed while signed in.** `get_user_roles()` changes; the next upload is refused and discarded.
- **Deactivated user.** `get_user_roles()` returns nothing: RLS refuses.
- **Clerk.** Nothing new: no route, token or webhook is touched.

## 9. Risks, and found on the way

**Risks**

- **R1 — the ledger is no longer append-only.** The earlier specs' guarantee ("nothing can be edited or deleted")
  stops holding for manual rows; the audit rests on the deleted row staying and on the `EventChangeLog` entries of
  spec 09, which the client writes and can skip (D5).
- **R2 — the guard compares columns by name.** A column added to `PaymentHistory` later is **not** covered by an
  immutable list; the test of §7 lists today's columns and a new column needs a deliberate decision.
- **R3 — deleted rows reach every reader until spec 08.** Nothing creates one from the screen before then, but a
  row deleted through the API would be counted in balances until spec 08 lands.
- **R4 — the service role can still delete.** RLS does not bind it.
- **R5 — a deleted payment loses its live link (D7).** `installment_id` is null afterwards; the only trace of
  what the payment was made against is `intended_installment_id` (and the edit log of spec 09).

**Found on the way — reported, not fixed**

1. The public `GET /api/payments/history?eventId=` returns the ledger to anyone who knows an event id (service
   role, no authentication) — by design in `payment-history-security.md`, but it will need the deleted-row filter
   in spec 08.
