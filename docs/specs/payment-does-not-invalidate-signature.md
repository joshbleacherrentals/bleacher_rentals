# Spec: Paying an installment must not invalidate the contract signature

Status: **Implemented** (2026-09-03) — migrations applied, columns dropped,
`reconcileInstallments.ts` deleted
Owner: quotesAndBookings / payments + quote staleness
Routes affected:

- Public: `/quote/[eventUUID]` (Pay tab, Sign Contract tab, "quote updated" modal)
- Staff: `/quotes-bookings/[id]?tab=billing`
- Server: `/api/stripe/webhook`, `/api/quotes/[id]/version`, `/api/contracts/[eventId]`,
  `/api/contracts/sign`

Amends: [quote-staleness-detection.md](./quote-staleness-detection.md) §3, §5, §12 ·
[payment-accounting-truth.md](./payment-accounting-truth.md) §3.7, §3.8

---

## 1. Summary

A client who pays an installment is immediately asked to re-sign the contract they
already signed. Nothing about the agreement changed — only money arrived.

The chain, confirmed in code:

1. `checkout.session.completed` → the webhook inserts into `PaymentHistory`, then calls
   `reconcileEventInstallments`, which writes `PaymentInstallments.status` / `paid_at`
   (`server/reconcileInstallments.ts:143`, deleted by this spec —
   [a5c5088](https://github.com/joshbleacherrentals/bleacher_rentals/commit/a5c5088)).
2. `recompute_quote_hashes_installments` fires. The canonical document for **both**
   hashes serializes each installment as `{due, amount, status}`
   ([20260804120000_quote_content_hash.sql](../../supabase/migrations/20260804120000_quote_content_hash.sql)),
   so `contract_hash` moves.
3. `trg_invalidate_signature_on_contract_change` sees `signed_contract_hash IS DISTINCT
FROM NEW.contract_hash` and sets the signature to `invalidated`
   ([20260812120000_invalidate_signature_on_contract_change.sql](../../supabase/migrations/20260812120000_invalidate_signature_on_contract_change.sql)).
   The Sign Contract tab now demands a new signature.

Secondary symptom, same root cause: `status` also sits in `content_hash`, so the payment
raises the "This quote has been updated" modal on the payer's own screen.

`paid_at` is **not** in either hash and invalidates nothing. It is dead weight, removed
here for the same reason `status` is.

**A second, independent bug of the same family** (§8): after the client signs, they are
shown "This quote has been updated — please refresh". The signed state legitimately lives
in `content_hash`, but the page's baseline hash is frozen at load, so the client is
notified about a change _they themselves_ just made. Fixed on the client, not in the hash.

## 2. Root cause, stated as a rule

`PaymentInstallments.status` / `paid_at` are a **cache of `allocatePayments`**, already
declared as such in [payment-accounting-truth.md](./payment-accounting-truth.md) §3.7 —
`AllocatableInstallment` does not even accept a status, and every screen recomputes from
`PaymentHistory` at read time.

A hash over contract terms must therefore never contain them. The bug is not "the webhook
writes the wrong column"; it is **derived payment state leaking into a contract
fingerprint**. Suppressing the write alone would leave the trap armed for the next writer
(manual payment entry, a backfill, `supabase db reset` seeding).

## 3. Locked decisions (owner, 2026-09-03)

- **D1 — What re-signs.** Installment **`amount_cents`** and **`due_date`** are
  contract-material: changing either, or adding/removing an installment row, invalidates
  the signature. Payment state (`status`, `paid_at`) is not, and never invalidates.
- **Amendment 2026-11-27.** The date of the installment due on signing is no longer contract
  material: the hash carries the text `on signing` for that row, and the database writes its day
  when the event is first booked. Its percentage still is. See
  [payment-first-installment-on-signing.md](./payment-first-installment-on-signing.md) §3.3.
- **D2 — Payment does not make a quote stale either.** `status` leaves `content_hash` as
  well as `contract_hash`. The Pay tab recomputes paid/due from `PaymentHistory` on every
  render, so the client sees the new numbers without a "refresh me" modal.
- **D3 — The columns are dropped, not merely left unwritten.** A cache nobody may read is
  not worth keeping correct.

### The canonical installment object

```
before:  { 'due', pi.due_date, 'amount', pi.amount_cents, 'status', pi.status }
after:   { 'due', pi.due_date, 'amount', pi.amount_cents }
```

in **both** the `content` and the `contract` document, ordered `BY pi.due_date, pi.id` as
today.

## 4. Scope

**In scope**

1. Migration A — new hash formula + safe re-anchoring of existing signatures.
2. Migration B — `DROP COLUMN status, paid_at` on `PaymentInstallments`.
3. Deleting `reconcileInstallments.ts` and its call from the Stripe webhook.
4. Cleaning up every remaining reader/writer of the two columns (§6).
5. Rebasing the public page's freshness baseline after a client-initiated change (§8) —
   removes the false "quote updated" modal after signing.

**Out of scope**

- Any change to `allocatePayments` — it is already the single derivation and stays untouched.
- Any change to what else lives in either hash (line items, terms, venue, office…).
- Refunds / disputes / partial reversals.
- Manual payment entry (still a stub; when it lands it inserts into `PaymentHistory` only,
  and by this spec cannot invalidate a signature).

## 5. Migration A — hash formula (the fix)

`CREATE OR REPLACE FUNCTION public.recompute_quote_hashes(uuid)` with `status` removed
from `v_installments`, then a backfill.

> ⚠️ **The backfill is the dangerous part.** The formula change moves `contract_hash` for
> **every** event. Backfilling with the invalidation trigger live would invalidate every
> active signature in the database — exactly the bug, at full scale.

Required order inside one migration/transaction:

1. `ALTER TABLE public."Events" DISABLE TRIGGER invalidate_signature_on_contract_change;`
   — the trigger is declared `AFTER UPDATE OF contract_hash ON public."Events"`, not on
   `ContractSignatures`.
2. `CREATE OR REPLACE FUNCTION recompute_quote_hashes(...)` — new formula.
3. Backfill: `PERFORM recompute_quote_hashes(id) FROM "Events";`
4. **Re-anchor**, precisely as the 20260812 migration did for its own baseline problem:
   ```sql
   UPDATE public."ContractSignatures" s
   SET signed_contract_hash = e.contract_hash
   FROM public."Events" e
   WHERE e.id = s.event_uuid AND s.status = 'active';
   ```
   Only `status = 'active'` — an already-invalidated signature keeps its historical
   snapshot and its `invalidated_at`.
5. Re-enable the trigger.

Post-condition, asserted by a test (§9, T4): the set of `active` signatures before the
migration equals the set after.

## 6. Migration B + code cleanup

**SQL**

```sql
ALTER TABLE public."PaymentInstallments"
  DROP COLUMN status,
  DROP COLUMN paid_at;
```

**PowerSync (CLAUDE.md checklist)**

- Remove `paid_at` / `status` from `PaymentInstallmentsCols`
  ([AppSchema.ts:899](../../src/lib/powersync/AppSchema.ts)).
- `npm run gtl` to regenerate `database.types.ts`.
- Sync rules are not in this repo — confirm in the PowerSync dashboard that the
  `PaymentInstallments` bucket selects `*` (nothing to change) rather than a column list
  (must be edited, or sync breaks on deploy). **Blocking pre-check before Migration B.**

**Call sites**

| File                                                                                                  | Today                                                          | After                                                                                                                                   |
| ----------------------------------------------------------------------------------------------------- | -------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| [webhook/route.ts:195](../../src/app/api/stripe/webhook/route.ts)                                     | calls `reconcileEventInstallments`                             | call removed; the webhook records the payment and sends the emails, nothing else                                                        |
| `server/reconcileInstallments.ts` + `.test.ts`                                                        | maintains the cache                                            | deleted                                                                                                                                 |
| [paymentInstallments.ts](../../src/features/quotesAndBookings/db/paymentInstallments.ts)              | selects/writes `status`                                        | column gone from every select, insert and the `"unpaid"` default                                                                        |
| [usePaymentInstallments.ts](../../src/features/quotesAndBookings/hooks/usePaymentInstallments.ts)     | returns `status`, `paidAt` from the row                        | returns schedule terms only; consumers already allocate                                                                                 |
| [PayInvoiceTab.tsx:123](../../src/features/quotesAndBookings/pdf/PayInvoiceTab.tsx)                   | `find((i) => i.status !== "paid")` over `data.paymentSchedule` | unchanged in behaviour — that `status` is **already** the allocation-derived one from `quoteDocumentData`; assert this, do not "fix" it |
| [PayInvoiceTab.tsx:337](../../src/features/quotesAndBookings/pdf/PayInvoiceTab.tsx)                   | `covered?.status ?? inst.status`                               | `covered?.status ?? "unpaid"` — the fallback loses its cache source                                                                     |
| [BillingTab.tsx:198](../../src/features/quotesAndBookings/components/quoteDetail/tabs/BillingTab.tsx) | "cache says paid but no payments" warning                      | deleted — the disagreement it warns about can no longer exist                                                                           |
| `EditPaymentScheduleModal`, `useCreateQuoteStore`, `loadQuoteIntoStore`                               | carry `status` on schedule rows                                | drop the field from the store shape                                                                                                     |
| `supabase/seed.sql`, `e2e/helpers/quoteTestData.ts`                                                   | seed `status`/`paid_at`                                        | columns removed; re-seed with `npx supabase db reset`                                                                                   |

`quoteDocumentData`, `eventPaymentContext`, `BillingTab` summary and the PDF already read
`allocatePayments` and need no behavioural change.

## 7. Behaviour after the change

| Action                                       | `content_hash` | `contract_hash` | Signature        | Client sees                                               |
| -------------------------------------------- | -------------- | --------------- | ---------------- | --------------------------------------------------------- |
| Client pays an installment (full or partial) | unchanged      | unchanged       | stays `active`   | new paid/due numbers on next render, no modal, no re-sign |
| AM edits an installment amount               | changes        | changes         | invalidated      | "must be re-signed"                                       |
| AM moves an installment due date             | changes        | changes         | invalidated      | "must be re-signed"                                       |
| AM adds / removes an installment             | changes        | changes         | invalidated      | "must be re-signed"                                       |
| AM edits client-facing notes                 | changes        | unchanged       | stays `active`   | "quote updated" modal only                                |
| Client signs the contract                    | changes        | unchanged       | created `active` | signed state, and **no** modal once §8 lands              |

## 8. Client-initiated changes must rebase the baseline

### The bug

The client signs → `ContractSignatures` INSERT → `recompute_quote_hashes_signature` fires →
`content_hash` moves (the content document carries
`'signature', {signer: sig.signer_name, signedAt: sig.signed_at}`) → within one poll cycle
(≤10 s) `useQuoteFreshness` reports stale → the "please refresh" modal appears. The page is
already rendering the signed state, so there is nothing to refresh: the client is being
told about their own action.

The baseline never moves: [QuotePublicTabs.tsx:59](../../src/features/quotesAndBookings/pdf/QuotePublicTabs.tsx)
passes `data.contentHash` — a server-render constant — straight into
[useQuoteFreshness](../../src/features/quotesAndBookings/pdf/useQuoteFreshness.ts), which
has no way to be told "that change was mine".

### Why not simply drop `signature` from `content_hash`

Because the signed state is genuinely part of what a viewer sees. The public link is not
private to one person — a client and their finance contact can both have it open, and the
second viewer must learn that the document has been signed. Removing it from the hash would
trade a false positive for a false negative. The hash is right; the client is missing a way
to adopt a hash it caused.

### Rule

> **Any action the public page performs on its own quote must return the resulting
> `content_hash`, and the page must adopt it as its new baseline.**

This generalizes beyond signing — it is the standing rule for every future client-initiated
mutation on `/quote/[eventUUID]`.

### Shape

| Piece                                                                    | Change                                                                                                                                                                                                 |
| ------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| [`POST /api/contracts/sign`](../../src/app/api/contracts/sign/route.tsx) | response gains `contentHash`: read `Events.content_hash` after the signature INSERT (the trigger has already run in the same statement's aftermath), alongside the existing `signatureId` / `signedAt` |
| `QuotePublicTabs`                                                        | `const [baseline, setBaseline] = useState(data.contentHash)`; pass `baseline` to `useQuoteFreshness`                                                                                                   |
| `SignContractTab`                                                        | gains an `onSigned(contentHash)` prop, called on a successful sign                                                                                                                                     |
| `useQuoteFreshness`                                                      | **no change** — its effect already re-runs when `initialContentHash` changes, so a new baseline restarts polling cleanly                                                                               |

Payment needs no equivalent: Stripe returns the client to the page via `return_url`, which is
a full load with a fresh baseline — and after §5 a payment no longer moves `content_hash` at
all.

### Accepted trade-off

An unrelated edit landing in the millisecond window between the signature INSERT and the
`content_hash` read is adopted as if it were the client's own, and its modal is swallowed.
Bounded and self-healing: the next edit moves the hash again, and an edit to a signed
contract independently invalidates the signature, which the Contract tab surfaces on its own
path. Not worth a transaction.

## 9. Test plan (TDD order — each red before its fix)

Postgres-level tests run against the local Supabase, in the style of the existing
`reconcileInstallments.test.ts` (service-role client, real DB), not mocks.

1. **T1 (red now)** — event with an `active` signature and a payment schedule; insert a
   succeeded `PaymentHistory` row → `Events.contract_hash` is byte-identical to before and
   the signature is still `active`.
2. **T2 (red now)** — same setup → `content_hash` is unchanged (no staleness modal).
   Extend [quoteStaleness.public.spec.ts](../../src/features/quotesAndBookings/e2e/quoteStaleness.public.spec.ts)
   with the paying-client journey.
3. **T3 (must stay green — the guard against over-fixing)** — updating an installment's
   `amount_cents`, then its `due_date`, then deleting a row, each changes `contract_hash`
   and flips the signature to `invalidated`.
4. **T4 — migration safety** — snapshot the ids of `active` signatures, run Migration A,
   assert the same set is still `active` and every one has
   `signed_contract_hash = Events.contract_hash`.
5. **T5** — webhook integration: a payment still lands in `PaymentHistory`, still sends
   both trigger emails, and touches `PaymentInstallments` **not at all**.
6. **T6** — component: `BillingTab` and `PayInvoiceTab` render correct per-installment
   badges (`unpaid` / `partial` / `paid`) with the columns gone.
7. **T7 (red now)** — route: `POST /api/contracts/sign` returns a `contentHash` equal to the
   event's `content_hash` after signing, and different from the one before.
8. **T8 (red now)** — e2e, in `quoteStaleness.public.spec.ts` with `?pollMs=`: sign the
   contract, let several poll cycles elapse, assert the "quote updated" modal never appears
   — while the existing test, in which a _manager_ edits the quote mid-session, still shows
   it.

## 10. Edge cases

- **A payment arrives for a quote whose signature is already `invalidated`.** Nothing
  changes; it stays invalidated. Payment neither invalidates nor revalidates.
- **Payment in a foreign currency.** Excluded from the balance by `allocatePayments` §3.6,
  and — since it never touches an installment row — cannot move a hash either.
- **Webhook redelivery.** Already idempotent via the `23505` path; with the reconcile gone
  there is no second write to be non-idempotent about, which retires the eventual-consistency
  caveat in [payment-accounting-truth.md](./payment-accounting-truth.md) §3.8.
- **A tab open across the migration** holds a pre-migration `contentHash` baseline and will
  show "quote updated" once. Acceptable: one refresh, no re-sign, and only for sessions open
  at deploy time.
- **Offline / PowerSync.** Schedule terms still sync; paid state was never available offline
  in a trustworthy form and still is not — `PaymentHistory` remains the source.

## 11. Definition of Done

- [ ] Both migrations applied locally via `npx supabase db reset`; seed updated.
- [ ] `npm run gtl` run; `database.types.ts` and `AppSchema.ts` agree.
- [ ] T1–T8 green; T3 verified green **before and after** the change.
- [ ] `npm run tc`, `npm run test`, `npm run lint` green.
- [ ] `npm run test:e2e` — public quote paths (payment + staleness + signing).
- [ ] `permissionPageData.ts` — **no change required**: no role gains or loses an ability
      here. Stated explicitly in the PR so `/preflight` is not left guessing.
- [ ] §3.7 / §3.8 of `payment-accounting-truth.md` and §3 / §7 / §12 of
      `quote-staleness-detection.md` amended to point here — §7 gains the baseline-rebase
      rule, which its polling design predates.

## 12. Rollout

Three commits, releasable independently:

1. **Migration A + T1–T4.** Stops the bleeding in production on its own; the columns stay,
   merely irrelevant.
2. **Migration B + cleanup + T5–T6.** Irreversible (column drop), so it ships only after
   step 1 has been observed working in production and the sync-rules pre-check has passed.
3. **Baseline rebase (§8) + T7–T8.** No migration, no dependency on 1 or 2 — a client-only
   change plus one field in a route response. Can ship first if the false modal after
   signing is the more visible annoyance.
