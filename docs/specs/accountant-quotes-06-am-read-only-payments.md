# Account manager — payment history becomes read-only

Status: **DRAFT — awaiting "Approved"** — 0 open decisions (D1–D2 answered 2026-10-03; the scope in §0
is taken from the request).
Original request: №5. Implementation order: **06 of 11**. Needs
[03](accountant-quotes-03-capabilities.md) (the capability table).
Branch: `q4-sprint1-finance-role`.
Builds on: [manual-payment-entry.md](manual-payment-entry.md) (this spec supersedes its account-manager
scenarios S8 and S13), [payment-accounting-truth.md](payment-accounting-truth.md).

## 0. The request, and what it is not

An **account manager can no longer record a payment**; they can only read the payment history. The
request names the role, so it applies to **every account manager — lead and junior alike**.

- **The database:** an account manager's insert into `PaymentHistory` is refused.
- **The screen:** the "+ Record Payment" button is not drawn for an account manager.
- **Reading stays:** an account manager still sees every payment on every quote, opens a payment to
  read it in full, and sees the balances on the Billing tab.

**Until spec 10, only an admin can record a payment** (the order of the request is 05, 06…, 07; the
accountant gets the right in spec 10).

**Not part of this spec, so not changed:**

- editing and deleting payments (specs 07–09 — today a recorded payment can be neither);
- the accountant's right to record (spec 10);
- Stripe payments (written by the webhook with the service role, not by a user);
- what a viewer or any other role can do.

## 1. Decisions

**D1 — what the button looks like for an account manager**

- **Question:** spec 03 gave Record Payment two booleans (drawn, and pressable) because a junior
  account manager saw it disabled on someone else's quote. After this spec only an admin may record,
  so that state is unreachable.
- **Option A — hidden, one boolean:** the two booleans merge into one `recordPayment`; the disabled
  state and its hint ("You can only record a payment on quotes you created") leave the code.
- **Option B — hidden, two booleans:** the account manager does not see the button; the two booleans
  and the disabled state stay in the code, never reached.
- **Option C — visible, disabled with a hint:** the account manager sees a disabled button with a new
  hint ("only an admin or an accountant can record a payment"); two booleans stay in use.
- **User's answer: A — hidden, one boolean.**

**D2 — an offline payment recorded before the release**

- **Question:** an account manager who recorded a payment with no connection before the release has
  it in the PowerSync upload queue; online again, it meets the new policy and is refused (`42501`).
  The connector discards it and shows "A change could not be saved and has been discarded."
- **Option A — accept the current behaviour:** the payment is discarded with that toast; no code for
  this case.
- **Option B — accept it and announce it:** the same, plus a line in the What's New changelog asking
  account managers to sync before the update.
- **User's answer: A — accept the current behaviour.**

## 2. Research findings

**The database.** The only INSERT policy on `PaymentHistory` is `payment_history_insert`: `to
authenticated`, `with check (get_user_roles() && '{admin,account_manager}' and entry_source =
'manual')` (`20260904120000_manual_payment_entry.sql`). There is **no UPDATE and no DELETE policy for
anyone**. The Stripe webhook writes with the service role and bypasses RLS. `payment_history_select`
is `{admin,account_manager,viewer}` (spec 02 adds the accountant).

**The screen.** After spec 03 `BillingTab` draws "+ Record Payment" when `can.showRecordPayment`,
and disables it when `!can.recordPayment`, with the hint "You can only record a payment on quotes you
created." `RecordPaymentDialog` and `recordManualPayment` have no role check of their own.

**A discarded upload.** `42501` is in the connector's unrecoverable list (`BackendConnector.ts`); its
comment says the user must be told when a `PaymentHistory` insert is discarded, and it does that with
the toast named in D2.

**The matrix.** The _Record a Payment_ row says an account manager is `custom`: a lead on any quote,
everyone else on quotes they created, otherwise disabled. _Payment History_ says an account manager
`read`s exactly what an admin sees.

**Tests that pin today's behaviour:** `manual_payment_entry.test.sql` (an account manager may insert a
manual row — T2 in its header comment), `BillingTab.test.tsx` (S13 lead enabled, S8 junior disabled
with the hint), `recordPayment.am.spec.ts` (S13, the seeded E2E account manager is a lead),
`getQuotesBookingsCapabilities.test.ts` (the account manager's `showRecordPayment` / `recordPayment`),
`permissionPageData.test.ts` if it asserts that row.

## 3. Database — `supabase/migrations/20261004150000_am_read_only_payment_history.sql`

(After spec 05's `20261004140000`; renumber if `develop` has moved.)

- **`ALTER POLICY payment_history_insert ON public."PaymentHistory"`** — `WITH CHECK
(public.get_user_roles() && '{admin}'::text[] AND entry_source = 'manual')`. The role list loses
  `account_manager`; the `entry_source = 'manual'` condition stays.

**Deliberately not changed:** `payment_history_select`; there is still no UPDATE or DELETE policy; the
webhook path; every other table. Spec 10 adds `accountant` to this same check.

## 4. App changes

- `src/features/userAccess/logic/getQuotesBookingsCapabilities.ts`: `showRecordPayment` is removed and
  **`recordPayment` is "yes" for an admin only**; for an account manager (lead and junior), a viewer
  and every other role it is "no". `manageQuote` and the other capabilities are unchanged.
- `src/features/quotesAndBookings/components/quoteDetail/tabs/BillingTab.tsx`: the button is drawn
  only when `can.recordPayment`; the `disabled` prop, the "You can only record a payment on quotes you
  created." hint and the grey disabled style are deleted; the enabled title and style stay.
- `src/features/userAccess/permissionPageData.ts` (draft wording, for review) — **Record a Payment:**
  account manager `custom` → `none`: "No. Reading the payment history is a separate thing, and they
  can still do that." (the viewer's wording). The admin note and the description are unchanged here.
  `permissionPageData.test.ts` is updated if it asserts that row.

## 5. Behaviour scenarios (for Playwright — written, not run)

- **S1** account manager (the seeded one is a lead) on a quote's Billing tab: the payment history is
  readable and a payment opens in full; there is **no** "+ Record Payment" button.
- **S2** admin: records a check payment as before (`recordPayment.admin.spec.ts` unchanged).
- **S3** viewer: no button, as before.
- **S4** a refusal at the database is asserted in the SQL test; the Playwright spec asserts only what
  the UI shows.

## 6. Files

**Counted — 3 files** (limit 10):

1. `supabase/migrations/20261004150000_am_read_only_payment_history.sql` — new
2. `src/features/userAccess/logic/getQuotesBookingsCapabilities.ts` — changed
3. `src/features/quotesAndBookings/components/quoteDetail/tabs/BillingTab.tsx` — changed

**Not counted:** `src/features/userAccess/permissionPageData.ts`; tests — `manual_payment_entry.test.sql`,
`getQuotesBookingsCapabilities.test.ts`, `BillingTab.test.tsx`, `permissionPageData.test.ts`,
`recordPayment.am.spec.ts` (edited); no new `package.json` script (`test:db:payments` already runs the
SQL test); no `sync_rules.yaml`, `AppSchema.ts` or `database.types.ts`.

## 7. Tests and implementation sequence

Red first; each step ends at a gate. Playwright is **written, not run**; Prettier only on touched
files.

**7.1 Database**

- **Work:** the migration; `manual_payment_entry.test.sql` edited.
- **Test asserts, each its own assertion:** an admin inserts a manual row (allowed); an account manager
  — **lead and non-lead** — is refused; a viewer is refused; an admin cannot insert a non-manual row;
  an account manager still **reads** the rows; no UPDATE or DELETE is possible for anyone.
- **Gate:** dry-run in `BEGIN … ROLLBACK` through the `supabase_db_bleacher_rentals` container;
  `npm run test:db:payments` passes.

**7.2 Capability table and screen**

- **Tests first:** `getQuotesBookingsCapabilities.test.ts` — `recordPayment` is true for an admin and
  false for lead AM, junior AM, viewer, maintainer, developer, driver and accountant (the accountant
  until spec 10); `BillingTab.test.tsx` — the button is present only with `can.recordPayment`; the S8
  and S13 cases are replaced by "an account manager is not shown it".
- **Work:** the capability function and `BillingTab`.
- **Gate:** `npm run tc`, `npx vitest run`, `prettier --check` on the touched files. E2E: SKIPPED (not
  run locally, by instruction).

## 8. Edge cases and error handling

- **Offline.** A payment an account manager recorded offline before the release is discarded on upload
  with the toast of D2; the local row may remain on that device until the next sync.
- **Payments already recorded by account managers.** They stay in the history and stay readable
  (`recorded_by_user_uuid` is untouched).
- **A user who is account manager and admin.** The admin right wins (roles are additive).
- **A role changed while signed in.** `get_user_roles()` and the store's `roles` update; the button
  appears or disappears on the next render; a stale upload is refused.
- **Clerk.** Nothing new: no route, token or webhook is touched.

## 9. Risks

- **R1 — a window with one writer.** From this spec until spec 10 only an admin can record a payment;
  if they are released apart, account managers and accountants can record none.
- **R2 — a discarded offline payment (D2).** The user sees a toast; a payment they believed recorded is
  not, until someone re-enters it.
- **R3 — the lead account manager loses the right too.** The request names the role, not the lead
  status; the seeded E2E account manager is a lead, so `recordPayment.am.spec.ts` changes meaning.
