import type { Allocation } from "./allocatePayments";

/**
 * Where one payment's money actually sits now — resolved into something a
 * component can render without re-deriving it.
 *
 * The Billing tab renders this twice, at two densities: a compact summary in
 * the history table and the full breakdown in the payment detail dialog. They
 * must never disagree, so the reading lives here and both read it.
 *
 * Note this is the *current* placement, not the installment the payment was
 * originally aimed at — a schedule edit can leave that pointing at nothing.
 */

export type AppliedToPart = {
  installmentId: string;
  /** YYYY-MM-DD, or null when the schedule no longer holds that installment. */
  dueDate: string | null;
  cents: number;
};

export type AppliedToDescription =
  | { kind: "excluded"; reason: "currency" | "status" | "deleted" }
  | { kind: "unapplied" }
  | {
      kind: "applied";
      parts: AppliedToPart[];
      /** Money the schedule could not absorb. Signed, and often zero. */
      unallocatedCents: number;
      /**
       * Whether each part has to name its own amount. A single part covering
       * the whole payment does not — but split money, leftover money and any
       * refund does, or "Due Aug 31" would quietly stand for the wrong figure.
       */
      showAmounts: boolean;
    };

export function describeAppliedTo(
  payment: { id: string; amountCents: number },
  allocation: Allocation,
): AppliedToDescription {
  const detail = allocation.byPayment.find((p) => p.paymentId === payment.id);

  if (detail?.excluded) return { kind: "excluded", reason: detail.excluded };
  if (!detail || detail.parts.length === 0) return { kind: "unapplied" };

  const dueDates = new Map(allocation.installments.map((i) => [i.installmentId, i.dueDate]));

  return {
    kind: "applied",
    parts: detail.parts.map((part) => ({
      installmentId: part.installmentId,
      dueDate: dueDates.get(part.installmentId) ?? null,
      cents: part.cents,
    })),
    unallocatedCents: detail.unallocatedCents,
    showAmounts:
      detail.parts.length > 1 || detail.unallocatedCents !== 0 || payment.amountCents < 0,
  };
}

/**
 * Where a payment was originally aimed, when that is no longer where it sits.
 *
 * `installment_id` is the live link allocation reads and a schedule rebuild may
 * re-point it; `intended_installment_id` is the historical fact and is never
 * rewritten (migration 20260902120000). While they agree there is nothing to
 * say — which is almost always — so this returns null rather than making every
 * payment carry a redundant second line.
 *
 * Returns null, too, when the payment never named an installment: "originally
 * unapplied" is not a fact worth screen space.
 */
export type OriginalTarget = {
  /** YYYY-MM-DD, or null when that installment is gone from the schedule. */
  dueDate: string | null;
  stillOnSchedule: boolean;
};

export function describeOriginalTarget(
  payment: { installmentId: string | null; intendedInstallmentId: string | null },
  allocation: Allocation,
): OriginalTarget | null {
  const intended = payment.intendedInstallmentId;
  if (!intended || intended === payment.installmentId) return null;

  const match = allocation.installments.find((i) => i.installmentId === intended);
  return { dueDate: match?.dueDate ?? null, stillOnSchedule: !!match };
}
