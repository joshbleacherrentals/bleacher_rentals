import { buildCsv, csvTextField, escapeCsvField } from "@/lib/csv";
import { formatMoney } from "@/features/quotesAndBookings/utils/formatMoney";
import type { CollectionsRow } from "./collectionsRows";
import { followUpLabel, overdueLabel } from "./relativeDays";

/**
 * The Collections tab as a CSV file: the table's columns, one row per task, in the order the list is
 * in. The follow-up and overdue cells are worded against today exactly as the table words them.
 */

/** The table's columns, without the arrow column that opens the invoice. */
export const COLLECTIONS_CSV_HEADERS = [
  "Name",
  "Next Follow Up",
  "Payment Overdue",
  "Task Notes",
  "Amount Overdue",
] as const;

/**
 * Whether Export to CSV has nothing to export yet. `error` is tested for being truthy, never against
 * `undefined`: PowerSync reports "no error" as `null` once a query has loaded, and `undefined` only
 * before that, so a strict check keeps the button disabled for good.
 */
export function isCollectionsExportDisabled(
  isLoading: boolean,
  error: Error | null | undefined,
  rowCount: number,
): boolean {
  return isLoading || !!error || rowCount === 0;
}

/** `today` is `YYYY-MM-DD`, the date in the timezone store (what `useCollectionsData` returns). */
export function buildCollectionsCsv(rows: readonly CollectionsRow[], today: string): string {
  return buildCsv(
    COLLECTIONS_CSV_HEADERS,
    rows.map((row) => [
      csvTextField(row.eventName),
      escapeCsvField(followUpLabel(row.dueDate, today)),
      // The table prints a dash for "nothing is overdue"; the file leaves the cell empty.
      escapeCsvField(row.daysOverdue === null ? "" : overdueLabel(row.daysOverdue)),
      csvTextField(row.note),
      escapeCsvField(formatMoney(row.amountDueCents, row.currency)),
    ]),
  );
}
