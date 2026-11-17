import type { QueryResult, RawQueryResult } from "../types";

/**
 * Cuts a result to a serialized size, dropping rows from the end (docs/specs/analytics-mcp.md §9).
 * The size is counted a little high on purpose (one comma too many), so the real JSON always fits.
 */
export function capResult(raw: RawQueryResult, maxChars: number): QueryResult {
  const kept: Record<string, unknown>[] = [];
  let size = 2; // the brackets
  let truncated = raw.truncated;

  for (const row of raw.rows) {
    const rowSize = JSON.stringify(row).length + 1;
    if (size + rowSize > maxChars) {
      truncated = true;
      break;
    }
    size += rowSize;
    kept.push(row);
  }

  return { columns: raw.columns, rows: kept, rowCount: kept.length, truncated };
}
