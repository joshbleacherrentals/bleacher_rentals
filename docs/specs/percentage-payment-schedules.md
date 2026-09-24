# Percentage payment schedules

Status: Approved by the user and implemented locally — 2026-09-22.

## Behavior

- Fresh quotes start with the existing two-installment default: 50% due today,
  50% due seven days before the event, clamped to today. Initialize once per new
  quote; restoring drafts and loading existing quotes must preserve their schedules.
- Until a new quote's dates are edited manually, selecting its event start updates
  the default second due date. Existing saved due dates remain explicit dates.
- Edit percentages and due dates only. Dollar amounts are read-only, derived from
  the current quote total including discounts and tax. A $1,000 quote with 50/50
  becomes $1,000 per installment when the total changes to $2,000.
- Percentages accept two decimal places and must sum to exactly 100%. Dates are
  required. Invalid schedules cannot be saved through the editor or quote save.
- Keep the existing explicit remove-schedule action and support historical quotes
  without schedules; automatic defaults apply only to fresh quotes.

## Schema and migration

- Replace `PaymentInstallments.amount_cents` with integer `percentage_bps`
  (basis points: 5,000 = 50%, 10,000 = 100%). Keep IDs, event links, currency,
  due dates, payment references and existing permissions.
- Add/backfill the column, update dependent SQL functions, then make the old
  `amount_cents` nullable and mark it deprecated. It is deliberately not dropped, so no
  saved data is lost. Regenerate `database.types.ts` with `npm run gtl`; add
  `percentage_bps: column.integer` to `AppSchema.ts` and keep `amount_cents` listed.
  Audit sync projections and registries for explicit column lists.
- Backfill positive-total quotes using each amount divided by the current quote
  total, not the sum of installments. Balanced schedules get deterministic rounding
  to exactly 10,000 basis points. Already-unbalanced schedules retain their
  imbalance and require correction on editing; do not silently normalize them.
- Zero-total schedules with all-zero amounts receive equal shares, with the final
  share absorbing the basis-point remainder. A zero-total schedule with nonzero
  amounts, negative amounts or missing usable totals fails migration preflight
  with affected IDs for review, instead of guessing terms or deleting data.
- `percentage_bps` is non-null and nonnegative. UI/save validation additionally
  restricts each share to at most 10,000 and a nonempty schedule to exactly 10,000.
  Avoid a per-row database sum constraint: PowerSync uploads rows individually.
- Update quote content/signature hashing to account for percentage terms and
  derived amounts. Real term changes still invalidate signatures; payment history
  changes do not. Migration must explicitly test and report any signature
  invalidation caused by conversion; never silently mark changed terms as signed.
- Schema removal requires coordinated application/sync rollout; old offline
  clients that still write `amount_cents` cannot remain supported after removal.
  This task prepares and verifies locally; production rollout is separate.

## Locked TypeScript contracts

```ts
export type PaymentInstallment = {
  id: string;
  dueDate: string; // YYYY-MM-DD
  percentageBps: number;
};

export type ResolvedPaymentInstallment = PaymentInstallment & {
  amountCents: number; // derived, never saved as a schedule term
};

export function resolvePaymentSchedule(
  installments: readonly PaymentInstallment[],
  totalCents: number,
): ResolvedPaymentInstallment[];

export function buildDefaultPaymentSchedule(
  eventStart: string | null | undefined,
  today?: string,
  idFn?: () => string,
): PaymentInstallment[];

export type PaymentInstallmentRow = PaymentInstallment & {
  currency: string;
};
```

`usePaymentInstallments(eventId)` returns percentage rows. Consumers resolve them
against their current total before allocation. Existing allocation and payment
history contracts remain unchanged. React 19 components read the store or hook;
no new public component props are required.

For a valid schedule, floor each calculated cent amount and distribute remaining
cents by largest fractional remainder, breaking ties by due date then ID. Results
are independent of query order and sum exactly to the total. Invalid legacy
schedules retain their short/excess total rather than receiving a balancing
adjustment. Zero total resolves to zero; negative/nonfinite totals are rejected.

## Integration and failure handling

- Update the store, draft restoration, editor, summary, load/save diff, Billing
  tab, public quote/Pay tab, PDF and server payment context/checkout to use the
  shared resolver. Audit raw SQL/PostgREST selects and fixtures too.
- Version persisted drafts and convert legacy amount-based drafts with the same
  migration rules. Surface conversion failures without discarding the draft.
- Use compiled Kysely and typed PowerSync helpers, including `expect<T>()` for
  reads. Offline editing and amount recalculation require no network request.
- Loading/sync failures must not appear as an empty schedule or trigger defaults.
  Preserve the draft on save failure and display the existing error feedback.
- Keep Clerk authorization unchanged. Expired/unauthorized server requests return
  existing auth errors; retained drafts allow retry after authentication.
- Preserve installment IDs and the existing ban on deleting installments with
  payments. Received money remains sourced from PaymentHistory; changing totals
  may change allocation/status, never historical payment amounts or targets.

## Tests and acceptance

Write failing logic tests before implementation, then verify:

1. New quote displays and saves 50/50 without opening the editor; reset creates
   fresh IDs, while loading/restoring preserves existing schedules.
2. Change $1,000 to $2,000: 50/50 remains 50/50 and $500 becomes $1,000 per row,
   immediately and after save/reload. Test discounts and taxes too.
3. Editor offers no editable dollar field; 90% and 110% totals cannot save;
   33.33/33.33/33.34 can save. Invalid dates/values remain blocked.
4. Odd cents, zero totals, three-way splits and reordered input resolve
   deterministically. Migration tests cover balanced/unbalanced/zero-total rows.
5. Staff billing, public Pay tab, PDF and checkout use updated amounts; partial
   payments and linked installment IDs survive price changes.
6. Offline edits, draft upgrades, auth errors and failed saves retain user input.
7. Signature tests cover percentage/date/price changes versus payment-only changes.

Playwright covers new quotes, editing percentages, changing price, save/reload and
public schedule rendering with the existing admin/AM/public fixtures. Unit and
component tests cover resolver, migration/draft conversion, validation, server
payment calculations and rendering. SQL tests cover backfill and hash behavior.

Required implementation checks: `npm run tc`, `npx vitest run`, `npm run lint`,
`npm run test:e2e`, `npm run gtl`, and the added migration SQL tests. Report actual
output and any blocker; do not declare implementation complete with failing checks.
