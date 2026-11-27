import { DateTime } from "luxon";
import { daysBetween } from "@/features/accountantCollections/utils/calendarDays";
import type { Currency } from "@/features/quotesAndBookings/types/quoteTypes";
import {
  eventTotalCents,
  type EventLineTotalRow,
  type ReceivablePaymentRow,
} from "@/features/quotesAndBookings/utils/accountsReceivable";
import {
  allocatePayments,
  toEpochMs,
  type AllocatablePayment,
  type InstallmentAllocation,
} from "@/features/quotesAndBookings/utils/allocatePayments";
import { resolvePaymentSchedule } from "@/features/quotesAndBookings/utils/resolvePaymentSchedule";

/**
 * Which payments of a schedule were paid in full, and how many days after their due date.
 * docs/specs/accountant-kpi.md §1 (C2-C7) and §2.1.
 *
 * Nothing here is a new money rule. The schedule is resolved and the money is placed by the same
 * two functions the Billing tab and the receivables list use (`resolvePaymentSchedule`,
 * `allocatePayments`), so "paid in full" here is "Paid" there. The only thing worked out here is
 * the day (C6). `InstallmentAllocation.paidAt` is the date of the last payment the function
 * handled, not the latest date (a payment aimed at an installment is handled before one with no
 * installment), and `byPayment[].parts` cannot say when a refund and a new payment cancelled each
 * other out (an unaimed pair is credited to the first payment). So the day is found by replaying
 * the payments in the order they arrived and asking the same function, after each one, whether the
 * row is full: the day is the day of the payment after which it became full for the last time.
 *
 * Early payments are returned with negative days; leaving them out is the averaging step's job (C8,
 * `kpiForRange`). Pure: no clock, no I/O, no mutation of the caller's arrays.
 */

/** D17: a payment's day, and the day an event was first booked, are Toronto days. */
export const KPI_TIMEZONE = "America/Toronto";

export type KpiRole = "deposit" | "final";

/** One payment of a schedule that was paid in full, and how long it took. */
export type CollectedPayment = {
  eventId: string;
  /** The installment id, or `none:<event id>` for an event with no schedule (C3). */
  paymentId: string;
  role: KpiRole;
  dueDate: string; // YYYY-MM-DD
  collectedDay: string; // YYYY-MM-DD, Toronto (D17)
  days: number; // whole days; negative when paid early
};

export type KpiEventRow = {
  id: string;
  sales_office_uuid: string | null;
  tax_percent: number | null;
  tax_amount_cents: number | null;
  booked_at: string | null;
};

/**
 * The `ReceivableInstallmentRow` columns and `due_on_signing`, written out flat: `expect<T>()` in
 * `useKpiData` compares the query's result with this type exactly, and an intersection type does
 * not count as equal to the flat object the query returns.
 */
export type KpiInstallmentRow = {
  id: string;
  event_uuid: string | null;
  due_date: string | null;
  percentage_bps: number | null;
  due_on_signing: number | null;
};

export type FirstSignatureRow = { event_uuid: string | null; first_signed_at: string | null };

export type CollectionSources = {
  events: readonly KpiEventRow[];
  lineTotals: readonly EventLineTotalRow[];
  installments: readonly KpiInstallmentRow[];
  payments: readonly ReceivablePaymentRow[];
  firstSignatures: readonly FirstSignatureRow[];
};

/**
 * The Toronto calendar day (`YYYY-MM-DD`) of a timestamp, in either shape the app sees:
 * `2026-11-10T03:00:00.000Z` or the local database's `2026-11-10 03:00:00+00`. An empty or
 * unreadable value has no day.
 */
export function torontoDay(value: string | null): string | null {
  const ms = toEpochMs(value);
  if (ms === null) return null;
  return DateTime.fromMillis(ms, { zone: KPI_TIMEZONE }).toISODate();
}

type ScheduleRow = { id: string; dueDate: string; percentageBps: number };

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

function compare(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/**
 * C2: the schedule's own order: the due-on-signing row first, then by due date, then by id (the
 * order `usePaymentInstallments` draws it in). An empty date sorts before any date.
 */
function inScheduleOrder(rows: readonly KpiInstallmentRow[]): ScheduleRow[] {
  return rows
    .toSorted(
      (a, b) =>
        (b.due_on_signing ? 1 : 0) - (a.due_on_signing ? 1 : 0) ||
        compare(a.due_date ?? "", b.due_date ?? "") ||
        compare(a.id, b.id),
    )
    .map((r) => ({ id: r.id, dueDate: r.due_date ?? "", percentageBps: r.percentage_bps ?? 0 }));
}

/**
 * C3, D5, D9, D10: an event with no schedule is one row of 100% due the day the event was first
 * booked: its first signature's Toronto day, else the Toronto day of `booked_at`. With neither,
 * the event has no such day and is skipped (`null`).
 */
function wholeAmountRow(
  event: KpiEventRow,
  firstSignedAt: string | null | undefined,
): ScheduleRow | null {
  const dueDate = torontoDay(firstSignedAt ?? null) ?? torontoDay(event.booked_at);
  return dueDate ? { id: `none:${event.id}`, dueDate, percentageBps: 10000 } : null;
}

/** C4: two or more rows: first = Deposit, last = Final; one row: Final only (D5, D6). */
function rolesOf<T>(rows: readonly T[]): { role: KpiRole; row: T }[] {
  if (rows.length === 0) return [];
  if (rows.length === 1) return [{ role: "final", row: rows[0] }];
  return [
    { role: "deposit", row: rows[0] },
    { role: "final", row: rows[rows.length - 1] },
  ];
}

/** C5: collected means paid in full, and a row of 0 is "paid" but nothing paid it. */
function isFull(state: InstallmentAllocation | undefined): boolean {
  return !!state && state.status === "paid" && state.amountCents > 0;
}

/** When a payment counts as having arrived: `paid_at`, else `created_at`; `null` if neither reads. */
function arrivedAtMs(p: ReceivablePaymentRow): number | null {
  return toEpochMs(p.paid_at) ?? toEpochMs(p.created_at);
}

/** The order the payments arrived in. The same tie breaks as `allocatePayments`. */
function inArrivalOrder(payments: readonly ReceivablePaymentRow[]): ReceivablePaymentRow[] {
  const key = (p: ReceivablePaymentRow) => arrivedAtMs(p) ?? Number.POSITIVE_INFINITY;
  const created = (p: ReceivablePaymentRow) => toEpochMs(p.created_at) ?? Number.POSITIVE_INFINITY;
  return payments.toSorted(
    (a, b) =>
      (key(a) < key(b) ? -1 : key(a) > key(b) ? 1 : 0) ||
      (created(a) < created(b) ? -1 : created(a) > created(b) ? 1 : 0) ||
      compare(a.id, b.id),
  );
}

/**
 * C6: for each wanted row, the arrival time of the payment after which it became full for the
 * last time (`null` when that payment has no readable time). The payments are added one at a time
 * in arrival order and `allocatePayments` is asked after each, so a refund that reopens a row and
 * a payment that fills it again move the day, however the two were placed. Called only for an
 * event that has a collected row, and an event has a handful of payments.
 */
function whenRowsBecameFull(
  rowIds: readonly string[],
  schedule: readonly { id: string; dueDate: string; amountCents: number }[],
  payments: readonly ReceivablePaymentRow[],
  currency: Currency,
): Map<string, number | null> {
  const installments = schedule.map((r) => ({
    id: r.id,
    dueDate: r.dueDate,
    amountCents: r.amountCents,
  }));
  const ordered = inArrivalOrder(payments);
  const became = new Map<string, number | null>();
  const wasFull = new Map(rowIds.map((id) => [id, false]));
  for (let upTo = 1; upTo <= ordered.length; upTo++) {
    const allocation = allocatePayments(
      installments,
      ordered.slice(0, upTo).map(toAllocatablePayment),
      currency,
    );
    const stateById = new Map(allocation.installments.map((a) => [a.installmentId, a]));
    for (const id of rowIds) {
      const full = isFull(stateById.get(id));
      if (full && !wasFull.get(id)) became.set(id, arrivedAtMs(ordered[upTo - 1]));
      wasFull.set(id, full);
    }
  }
  return became;
}

export function collectedPayments(
  sources: CollectionSources,
  currencyOf: (event: KpiEventRow) => Currency,
): CollectedPayment[] {
  const lineTotalByEvent = new Map(
    sources.lineTotals.flatMap((row) =>
      row.event_uuid ? [[row.event_uuid, row.line_total_cents] as const] : [],
    ),
  );
  const installmentsByEvent = groupByEvent(sources.installments);
  const paymentsByEvent = groupByEvent(sources.payments);
  const firstSignedAtByEvent = new Map(
    sources.firstSignatures.flatMap((row) =>
      row.event_uuid ? [[row.event_uuid, row.first_signed_at] as const] : [],
    ),
  );

  const collected: CollectedPayment[] = [];

  for (const event of sources.events) {
    const stored = installmentsByEvent.get(event.id) ?? [];
    let rows: ScheduleRow[];
    if (stored.length > 0) {
      rows = inScheduleOrder(stored);
    } else {
      const whole = wholeAmountRow(event, firstSignedAtByEvent.get(event.id));
      if (!whole) continue;
      rows = [whole];
    }

    // The event total of the receivables list, clamped like the Billing tab.
    const totalCents = Math.max(
      0,
      Math.round(eventTotalCents(lineTotalByEvent.get(event.id) ?? 0, event)),
    );
    const schedule = resolvePaymentSchedule(rows, totalCents);

    const eventPayments = paymentsByEvent.get(event.id) ?? [];
    const allocation = allocatePayments(
      schedule.map((r) => ({ id: r.id, dueDate: r.dueDate, amountCents: r.amountCents })),
      eventPayments.map(toAllocatablePayment),
      currencyOf(event),
    );
    const allocationById = new Map(allocation.installments.map((a) => [a.installmentId, a]));

    const roles = rolesOf(schedule);
    const wanted = roles
      .map(({ row }) => row)
      .filter((row) => isFull(allocationById.get(row.id)) && row.dueDate !== "");
    // Only an event with a collected row needs its payments replayed.
    const fullAtMs =
      wanted.length > 0
        ? whenRowsBecameFull(
            wanted.map((row) => row.id),
            schedule,
            eventPayments,
            currencyOf(event),
          )
        : new Map<string, number | null>();

    for (const { role, row } of roles) {
      // C5: a row of 0 is "paid" but nothing paid it.
      if (!isFull(allocationById.get(row.id))) continue;
      // C7: a row with no due date has nothing to count days from.
      if (!row.dueDate) continue;

      // C6: the day of the payment after which the row became full for the last time.
      const latestMs = fullAtMs.get(row.id) ?? null;
      if (latestMs === null) continue;

      const collectedDay = DateTime.fromMillis(latestMs, { zone: KPI_TIMEZONE }).toISODate();
      if (!collectedDay) continue;
      const days = daysBetween(row.dueDate, collectedDay);
      if (!Number.isFinite(days)) continue;

      collected.push({
        eventId: event.id,
        paymentId: row.id,
        role,
        dueDate: row.dueDate,
        collectedDay,
        days,
      });
    }
  }

  return collected;
}
