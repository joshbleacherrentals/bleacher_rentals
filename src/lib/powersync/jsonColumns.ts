/**
 * Columns that are jsonb in Supabase but text in the app's local database (PowerSync has no JSON
 * type), and that the app itself writes. The app stores them as JSON text; before upload they are
 * parsed back into values, so Postgres stores real JSON rather than a quoted string. A column the app
 * writes as JSON text into a jsonb column must be listed here, or it lands double-encoded.
 */
export const JSON_COLUMNS: Record<string, readonly string[]> = {
  AutoWorkTrackerRuns: ["settings", "result"],
  AutoWorkTrackerRunTrips: ["snapshot"],
};

/** An upload's data with the table's JSON columns parsed. Text that is not valid JSON is left as is. */
export function withJsonColumns<T extends Record<string, unknown> | undefined>(
  table: string,
  data: T,
): T {
  const columns = JSON_COLUMNS[table];
  if (!columns || !data) return data;
  const out: Record<string, unknown> = { ...data };
  for (const c of columns) {
    const v = out[c];
    if (typeof v !== "string") continue;
    try {
      out[c] = JSON.parse(v);
    } catch {
      // Not JSON: send it as it is and let Postgres refuse it, so the problem is visible.
    }
  }
  return out as T;
}
