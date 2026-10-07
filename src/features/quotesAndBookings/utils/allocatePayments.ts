/**
 * Works out how much of an event's money has actually arrived, and where it sits.
 *
 * `PaymentHistory` is the source of truth: it holds the amounts that really
 * moved. An installment carries no payment state of its own — it used to cache
 * one, and reading that flag to decide how much was paid is what let a $1.00
 * payment close a $3,600.00 installment in production. The columns are gone;
 * every screen asks this function instead, so they cannot disagree.
 *
 * Amounts are signed. A refund, a bounced check and a corrected typo are all
 * negative rows, because the ledger is append-only and an offsetting row is the
 * only way to undo anything. So this walks in both directions: money fills
 * installments oldest-first, and a net loss un-fills them newest-first, on the
 * reading that a refund reopens the most recent obligation. Nothing is clamped
 * out of existence on the way — `totalReceivedCents` is every counted cent of
 * either sign, and it may legitimately be negative.
 *
 * Placement is computed from aggregates rather than by walking payments in
 * order, which is what makes a refund and the payment it reverses commute.
 *
 * A soft-deleted payment is returned but never counted: it is `excluded: "deleted"`, takes no
 * part in any installment and none in `totalReceivedCents`, and a deleted refund reopens nothing.
 * `deleted` wins over `status` and `currency`. This is the one place that decides it
 * (docs/specs/accountant-quotes-08-payments-readers-skip-deleted.md).
 *
 * Pure and deterministic: no clock, no I/O, no mutation of the caller's arrays.
 * See docs/specs/payment-accounting-truth.md and
 * docs/specs/manual-payment-entry.md §3.3–§3.4.
 */

import { isDeletedPayment } from "./deletedPayments";

export type AllocatablePayment = {
  id: string;
  installmentId: string | null;
  amountCents: number;
  currency: string;
  status: string;
  paidAt: string | null;
  createdAt: string;
  /** Set when the payment was soft-deleted. Required, so that no caller can forget to map it. */
  deletedAt: string | null;
};

export type AllocatableInstallment = {
  id: string;
  dueDate: string; // YYYY-MM-DD
  amountCents: number;
};

export type InstallmentAllocation = {
  installmentId: string;
  dueDate: string;
  amountCents: number;
  allocatedCents: number;
  status: "unpaid" | "partial" | "paid";
  /** Timestamp of the payment that completed it. Never set unless fully paid. */
  paidAt: string | null;
};

/** Where one payment's money actually went, after allocation. */
export type PaymentAllocation = {
  paymentId: string;
  parts: { installmentId: string; cents: number }[];
  unallocatedCents: number;
  /** Why the payment was not counted at all, if it wasn't. */
  excluded: null | "currency" | "status" | "deleted";
};

export type Allocation = {
  installments: InstallmentAllocation[];
  byPayment: PaymentAllocation[];
  totalReceivedCents: number;
  allocatedCents: number;
  /** Money received beyond what the schedule can absorb. Counted, never lost. */
  unallocatedCents: number;
  foreignCurrencyPayments: { paymentId: string; currency: string; amountCents: number }[];
};

const COUNTED_STATUS = "succeeded";

/**
 * Timestamps reach us in two shapes: PostgREST returns
 * `2026-08-13T19:00:40.247+00:00`, the PowerSync local DB returns
 * `2026-08-13 19:00:40.247+00`. Compared as strings those two sort wrongly
 * against each other, so everything goes through epoch milliseconds.
 */
export function toEpochMs(value: string | null): number | null {
  if (!value) return null;
  const iso = value
    .trim()
    .replace(" ", "T")
    .replace(/([+-]\d{2})$/, "$1:00");
  const ms = Date.parse(iso);
  return Number.isNaN(ms) ? null : ms;
}

/** Sort key for a payment: when the money arrived, as far as we can tell. */
function effectiveMs(p: AllocatablePayment): number {
  return toEpochMs(p.paidAt) ?? toEpochMs(p.createdAt) ?? Number.POSITIVE_INFINITY;
}

/** Ordering comparison, not subtraction — an unparseable timestamp is Infinity. */
function compare(a: number | string, b: number | string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

function comparePayments(a: AllocatablePayment, b: AllocatablePayment): number {
  return (
    compare(effectiveMs(a), effectiveMs(b)) ||
    compare(
      toEpochMs(a.createdAt) ?? Number.POSITIVE_INFINITY,
      toEpochMs(b.createdAt) ?? Number.POSITIVE_INFINITY,
    ) ||
    compare(a.id, b.id)
  );
}

function compareInstallments(a: AllocatableInstallment, b: AllocatableInstallment): number {
  return compare(a.dueDate, b.dueDate) || compare(a.id, b.id);
}

function normalizeCurrency(currency: string): string {
  return currency.trim().toUpperCase();
}

function clamp(value: number, low: number, high: number): number {
  return Math.min(Math.max(value, low), high);
}

export function allocatePayments(
  installments: readonly AllocatableInstallment[],
  payments: readonly AllocatablePayment[],
  eventCurrency: string,
): Allocation {
  const wantedCurrency = normalizeCurrency(eventCurrency);

  // Working state, in FIFO order. `toSorted` — the caller's arrays come from
  // memoized hooks; sorting in place would corrupt shared state.
  const ordered = installments.toSorted(compareInstallments);
  // A negative installment amount is nonsense the schedule editor cannot
  // produce; clamping it here is about the term, not about the money.
  const nominal = ordered.map((i) => Math.max(0, i.amountCents));
  const allocated = ordered.map(() => 0);
  /** How much of each installment's final allocation came from the pool. */
  const poolDelta = ordered.map(() => 0);
  const completedBy: (string | null)[] = ordered.map(() => null);
  const indexById = new Map(ordered.map((i, idx) => [i.id, idx]));
  /** What each payment still has to place, once its target has taken its share. */
  const leftoverOf = new Map<string, number>();

  const byPayment = new Map<string, PaymentAllocation>();
  const foreignCurrencyPayments: Allocation["foreignCurrencyPayments"] = [];

  // Split before allocating: a deleted payment, a payment in another currency or a
  // non-succeeded one is reported, but never touches a balance. Converting CAD into a
  // USD total without a rate would be a silent FX error that looks correct. A deleted
  // payment is checked first: it is gone whatever its status or currency was.
  const counted: AllocatablePayment[] = [];
  for (const p of payments.toSorted(comparePayments)) {
    const excluded: PaymentAllocation["excluded"] = isDeletedPayment(p)
      ? "deleted"
      : p.status !== COUNTED_STATUS
        ? "status"
        : normalizeCurrency(p.currency) !== wantedCurrency
          ? "currency"
          : null;

    byPayment.set(p.id, { paymentId: p.id, parts: [], unallocatedCents: 0, excluded });

    if (excluded === "currency") {
      foreignCurrencyPayments.push({
        paymentId: p.id,
        currency: normalizeCurrency(p.currency),
        amountCents: p.amountCents,
      });
    }
    if (excluded === null) counted.push(p);
  }

  // ── Step 1–2: what each installment's own targeted payments net out to ──
  //
  // Aggregates, not a walk. A refund and the payment it reverses must produce
  // the same answer whichever arrived first, so the net is computed before
  // anything is placed. A sequential walk cannot do this: a −$2,700 processed
  // before its +$2,700 would find nothing to take back.
  const targetedNet = ordered.map(() => 0);
  const targeting: AllocatablePayment[][] = ordered.map(() => []);
  const untargeted: AllocatablePayment[] = [];

  for (const p of counted) {
    const idx = p.installmentId ? indexById.get(p.installmentId) : undefined;
    if (idx === undefined) {
      untargeted.push(p);
      continue;
    }
    targetedNet[idx] += p.amountCents;
    targeting[idx].push(p);
  }

  // An installment shows what it actually holds: never below zero, never above
  // what it asks for. Everything outside that window is still money, and step 3
  // catches it — clamping decides placement, never existence.
  const targetedAllocated = ordered.map((_, idx) => clamp(targetedNet[idx], 0, nominal[idx]));
  for (const [idx, cents] of targetedAllocated.entries()) allocated[idx] = cents;

  // ── Step 3: the pool ──
  let pool = untargeted.reduce((sum, p) => sum + p.amountCents, 0);
  for (const [idx, net] of targetedNet.entries()) pool += net - targetedAllocated[idx];

  // ── Steps 4–5: fill forwards, un-fill backwards ──
  //
  // Mutually exclusive, so this stays one linear walk either way. Reverse
  // un-filling is the point: a refund reopens the newest obligation first,
  // which is how anyone reading the schedule understands it.
  const order = ordered.map((_, idx) => idx);
  const walk = pool > 0 ? order : order.toReversed();

  for (const idx of walk) {
    if (pool === 0) break;
    const capacity = pool > 0 ? nominal[idx] - allocated[idx] : -allocated[idx];
    const move = pool > 0 ? Math.min(pool, capacity) : Math.max(pool, capacity);
    allocated[idx] += move;
    poolDelta[idx] = move;
    pool -= move;
  }

  // ── Step 6: what the schedule could not absorb, signed ──
  const unallocatedCents = pool;

  // ── Per-payment breakdown (§3.4) ──
  //
  // The totals above are aggregates; this says which payment did what, and it
  // has to add up exactly: every payment's parts plus its leftover equal its
  // own amount. Attribution walks the canonical order and takes the difference
  // of two clamped running totals, so the shares telescope to the aggregate
  // instead of being re-derived from it.
  for (const [idx, payments] of targeting.entries()) {
    let running = 0;
    for (const p of payments) {
      const before = clamp(running, 0, nominal[idx]);
      running += p.amountCents;
      const share = clamp(running, 0, nominal[idx]) - before;
      credit(p, idx, share);
      leftoverOf.set(p.id, p.amountCents - share);
    }
  }
  for (const p of untargeted) leftoverOf.set(p.id, p.amountCents);

  distributePool();

  for (const p of counted) {
    byPayment.get(p.id)!.unallocatedCents = leftoverOf.get(p.id) ?? 0;
  }

  const resultInstallments: InstallmentAllocation[] = ordered.map((i, idx) => {
    const covered = allocated[idx];
    const status: InstallmentAllocation["status"] =
      covered >= nominal[idx] ? "paid" : covered > 0 ? "partial" : "unpaid";
    return {
      installmentId: i.id,
      dueDate: i.dueDate,
      amountCents: nominal[idx],
      allocatedCents: covered,
      status,
      // Only a real payment leaves a timestamp; a $0 installment is trivially
      // "paid" but nothing paid it, and an installment a refund reopened must
      // not keep the timestamp of the payment that used to close it.
      paidAt: status === "paid" ? completedBy[idx] : null,
    };
  });

  const allocatedCents = allocated.reduce((sum, cents) => sum + cents, 0);

  return {
    installments: resultInstallments,
    byPayment: [...byPayment.values()],
    // Step 7: the money question. Every counted cent, of either sign — not
    // "what landed somewhere", which would quietly drop a refund the schedule
    // had no room to express.
    totalReceivedCents: counted.reduce((sum, p) => sum + p.amountCents, 0),
    allocatedCents,
    unallocatedCents,
    foreignCurrencyPayments,
  };

  /** Record one signed movement of money against one installment. */
  function credit(payment: AllocatablePayment, idx: number, cents: number) {
    if (cents === 0) return;
    const detail = byPayment.get(payment.id)!;
    const existing = detail.parts.find((part) => part.installmentId === ordered[idx].id);
    if (existing) existing.cents += cents;
    else detail.parts.push({ installmentId: ordered[idx].id, cents });

    if (allocated[idx] >= nominal[idx] && nominal[idx] > 0) {
      completedBy[idx] = payment.paidAt ?? payment.createdAt;
    }
  }

  /**
   * Hands the pool's movements back to the payments that funded them.
   *
   * Contributions are consumed in canonical order against the same installment
   * deltas the walk above produced, so a refund that reopened an installment
   * names it with a negative figure rather than reading as "unapplied".
   */
  function distributePool() {
    const contributors = counted.filter((p) => (leftoverOf.get(p.id) ?? 0) !== 0);
    const pending = walk.filter((idx) => poolDelta[idx] !== 0);

    for (const idx of pending) {
      let outstanding = poolDelta[idx];
      for (const p of contributors) {
        if (outstanding === 0) break;
        const available = leftoverOf.get(p.id) ?? 0;
        // Only money moving the same way can fund this installment's movement.
        if (available === 0 || Math.sign(available) !== Math.sign(outstanding)) continue;
        const take =
          outstanding > 0 ? Math.min(outstanding, available) : Math.max(outstanding, available);
        credit(p, idx, take);
        leftoverOf.set(p.id, available - take);
        outstanding -= take;
      }
    }
  }
}
