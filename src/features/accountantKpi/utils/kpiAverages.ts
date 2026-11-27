import type { AuditRange } from "@/features/accountantAudit/utils/auditRange";
import type { CollectedPayment, KpiRole } from "./collectionDays";

/**
 * The number on one card: the payments of one role collected inside the range, averaged.
 * docs/specs/accountant-kpi.md §1 (C8-C11) and §2.1 (D2, D3, D8, D11).
 */
export type KpiResult = {
  /** Whole days, rounded up (D11); `null` when there is nothing to average. */
  days: number | null;
  /** How many payments the average is made of (D8). */
  count: number;
};

/**
 * C8: a payment collected before its due date (negative days) is left out; one collected on the
 * due day (0) is in. C9: `from <= collectedDay <= to`, a `null` end is no limit, and the dates
 * are `YYYY-MM-DD` text, so a text comparison is a date comparison. C10: the average is
 * `ceil(sum / count)`, worked out with whole numbers so an exact division (27 / 3) is not pushed
 * up by floating-point noise. The sum is never negative, so adding `count - 1` before the
 * integer division is the ceiling.
 */
export function kpiForRange(
  rows: readonly CollectedPayment[],
  role: KpiRole,
  range: AuditRange,
): KpiResult {
  let sum = 0;
  let count = 0;
  for (const row of rows) {
    if (row.role !== role) continue;
    if (row.days < 0) continue;
    if (range.from !== null && row.collectedDay < range.from) continue;
    if (range.to !== null && row.collectedDay > range.to) continue;
    sum += row.days;
    count += 1;
  }
  if (count === 0) return { days: null, count: 0 };
  return { days: Math.floor((sum + count - 1) / count), count };
}
