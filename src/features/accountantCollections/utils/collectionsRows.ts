import type { Currency } from "@/features/quotesAndBookings/types/quoteTypes";
import type {
  EventLineTotalRow,
  ReceivableInstallmentRow,
  ReceivablePaymentRow,
} from "@/features/quotesAndBookings/utils/accountsReceivable";
import { computeCollectionsBalances } from "./collectionsBalances";

/**
 * The rows of the Collections list: one per event, from its open task and the twin's figures.
 * docs/specs/accountant-collections-07-collections-list.md §3.
 *
 * Amount Overdue and Payment Overdue come from `computeCollectionsBalances` and nowhere else.
 */

/** An open task joined to its event: one row of the task query in `useCollectionsData`. */
export type CollectionsTaskSource = {
  task_id: string;
  created_at: string | null;
  due_date: string | null;
  note: string | null;
  event_uuid: string;
  event_name: string | null;
  event_start: string | null;
  booked_at: string | null;
  tax_percent: number | null;
  tax_amount_cents: number | null;
  sales_office_uuid: string | null;
};

export type CollectionsSources = {
  tasks: readonly CollectionsTaskSource[];
  lineTotals: readonly EventLineTotalRow[];
  installments: readonly ReceivableInstallmentRow[];
  payments: readonly ReceivablePaymentRow[];
};

export type CollectionsRow = {
  eventId: string;
  eventName: string;
  taskId: string;
  /** `YYYY-MM-DD`. */
  dueDate: string;
  note: string;
  amountDueCents: number;
  currency: Currency;
  /** Null when nothing is overdue (an Amount Due of 0). */
  daysOverdue: number | null;
};

const NO_NAME = "—";

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

/** Of two open tasks of one event (the database allows only one), the one created last. */
function isNewer(a: CollectionsTaskSource, b: CollectionsTaskSource): boolean {
  const byCreated = (a.created_at ?? "").localeCompare(b.created_at ?? "");
  return byCreated !== 0 ? byCreated > 0 : a.task_id > b.task_id;
}

export function buildCollectionsRows(
  sources: CollectionsSources,
  today: string,
  currencyOf: (task: CollectionsTaskSource) => Currency,
): CollectionsRow[] {
  const lineTotalByEvent = new Map<string, number>();
  for (const row of sources.lineTotals) {
    if (row.event_uuid) lineTotalByEvent.set(row.event_uuid, row.line_total_cents);
  }
  const installmentsByEvent = groupByEvent(sources.installments);
  const paymentsByEvent = groupByEvent(sources.payments);

  const taskByEvent = new Map<string, CollectionsTaskSource>();
  for (const task of sources.tasks) {
    const current = taskByEvent.get(task.event_uuid);
    if (!current || isNewer(task, current)) taskByEvent.set(task.event_uuid, task);
  }

  return [...taskByEvent.values()].map((task) => {
    const currency = currencyOf(task);
    const balances = computeCollectionsBalances({
      event: {
        event_start: task.event_start,
        booked_at: task.booked_at,
        tax_percent: task.tax_percent,
        tax_amount_cents: task.tax_amount_cents,
      },
      lineTotalCents: lineTotalByEvent.get(task.event_uuid) ?? 0,
      installments: installmentsByEvent.get(task.event_uuid) ?? [],
      payments: paymentsByEvent.get(task.event_uuid) ?? [],
      currency,
      today,
    });

    return {
      eventId: task.event_uuid,
      eventName: task.event_name?.trim() || NO_NAME,
      taskId: task.task_id,
      dueDate: (task.due_date ?? "").slice(0, 10),
      note: task.note ?? "",
      amountDueCents: balances.amountDueCents,
      currency,
      daysOverdue: balances.daysOverdue,
    };
  });
}
