# Payments — every reader skips deleted rows

Status: **IMPLEMENTED 2026-10-04, awaiting review** — not checked by hand in a browser (Clerk
sign-in is unavailable here); no Playwright scenario (no screen change). 0 open decisions (D1–D3 answered
2026-10-03). Approved 2026-10-04 with two additions: `describeAppliedTo.ts` as an 11th counted file, and
the extra test files named in §5.
Original request: №6, part 2 of 3. Implementation order: **08 of 11**. Needs
[07](accountant-quotes-07-payments-soft-delete-db.md) (the `deleted_at` columns). Next:
[09](accountant-quotes-09-payments-edit-delete-ui.md) (the screen).
Branch: `q4-sprint1-finance-role`.
Builds on: [payment-accounting-truth.md](payment-accounting-truth.md), [manual-payment-entry.md](manual-payment-entry.md).

## 0. The request, and what it is not

A soft-deleted payment must **not count anywhere money is counted or listed**:

- **Internal readers** — the Billing tab, the AR tabs of `/accountant`, the schedule guard — skip deleted rows
  through **one shared point** (D2).
- **The public side** — the public quote page, the PDF, the public history API, the pay-now context — **never**
  receives a deleted row (D1).
- **Who receives deleted rows:** every role that reads payments (D3), so the "Show deleted" switch of spec 09 is
  visible to all of them, read-only for those who cannot write.

**Until spec 09, nothing deletes a payment from the screen**, so in practice no reader meets a deleted row; this
spec makes sure that when one exists, nothing counts it.

**Not part of this spec, so not changed:**

- the database (spec 07) and the sync rules (D3: deleted rows already flow with `PaymentHistory.*`);
- the edit and delete buttons, the "Show deleted" switch and the edit log (spec 09);
- the Stripe webhook's idempotency read — it looks up a row by Stripe session, and a Stripe row can never be
  deleted;
- `PaymentDetailDialog` and the record dialog.

## 1. Decisions (all taken by the user)

**D1 — does the client ever see a deleted payment**

- **Option A — never:** the public API, the PDF, the public page's data and the pay-now context do not return a
  deleted row at all (the filter is in the query); the client cannot learn that a payment was deleted.
  **Option B — shown as "Voided":** the client sees the row marked, without the reason, and it is not counted; the
  public API returns `deleted_at` to anyone who knows an event id.
- **User's answer: A — never.**

**D2 — where "skip deleted" happens for the internal readers**

- **Option A — in every query:** each reader adds `deleted_at IS NULL`; `allocatePayments` does not change.
  **Option B — one shared point:** readers load every row; `allocatePayments` gets a new exclusion reason
  `deleted` (as it has for `currency` and `status`), and one helper decides what a list hides.
- **User's answer: B — one shared point.** Consequence of D1, not a further choice: the three server and public
  queries (§3) **also** filter in the query, because the client must never receive the row.

**D3 — who receives deleted rows, and who can see them**

- **Option A — every role that reads payments:** admin, account manager, viewer and accountant receive them with
  the existing sync rules; "Show deleted" is visible to all of them. **Option B — only those who can write:**
  admin, and the accountant from spec 10; the other buckets get `WHERE deleted_at IS NULL`, which is a
  sync-rules change here and another in spec 10.
- **User's answer: A — every role that reads payments.**

## 2. Research findings

**Every reader of `PaymentHistory`** (non-test code; the SQL migrations only mention it in comments — no function,
view or trigger reads it):

- `utils/allocatePayments.ts` — the one place that turns payments into balances. It already marks a payment
  `excluded: "currency"` or `"status"` and leaves it out of the totals while still returning it. Its callers:
  `BillingTab`, `utils/accountsReceivable.ts` (the AR tabs), `server/eventPaymentContext.ts`,
  `pdf/quoteDocumentData.ts`, `pdf/PayInvoiceTab.tsx`;
- `hooks/usePaymentHistory.ts` — the Billing tab's list and allocation input (local);
- `hooks/useAccountsReceivableData.ts` — all payments of all events, for AR (local);
- `db/paymentInstallments.ts` — reads `installment_id, amount_cents, status` for the schedule guard
  (`describeBlockedRemovals` in `scheduleDiff.ts`); **needs no change**, because a deleted payment has
  `installment_id` null (spec 07, D7);
- `server/eventPaymentContext.ts` — the server's view for the public checkout (service role);
- `pdf/quoteDocumentData.ts` — the quote document, public page and PDF (service role);
- `app/api/payments/history/route.ts` — the public history API (service role, an explicit column list);
  `pdf/PayInvoiceTab.tsx` calls it from the browser;
- `app/api/stripe/webhook/route.ts` — reads one row by `stripe_checkout_session_id` for idempotency (unchanged).

**The hashes.** Payments are outside the quote hashes (`20260903120000_payment_state_out_of_quote_hashes.sql`), so a
deletion does not make a quote "stale" or invalidate a signature.

## 3. What changes in the app

**The shared point (D2)**

- `utils/allocatePayments.ts`: `AllocatablePayment` gains a **required** `deletedAt: string | null`. A payment
  with `deletedAt` set is `excluded: "deleted"`: not counted, not placed in any installment, not part of
  `totalReceivedCents`. `deleted` takes precedence over `status` and `currency`. Being required, the field makes
  every caller map it.
- `utils/deletedPayments.ts` (new): `isDeletedPayment(row)` and `withoutDeleted(rows)` — what a list hides when it
  is not showing deleted rows.

**Internal readers**

- `hooks/usePaymentHistory.ts`: selects `deleted_at`, `deleted_by_user_uuid`, `delete_reason`;
  `PaymentHistoryRow` gains `deletedAt`, `deletedByUserUuid`, `deleteReason`; it returns **all** rows.
- `BillingTab.tsx`: the list shows `withoutDeleted(payments)`; the allocation still receives all rows (and
  excludes the deleted ones itself).
- `hooks/useAccountsReceivableData.ts` and `utils/accountsReceivable.ts`: the payments query selects
  `deleted_at`; `ReceivablePaymentRow` gains it; the mapping to `AllocatablePayment` carries `deletedAt`.

**Server and public readers (D1) — filtered in the query as well**

- `server/eventPaymentContext.ts`, `pdf/quoteDocumentData.ts`: `.is("deleted_at", null)` on the `PaymentHistory`
  query; they also select `deleted_at` and map `deletedAt` so the type is satisfied.
- `app/api/payments/history/route.ts`: `.is("deleted_at", null)`; the response keeps its present shape — no
  deleted row, no `deleted_at`.
- `pdf/PayInvoiceTab.tsx`: maps the API's rows to `AllocatablePayment` with `deletedAt: null`.

**No sync-rules change, no matrix change** (nothing role-visible changes before spec 09).

## 4. Behaviour scenarios

There is **no screen change** in this spec and no way to create a deleted row from the screen yet, so no
Playwright scenario; the behaviour is pinned by the Vitest cases of §6.

## 5. Files

**Counted — 11 files** (limit 10; one over, see R3):

1. `src/features/quotesAndBookings/utils/allocatePayments.ts` — changed
2. `src/features/quotesAndBookings/utils/deletedPayments.ts` — new
3. `src/features/quotesAndBookings/hooks/usePaymentHistory.ts` — changed
4. `src/features/quotesAndBookings/components/quoteDetail/tabs/BillingTab.tsx` — changed
5. `src/features/quotesAndBookings/hooks/useAccountsReceivableData.ts` — changed
6. `src/features/quotesAndBookings/utils/accountsReceivable.ts` — changed
7. `src/features/quotesAndBookings/server/eventPaymentContext.ts` — changed
8. `src/features/quotesAndBookings/pdf/quoteDocumentData.ts` — changed
9. `src/features/quotesAndBookings/pdf/PayInvoiceTab.tsx` — changed
10. `src/app/api/payments/history/route.ts` — changed
11. `src/features/quotesAndBookings/utils/describeAppliedTo.ts` — changed: `AppliedToDescription`'s
    `reason` is `"currency" | "status"`, and the new `excluded: "deleted"` does not fit it (`npm run tc`
    fails at `describeAppliedTo.ts:44`), so the union gains `"deleted"`. Added 2026-10-04 on the user's
    "Approved, 1 A". `PaymentDetailDialog` is **not** changed here: for any reason that is not `currency`
    it prints the status sentence, so a `deleted` reason would read wrongly there. It cannot be reached
    before spec 09 — the Billing list hides deleted rows and the dialog opens from the list — and spec 09
    changes the dialog.

**Not counted:** tests — `allocatePayments.test.ts`, `accountsReceivable.test.ts`, `BillingTab.test.tsx`,
`eventPaymentContext.test.ts`, `src/app/api/payments/history/route.test.ts` (edited);
`describeAppliedTo.test.ts` (edited: a case for `deleted`),
`quoteDocumentData.schedule.test.ts` and `quoteDocumentData.salesOffice.test.ts` (edited: their Supabase
fakes have no `.is()`, and the first asserts the filter — the "quote-document tests" of §6 step 3; added
2026-10-04 on the user's "Approved, 2 A");
`src/app/api/payments/create-checkout/route.test.ts` (edited: one line, `is: () => chain` in its Supabase
fake — the checkout reads payments through `eventPaymentContext`; found while implementing, same kind as
the two above);
`describeAppliedTo.test.ts` (above), `computeAmountDue.test.ts` (edited: its payment builder gains
`deletedAt: null`, because the field is required);
`deletedPayments.test.ts` (new); no migration, `sync_rules.yaml`, `AppSchema.ts`, `database.types.ts` or
`permissionPageData.ts`.

## 6. Tests and implementation sequence

Red first; each step ends at a gate. Prettier only on touched files.

1. **The shared point.** In `allocatePayments.test.ts` first: a deleted payment is `excluded: "deleted"`, is not
   in `totalReceivedCents`, does not fill or reopen any installment; a deleted refund (negative) does not reopen
   one; `deleted` wins over `status` and `currency`; with no deleted row, every existing case gives the result
   it gave before. In `deletedPayments.test.ts`: `isDeletedPayment`, `withoutDeleted` keeps order and identity of
   the rest. Then the code.
2. **The internal readers.** `accountsReceivable.test.ts`: a deleted payment changes neither Amount Due nor
   Remaining Balance. `BillingTab.test.tsx`: a deleted row is not listed, and the balance, installment statuses
   and the received total ignore it.
3. **The server and public readers.** `eventPaymentContext.test.ts` and `route.test.ts`: the `PaymentHistory`
   query carries the `deleted_at IS NULL` filter (asserted on the query builder's calls), a row that came back
   deleted anyway is still not counted by the context, and the API response contains no `deleted_at` and no
   deleted row; the quote-document tests assert the same filter.
4. **Gate:** `npm run tc`, `npx vitest run`, `prettier --check` on the touched files. E2E: SKIPPED (no UI change;
   not run locally, by instruction).

## 7. Edge cases and error handling

- **A device holding an old copy.** A deleted row that arrives later is excluded from every total on that device
  as soon as it syncs; until then it is still counted there (the PowerSync delay).
- **Offline.** Nothing here touches the network; the local readers use the local copy.
- **Priority of reasons.** A payment that is both deleted and in another currency is `deleted`.
- **Stripe rows.** They are never deleted (spec 07), so the webhook's idempotency lookup and the Stripe path
  are unaffected.
- **Currency and negatives.** Unchanged: a deleted negative row simply stops counting.
- **Clerk.** Nothing new: no route, token or webhook is touched.

## 8. Risks

- **R1 — a reader added later can forget the rule.** The required `deletedAt` protects callers of
  `allocatePayments`; a new query that sums `amount_cents` itself would count deleted rows. The list in §2 is the
  check, and review is the only guard.
- **R2 — three queries rely on their own filter (D1).** If one of the server or public queries lost
  `deleted_at IS NULL`, the client would receive a deleted row; the tests of §6 pin the three.
- **R3 — the file count is one over the limit** (11 of 10): `describeAppliedTo.ts` cannot stay untouched
  while `allocatePayments` gains a reason its union does not know. Cutting it would leave `tc` red, so the
  count is stated here instead.
