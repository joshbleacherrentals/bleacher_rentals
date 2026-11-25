import type { CurrencyTotals, RepairListRow, RepairTab } from "./repairRows";

/**
 * The Open / Completed split and the totals of the strip.
 * docs/specs/repairs-03-list-query.md §2.9 (D12, D13).
 */

/**
 * Completed repairs on Completed and every other status on Open; a status the code does not know
 * counts as open. The order of the rows is kept.
 */
export function splitByTab(rows: readonly RepairListRow[]): Record<RepairTab, RepairListRow[]> {
  const open: RepairListRow[] = [];
  const completed: RepairListRow[] = [];
  for (const row of rows) (row.status === "completed" ? completed : open).push(row);
  return { open, completed };
}

/**
 * The sum of Total in cents per currency. Both currencies are always present, a missing Total counts
 * as 0 and nothing is converted: money in two currencies does not add up.
 */
export function totalsByCurrency(rows: readonly RepairListRow[]): CurrencyTotals {
  const totals: CurrencyTotals = { USD: 0, CAD: 0 };
  for (const row of rows) totals[row.currency] += row.totalCents ?? 0;
  return totals;
}
