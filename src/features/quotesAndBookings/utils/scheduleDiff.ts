import { DateTime } from "luxon";
import { PaymentInstallment, Currency } from "../types/quoteTypes";
import { formatMoney } from "./formatMoney";

/**
 * Saving a quote used to delete every installment of the event and re-insert
 * the set, even when one date had changed. The rows came back with the same
 * ids, but the delete still fired — breaking the payments that point at them.
 *
 * These two functions decide what a save should actually do, and when it must
 * refuse. See docs/specs/payment-accounting-truth.md §4.
 */

export type ExistingInstallment = {
  id: string;
  dueDate: string;
  percentageBps: number;
  currency: string | null;
};

export type ReferencingPayment = {
  installmentId: string | null;
  amountCents: number;
  status: string;
};

/**
 * A save that would delete an installment holding money. Named so callers can
 * tell it apart from an ordinary sync failure and show the message to the user
 * instead of swallowing it into the console.
 */
export class ScheduleBlockedError extends Error {
  readonly name = "ScheduleBlockedError";
}

export type ScheduleDiff = {
  toInsert: PaymentInstallment[];
  toUpdate: PaymentInstallment[];
  toDelete: string[];
};

export function diffSchedule(
  existing: readonly ExistingInstallment[],
  next: readonly PaymentInstallment[],
  currency: Currency,
): ScheduleDiff {
  const existingById = new Map(existing.map((row) => [row.id, row]));
  const nextIds = new Set(next.map((row) => row.id));

  const toInsert: PaymentInstallment[] = [];
  const toUpdate: PaymentInstallment[] = [];

  for (const row of next) {
    const before = existingById.get(row.id);
    if (!before) {
      toInsert.push(row);
    } else if (
      before.dueDate !== row.dueDate ||
      before.percentageBps !== row.percentageBps ||
      before.currency !== currency
    ) {
      toUpdate.push(row);
    }
    // Unchanged rows are left completely alone — no write, no cache reset.
  }

  return {
    toInsert,
    toUpdate,
    toDelete: existing.filter((row) => !nextIds.has(row.id)).map((row) => row.id),
  };
}

function formatDueDate(dueDate: string): string {
  const dt = DateTime.fromISO(dueDate);
  return dt.isValid ? dt.toFormat("MMM d, yyyy") : dueDate;
}

/**
 * Why a set of removals must be refused, or null if they are all fine.
 *
 * Money that arrived against a scheduled payment is an accounting fact. Letting
 * a schedule edit delete that installment would silently re-point the payment
 * at a different one months later, so the save is blocked here — before the
 * write. The database would refuse it anyway, but only on upload, where the
 * rejection stalls the PowerSync queue instead of reaching anyone.
 */
export function describeBlockedRemovals(
  toDelete: readonly string[],
  existing: readonly ExistingInstallment[],
  payments: readonly ReferencingPayment[],
  currency: Currency,
): string | null {
  if (toDelete.length === 0) return null;

  const removing = new Set(toDelete);
  const paidCentsById = new Map<string, number>();

  for (const payment of payments) {
    if (payment.status !== "succeeded") continue;
    if (!payment.installmentId || !removing.has(payment.installmentId)) continue;
    paidCentsById.set(
      payment.installmentId,
      (paidCentsById.get(payment.installmentId) ?? 0) + payment.amountCents,
    );
  }

  const reasons = existing
    .filter((row) => removing.has(row.id))
    .flatMap((row) => {
      const cents = paidCentsById.get(row.id);
      if (cents) {
        return [`${formatDueDate(row.dueDate)} (${formatMoney(cents, currency)} in payments)`];
      }
      return [];
    });

  if (reasons.length === 0) return null;

  const subject = reasons.length === 1 ? "This installment" : "These installments";
  const remedy =
    reasons.length === 1
      ? "Refund or reassign the payment first."
      : "Refund or reassign the payments first.";

  return `${subject} cannot be removed: ${reasons.join("; ")}. ${remedy}`;
}
