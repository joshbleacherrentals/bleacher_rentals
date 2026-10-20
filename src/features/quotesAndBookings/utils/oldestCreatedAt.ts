/** The earliest `created_at` among the rows, in ms since 1970; null when none has a readable one. */
export function oldestCreatedAtMs(rows: { created_at: string | null }[]): number | null {
  let oldest: number | null = null;
  for (const row of rows) {
    const ms = row.created_at ? Date.parse(row.created_at) : NaN;
    if (!Number.isNaN(ms) && (oldest === null || ms < oldest)) oldest = ms;
  }
  return oldest;
}
