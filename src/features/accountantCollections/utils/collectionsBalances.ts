import type { Currency } from "@/features/quotesAndBookings/types/quoteTypes";
import {
  allocatePayments,
  type Allocation,
  type AllocatablePayment,
} from "@/features/quotesAndBookings/utils/allocatePayments";
import {
  eventTotalCents,
  type ReceivableInstallmentRow,
  type ReceivablePaymentRow,
} from "@/features/quotesAndBookings/utils/accountsReceivable";
import { computeAmountDue } from "@/features/quotesAndBookings/utils/computeAmountDue";
import { resolvePaymentSchedule } from "@/features/quotesAndBookings/utils/resolvePaymentSchedule";
import { daysBetween } from "./calendarDays";

/**
 * The figures the Collections list and the invoice page show for one event
 * (docs/specs/accountant-collections-03-ts-twin-and-parity.md).
 *
 * This is the TypeScript twin of `ar_event_balances` (supabase/migrations/20261030130000_ar_amount_due.sql,
 * its no-schedule rule as of 20261111140000_ar_no_schedule_due_on_start_day.sql).
 * It adds no allocation rule of its own: it chains `resolvePaymentSchedule` → `allocatePayments` →
 * `computeAmountDue`, exactly as `withReceivableBalances` does, and `amountDueParity.test.ts` keeps it
 * equal to the SQL.
 *
 * The one rule that exists only here and in the SQL: an event with NO payment schedule owes its whole
 * remaining balance from the day `event_start` arrives (docs/specs/accountant-collections-24-no-schedule-due-on-start-day.md).
 * The AR tabs and the public Pay tab keep `computeAmountDue` as it is.
 */

export type CollectionsBalancesInput = {
  event: {
    event_start: string | null;
    /** Kept in the input, not read: an event with no schedule counts from `event_start`, always (spec 24 D1). */
    booked_at: string | null;
    tax_percent: number | null;
    tax_amount_cents: number | null;
  };
  /** `Σ quantity × value_cents` of the event's line items, deleted rows left out. */
  lineTotalCents: number;
  installments: ReceivableInstallmentRow[];
  payments: ReceivablePaymentRow[];
  currency: Currency;
  today: string; // YYYY-MM-DD
};

export type CollectionsBalances = {
  totalCents: number;
  receivedCents: number;
  remainingCents: number;
  amountDueCents: number;
  overdueSince: string | null; // YYYY-MM-DD
  daysOverdue: number | null;
  allocation: Allocation;
};

// The same mapping `withReceivableBalances` applies (accountsReceivable.ts keeps its copy private).
function toAllocatablePayment(p: ReceivablePaymentRow): AllocatablePayment {
  return {
    id: p.id,
    installmentId: p.installment_id,
    amountCents: p.amount_cents ?? 0,
    currency: p.currency ?? "",
    status: p.status ?? "",
    paidAt: p.paid_at,
    createdAt: p.created_at ?? "",
    deletedAt: p.deleted_at,
  };
}

/** `event_start` is a DATE column; the slice only guards a timestamp-shaped value. */
function datePart(value: string | null): string | null {
  return value ? value.slice(0, 10) : null;
}

export function computeCollectionsBalances(input: CollectionsBalancesInput): CollectionsBalances {
  const { event, today } = input;

  // Clamped like the Billing tab and `withReceivableBalances`.
  const totalCents = Math.max(0, Math.round(eventTotalCents(input.lineTotalCents, event)));
  const schedule = resolvePaymentSchedule(
    input.installments.map((i) => ({
      id: i.id,
      dueDate: i.due_date ?? "",
      percentageBps: i.percentage_bps ?? 0,
    })),
    totalCents,
  );
  const allocation = allocatePayments(
    schedule,
    input.payments.map(toAllocatablePayment),
    input.currency,
  );
  const due = computeAmountDue({ allocation, totalCents, today });
  const hasSchedule = input.installments.length > 0;

  // The day an event with no schedule falls due: the day it starts.
  const noScheduleDueDate = datePart(event.event_start);

  // With a schedule `computeAmountDue` is the rule. Without one it would owe the whole balance
  // from the first day, so the start-day rule replaces it; a missing start never compares true.
  const amountDueCents = hasSchedule
    ? due.overdueOwedCents
    : noScheduleDueDate !== null && noScheduleDueDate <= today
      ? due.remainingCents
      : 0;

  const overdueSince = amountDueCents > 0 ? findOverdueSince() : null;

  return {
    totalCents,
    receivedCents: allocation.totalReceivedCents,
    remainingCents: due.remainingCents,
    amountDueCents,
    overdueSince,
    daysOverdue: overdueSince === null ? null : daysBetween(overdueSince, today),
    allocation,
  };

  /** Where the days-overdue count starts, or null when it starts in the future. */
  function findOverdueSince(): string | null {
    if (hasSchedule) {
      // `allocation.installments` is in due-date order: the first match is the oldest.
      const oldest = allocation.installments.find((i) => i.status !== "paid" && i.dueDate <= today);
      return oldest?.dueDate ?? null;
    }
    // The start day, always: a booking day is not read (spec 24 D1).
    return noScheduleDueDate !== null && noScheduleDueDate <= today ? noScheduleDueDate : null;
  }
}
