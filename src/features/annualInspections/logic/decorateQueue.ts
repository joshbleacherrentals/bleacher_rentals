import type { AnnualInspectionQueueRow } from "../db/annualInspections";
import { inspectionStatus, type InspectionStatus } from "./inspectionStatus";
import { isNewSinceLastSeen } from "./isNewSinceLastSeen";

export type DecoratedQueueRow = AnnualInspectionQueueRow & {
  status: InspectionStatus;
  /** Crossed a threshold since this reader last opened the page. */
  isNew: boolean;
};

/**
 * Turn the stored due dates into what the reader sees today.
 *
 * Order is left exactly as the query returned it — sorting a list the SQL
 * already sorted is how two orderings start disagreeing.
 */
export function decorateQueue(
  rows: AnnualInspectionQueueRow[],
  today: string,
  lastSeenAt: string | null,
): DecoratedQueueRow[] {
  return rows.map((row) => ({
    ...row,
    status: inspectionStatus(row.nextDueOn, today),
    isNew: isNewSinceLastSeen(row.nextDueOn, today, lastSeenAt),
  }));
}

export function countUnseen(rows: DecoratedQueueRow[]): number {
  let count = 0;
  for (const row of rows) if (row.isNew) count++;
  return count;
}
