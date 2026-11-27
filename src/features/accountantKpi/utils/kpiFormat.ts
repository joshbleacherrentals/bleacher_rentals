/**
 * How a card writes its numbers: `10 days`, `1 day`, `3 payments`, `1 payment`, and a dash where
 * there is nothing to average. docs/specs/accountant-kpi.md §1 (C11), §2.4.
 */
export const KPI_DASH = "–";

/** `null` (nothing to average) is a dash; 0 is a value and is written out. */
export function formatDays(days: number | null): string {
  if (days === null) return KPI_DASH;
  return `${days} ${days === 1 ? "day" : "days"}`;
}

export function formatPaymentCount(count: number): string {
  return `${count} ${count === 1 ? "payment" : "payments"}`;
}
