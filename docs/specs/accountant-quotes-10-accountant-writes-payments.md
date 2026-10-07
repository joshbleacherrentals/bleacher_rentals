# Accountant — records, edits and deletes payments

Status: **IMPLEMENTED 2026-10-06, awaiting review** — not checked by hand in a browser (Clerk sign-in is unavailable
here); Playwright specs written, not run; the `br_powersync` comment edit is uncommitted and not deployed. 0 open
decisions (D1 answered 2026-10-03; the rule of §0 comes from the request). Approved 2026-10-06 with two answers: the
tests that this spec turns red are added to §6 (1, "add the edits"), and the three matrix sentences that would become
false are rewritten (2 A, §4).
Original request: №7. Implementation order: **10 of 11**. Needs
[07](accountant-quotes-07-payments-soft-delete-db.md), [08](accountant-quotes-08-payments-readers-skip-deleted.md) and
[09](accountant-quotes-09-payments-edit-delete-ui.md) (the rules, the readers and the screens, all admin-only),
[06](accountant-quotes-06-am-read-only-payments.md) (only an admin writes), and
[03](accountant-quotes-03-capabilities.md) / [04](accountant-quotes-04-accountant-quote-access.md) (the capability table
and the accountant on the card).
Branch: `q4-sprint1-finance-role`.
Builds on: [accountant-role.md](accountant-role.md), [manual-payment-entry.md](manual-payment-entry.md).

## 0. The request, and what it is not

**Only an admin and an accountant** create, edit and soft-delete payments in `PaymentHistory`; nobody else.

The work of specs 06–09 was built for the admin alone; this spec gives the same to the accountant — the database
policies (insert, update) and the `recordPayment` capability. On the Billing tab (spec 04) the accountant then gets
"+ Record Payment", Edit and Delete, and the Show deleted switch already shows them the deleted payments' reasons
(spec 09, D6).

**Not part of this spec, so not changed:**

- the rules of spec 07 (the guard, the immutable columns, the frozen deleted row, no hard delete) — they do not look
  at the role;
- what an account manager, a viewer or any other role can do (an account manager stays read-only, spec 06);
- the screens (spec 09): they read `can.recordPayment`, which this spec widens.

## 1. Decisions

**D1 — on which events the accountant may write payments**

- **Option A — any event:** quote, booking or deleted, as an admin can. **Option B — booked only.** **Option C —
  not deleted.** (B and C add a condition to the policies and the capability, and B also changes the admin.)
- **User's answer: A — any event.**

## 2. Research findings

**After specs 06 and 07**, `payment_history_insert` is `{admin}` (manual rows, not already deleted) and
`payment_history_update` is `{admin}` (manual rows). There is no DELETE policy. The guard trigger of spec 07 has no
role condition; the role is RLS's business.

**The capability.** After spec 06 `recordPayment` is "yes" for an admin and "no" for everyone else, the accountant
included; spec 09 made it govern recording, editing and deleting.

**The accountant's client now writes.** Spec 05 already lets it write `Events.is_qbo` and `EventChangeLog`; with this
spec it also writes `PaymentHistory` and, for each edit or delete, an `EventChangeLog` row (open to any signed-in
user). The accountant block of `sync_rules.yaml` still says "The Accountant's PowerSync client writes nothing" (Stage 2) and the gate of earlier specs says "the upload queue stays empty": both are out of date after spec 05.

**Attribution.** A recorded payment names its author in `recorded_by_user_uuid`, but no policy pins it to the caller
(`manual_payment_entry.sql` says there is no expression for it). `public.get_current_user_uuid()` exists, so a pin is
possible; it is not part of this request.

## 3. Database — `supabase/migrations/20261004170000_accountant_writes_payments.sql`

(After spec 07's `20261004160000`; renumber if `develop` has moved.)

- **`ALTER POLICY payment_history_insert ON public."PaymentHistory"`** — `WITH CHECK (public.get_user_roles() &&
'{admin,accountant}'::text[] AND entry_source = 'manual' AND deleted_at IS NULL)`.
- **`ALTER POLICY payment_history_update ON public."PaymentHistory"`** — `USING` and `WITH CHECK`
  `public.get_user_roles() && '{admin,accountant}'::text[] AND entry_source = 'manual'`.

**Deliberately not changed:** the guard trigger and the CHECKs of spec 07; no DELETE policy; `payment_history_select`;
every other table.

## 4. App changes

- `src/features/userAccess/logic/getQuotesBookingsCapabilities.ts`: **`recordPayment` is "yes" for an admin and for
  an accountant, on any quote** (D1). Account manager, viewer, maintainer, developer and driver stay "no". No
  component changes.
- `src/features/userAccess/permissionPageData.ts` (draft wording, for review):
  - **Record a Payment:** accountant `none` → `full`: "Can record, edit and delete any manual payment on any quote
    or booking — the same as an administrator."; the description gains "Only an administrator or an accountant can
    do this."
  - **Payment History:** the accountant stays `read` and its note changes to: "Can see every payment and open it to
    read in full, deleted payments and the reason they were deleted included. Changing payments is a separate thing
    — see Record a Payment."
  - **Accountant texts:** the role description gains "records, edits and deletes manual payments".
  - **Three sentences that this spec makes false (added 2026-10-06, "Approved, 2 A")** — each says the
    QuickBooks flag is the one thing an accountant changes on a quote; draft wording, for review:
    - role description: "On a quote or booking the one thing they can change is the QuickBooks Invoice Flag." →
      "On a quote or booking they can change the QuickBooks Invoice Flag, and they can record, edit and delete
      manual payments.";
    - _Events_, accountant note: "The one thing they can change is the QuickBooks Invoice Flag." → "What they can
      change is the QuickBooks Invoice Flag and the payments (see those rows).";
    - _QuickBooks Invoice Flag_, accountant note: "It is the only thing an accountant can change on a quote or
      booking — the database refuses every other change." → "Apart from payments (see Record a Payment), it is the
      only thing an accountant can change on a quote or booking — the database refuses every other change."
  - `permissionPageData.test.ts`: the accountant's guard adds the _Record a Payment_ row; the pinned "only thing an
    accountant can change" sentences follow the new wording; the "hidden-from-you note" check no longer takes the
    _Record a Payment_ note (it is not a hidden-from-you note any more) and takes _Event Chat_, which stays `none`.
- `br_powersync/config/sync_rules.yaml` (separate PR, not counted): the accountant block's comment stops saying the
  client writes nothing. No query changes.

## 5. Behaviour scenarios (for Playwright — written, not run)

- **S1** accountant on a booking, Billing tab: "+ Record Payment" is there; recording a check payment adds a row that
  names the accountant under "Recorded by".
- **S2** accountant opens that payment: Edit and Delete are there; editing the amount changes the row and the totals;
  the Log tab shows "Payment edited".
- **S3** accountant deletes it with a reason: it leaves the list and the totals; Show deleted brings it back, greyed,
  and opening it shows who deleted it, when and why; the Log tab shows "Payment deleted" without the reason.
- **S4** accountant on a quote that is not booked and on a deleted event: they can record a payment (D1).
- **S5** account manager and viewer: unchanged — no button, no Edit, no Delete.
- The database refusals (an account manager or a viewer writing, a Stripe row, a hard delete) are asserted in the SQL
  test; the Playwright specs assert what the UI shows.

## 6. Files

**Counted — 3 files** (limit 10):

1. `supabase/migrations/20261004170000_accountant_writes_payments.sql` — new
2. `src/features/userAccess/logic/getQuotesBookingsCapabilities.ts` — changed
3. `package.json` — changed: `test:db:accountantpayments`, added to `test:db:all`

**Not counted:** `src/features/userAccess/permissionPageData.ts`; `br_powersync/config/sync_rules.yaml` (a comment);
tests — `supabase/tests/accountant_writes_payments.test.sql` (new); `payment_history_edit_soft_delete.test.sql`,
`manual_payment_entry.test.sql`, `getQuotesBookingsCapabilities.test.ts`, `permissionPageData.test.ts` (edited); the
Playwright specs `recordPayment.accountant.spec.ts` and `paymentEditDelete.accountant.spec.ts` (new); no
`AppSchema.ts` or `database.types.ts`.

**Added 2026-10-06 ("Approved, 1 add the edits")** — tests this spec turns red, edited on purpose:

- `supabase/tests/accountant_receivables.test.sql` (line 180, "an accountant cannot record a payment", expects
  `42501`): found at implementation — its fixture and its insert both carry the table's default `entry_source`
  (`'stripe'`), so the migration would **not** have turned it red; it would have kept passing under a name that is
  no longer true. It is renamed and re-commented so it says what it proves: an accountant cannot write a row that
  claims to be Stripe, cannot update a Stripe payment, cannot delete. The accountant's own write is asserted in
  `accountant_writes_payments.test.sql`; the plan stays 44;
- `supabase/tests/payment_history_edit_soft_delete.test.sql` (named in §6 above): its two "an accountant edits /
  deletes no payment (until spec 10)" assertions flip — an accountant edits and soft-deletes on two rows of its own
  (`Acct Edit`, `Acct Delete`), so the snapshot of the row the other roles tried on still holds; plan 117 → 119;
- `src/features/quotesAndBookings/e2e/accountantQuoteCard.accountant.spec.ts` (line 57) and
  `accountantQuickBooksFlag.accountant.spec.ts` (S5, line 71): each asserted that an accountant has no "+ Record
  Payment" button. The card spec now asserts it is visible; the flag spec's S5 keeps Edit, Delete and Send To Client
  and drops the Record Payment line, which `recordPayment.accountant.spec.ts` now owns (Playwright, written, not
  run);
- `supabase/tests/manual_payment_entry.test.sql`: it has no accountant assertion to flip (only account manager and
  viewer), so it gains one — an accountant may insert a manual row, and not a Stripe-claiming one (T9) — the
  accountant joins the "no hard delete" loop (T7), and its header says so.

## 7. Tests and implementation sequence

Red first; each step ends at a gate. Playwright is **written, not run** (the project exists only when
`E2E_ACCOUNTANT_EMAIL` is configured); Prettier only on touched files.

**7.1 Database**

- **Work:** the migration; `supabase/tests/accountant_writes_payments.test.sql`;
  `npm run test:db:accountantpayments` (and `test:db:all`); the assertions of
  `payment_history_edit_soft_delete.test.sql` and `manual_payment_entry.test.sql` that an accountant is refused flip
  on purpose.
- **Test asserts, each its own assertion:** an accountant-only user inserts a manual row (allowed); cannot insert a
  Stripe-style row; cannot insert an already-deleted row; edits each editable column; cannot change an immutable
  column; soft-deletes with a reason and every rule of spec 07 still holds (empty and space-only reason refused,
  `installment_id` nulled, the row frozen afterwards); cannot hard delete; does all of this on a quote that is not
  booked and on a deleted event (D1); an accountant who is also an account manager can write; **an account manager
  alone, a viewer and a maintainer still cannot insert, update or delete**; an admin still can.
- **Gate:** dry-run in `BEGIN … ROLLBACK` through the `supabase_db_bleacher_rentals` container; the new test,
  `manual_payment_entry.test.sql`, `payment_history_edit_soft_delete.test.sql` and `rls_multi_role.test.sql` pass.

**7.2 Capability table**

- **Test first:** `getQuotesBookingsCapabilities.test.ts` — `recordPayment` is true for an admin and an accountant, on
  any quote, and false for lead AM, junior AM, viewer, maintainer, developer and driver; combinations: accountant +
  account manager is true.
- **Gate:** `npm run tc`, `npx vitest run`, `prettier --check` on the touched files. E2E: SKIPPED (not run locally,
  by instruction).

## 8. Edge cases and error handling

- **Offline.** The accountant's writes are local and upload later; a refusal discards the whole transaction (payment
  change and log row) with the existing toast.
- **Two writers.** An admin and an accountant editing the same payment: last write wins; an edit of a payment the
  other just deleted is refused (the row is frozen).
- **A role removed while signed in.** The button disappears on the next render; a queued write is refused and
  discarded.
- **A user who is account manager and accountant.** Roles are additive: the accountant right applies.
- **Clerk.** Nothing new: no route, token or webhook is touched.

## 9. Risks, and found on the way

**Risks**

- **R1 — two roles write the ledger.** Every payment action of specs 07–09 now has two possible authors; the
  author is recorded by the app, not enforced by the database.
- **R2 — any event (D1).** An accountant can record a payment on a quote that was never booked and on a deleted
  event.
- **R3 — released apart from specs 07–09,** this spec would give the accountant a button that only records;
  edit and delete come with 09.

**Found on the way — reported, not fixed**

1. **`recorded_by_user_uuid` is not pinned to the caller** on insert, so an admin or an accountant could attribute a
   payment to a colleague; `get_current_user_uuid()` could pin it. Not part of the request.
