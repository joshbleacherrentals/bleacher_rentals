import type { QuotesBookingsEvent, ReceivableBalances } from "../types";
import type { Currency } from "../types/quoteTypes";
import { allocatePayments, type AllocatablePayment } from "./allocatePayments";
import { computeAmountDue } from "./computeAmountDue";
import { resolvePaymentSchedule } from "./resolvePaymentSchedule";
import type { ReceivablesTab } from "./listTabs";

/**
 * Amount Due and Remaining Balance for a whole list of events at once — the
 * figures behind the AR and AR Deposits tabs of /quotes-bookings.
 *
 * Nothing here is a new formula. Each event goes through the same
 * `resolvePaymentSchedule` → `allocatePayments` → `computeAmountDue` chain as
 * `server/eventPaymentContext.ts` does for one event, so a row on the AR tab
 * cannot disagree with the event's Billing tab or its public Pay page:
 *
 *   Remaining Balance = total − payments received       (`remainingCents`)
 *   Amount Due        = the unpaid part of every installment due by today
 *                                                        (`overdueOwedCents`)
 *
 * The rows come straight from three PowerSync queries (see
 * `useAccountsReceivableData`) and are grouped by `event_uuid` here, so the
 * whole list costs three queries rather than three per event.
 */

/** One event's line items, summed in SQL: `Σ quantity × value_cents`, deleted rows left out. */
export type EventLineTotalRow = { event_uuid: string | null; line_total_cents: number };

export type ReceivableInstallmentRow = {
  id: string;
  event_uuid: string | null;
  due_date: string | null;
  percentage_bps: number | null;
};

export type ReceivablePaymentRow = {
  id: string;
  event_uuid: string | null;
  installment_id: string | null;
  amount_cents: number | null;
  currency: string | null;
  status: string | null;
  paid_at: string | null;
  created_at: string | null;
  deleted_at: string | null;
};

export type ReceivableSources = {
  lineTotals: readonly EventLineTotalRow[];
  installments: readonly ReceivableInstallmentRow[];
  payments: readonly ReceivablePaymentRow[];
};

/**
 * The event's total, computed the way the quote document and the server compute
 * it: line items after discounts, plus the tax the quote was saved with — or,
 * for rows saved without a tax amount, the tax its rate implies.
 */
export function eventTotalCents(
  lineTotalCents: number,
  event: Pick<QuotesBookingsEvent, "tax_amount_cents" | "tax_percent">,
): number {
  const taxPercent = event.tax_percent ?? 0;
  const taxCents = event.tax_amount_cents ?? Math.round(lineTotalCents * (taxPercent / 100));
  return lineTotalCents + taxCents;
}

function groupByEvent<T extends { event_uuid: string | null }>(rows: readonly T[]) {
  const byEvent = new Map<string, T[]>();
  for (const row of rows) {
    if (!row.event_uuid) continue;
    const group = byEvent.get(row.event_uuid);
    if (group) group.push(row);
    else byEvent.set(row.event_uuid, [row]);
  }
  return byEvent;
}

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

export function withReceivableBalances<T extends QuotesBookingsEvent>(
  events: readonly T[],
  sources: ReceivableSources,
  currencyOf: (event: T) => Currency,
  today: string, // YYYY-MM-DD
): (T & ReceivableBalances)[] {
  const lineTotalByEvent = new Map(
    sources.lineTotals.flatMap((row) =>
      row.event_uuid ? [[row.event_uuid, row.line_total_cents] as const] : [],
    ),
  );
  const installmentsByEvent = groupByEvent(sources.installments);
  const paymentsByEvent = groupByEvent(sources.payments);

  return events.map((event) => {
    // Clamped like the Billing tab: a quote whose discounts outweigh its items
    // owes nothing, and the schedule cannot be resolved against a negative total.
    const totalCents = Math.max(
      0,
      Math.round(eventTotalCents(lineTotalByEvent.get(event.id) ?? 0, event)),
    );
    const schedule = resolvePaymentSchedule(
      (installmentsByEvent.get(event.id) ?? []).map((i) => ({
        id: i.id,
        dueDate: i.due_date ?? "",
        percentageBps: i.percentage_bps ?? 0,
      })),
      totalCents,
    );
    const allocation = allocatePayments(
      schedule,
      (paymentsByEvent.get(event.id) ?? []).map(toAllocatablePayment),
      currencyOf(event),
    );
    const { remainingCents, overdueOwedCents } = computeAmountDue({
      allocation,
      totalCents,
      today,
    });
    return {
      ...event,
      amount_due_cents: overdueOwedCents,
      remaining_balance_cents: remainingCents,
    };
  });
}

/**
 * Whether an event belongs on an AR tab before any money is looked at. Only a
 * booked event is receivable — an unsigned quote's "due on signing" installment
 * is an offer, not a debt. AR is events that have started (today included);
 * AR Deposits is events that start after today.
 */
export function isOnReceivablesTab(
  event: QuotesBookingsEvent,
  tab: ReceivablesTab,
  today: string, // YYYY-MM-DD
): boolean {
  if (event.event_status?.toLowerCase() !== "booked") return false;
  // `event_start` is a DATE column; the slice only guards a timestamp-shaped value.
  const start = event.event_start?.slice(0, 10);
  if (!start) return false;
  return tab === "ar" ? start <= today : start > today;
}

/**
 * The rows of both AR tabs: booked events with something due now, split by
 * which side of today they start on. Both come out of one pass, so the
 * allocation runs once per change to the data — never per tab switch.
 */
export function receivablesByTab<T extends QuotesBookingsEvent>(
  events: readonly T[],
  sources: ReceivableSources,
  currencyOf: (event: T) => Currency,
  today: string, // YYYY-MM-DD
): Record<ReceivablesTab, (T & ReceivableBalances)[]> {
  // The cheap test first, so the allocation only runs for events that can show.
  const candidates = events.filter(
    (event) =>
      isOnReceivablesTab(event, "ar", today) || isOnReceivablesTab(event, "ar_deposits", today),
  );
  const due = withReceivableBalances(candidates, sources, currencyOf, today).filter(
    (row) => row.amount_due_cents > 0,
  );
  return {
    ar: due.filter((row) => isOnReceivablesTab(row, "ar", today)),
    ar_deposits: due.filter((row) => isOnReceivablesTab(row, "ar_deposits", today)),
  };
}
