import { DateTime } from "luxon";
import type { Database } from "../../../../database.types";

type WorkTrackerStatus = Database["public"]["Enums"]["worktracker_status"];

/**
 * The two ways a *driver* steps away from work, as opposed to `cancelled`,
 * which is the office calling a job off. Kept together in one list because
 * every number the account manager is shown — the sidebar total, the per-week
 * count, the per-driver count — treats them as the same event: work that was
 * handed back and now needs re-covering.
 *
 *   declined  — offered and never taken on
 *   abandoned — taken on and handed back, started or not
 */
export const WITHDRAWN_STATUSES = [
  "declined",
  "abandoned",
] as const satisfies readonly WorkTrackerStatus[];

export type WithdrawnStatus = (typeof WITHDRAWN_STATUSES)[number];

export function isWithdrawnStatus(status: string | null | undefined): status is WithdrawnStatus {
  return WITHDRAWN_STATUSES.includes(status as WithdrawnStatus);
}

/**
 * The three shapes below are all computed from the same rows, so the numbers
 * can never disagree with each other: a tracker deleted in Supabase drops out
 * of the local table, out of these rows, and out of all three counts at once.
 */
export type WithdrawnTrackerRow = {
  driver_uuid: string | null;
  /** The tracker's own work date (`WorkTrackers.date`), not when it was withdrawn. */
  date: string | null;
  status: string | null;
};

/**
 * Monday of the week the date falls in — the same bucketing the work tracker
 * weeks already use (`WorkTrackerGroups.week_start`), so a week's badge and the
 * page it opens count the same trackers. Null for a tracker with no usable date.
 */
export function weekStartOf(date: string | null | undefined): string | null {
  if (!date) return null;
  const parsed = DateTime.fromISO(date);
  if (!parsed.isValid) return null;
  return parsed.startOf("week").toISODate();
}

/** Total withdrawals in the given rows, for all time. */
export function countWithdrawn(rows: readonly WithdrawnTrackerRow[]): number {
  return rows.reduce((total, row) => (isWithdrawnStatus(row.status) ? total + 1 : total), 0);
}

/**
 * Withdrawals per week, keyed by Monday. A week with none is absent from the
 * map rather than present as 0 — the caller renders a badge for what is there
 * and nothing for what is not, so "no key" and "no badge" are the same thing.
 */
export function countWithdrawnByWeek(rows: readonly WithdrawnTrackerRow[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const row of rows) {
    if (!isWithdrawnStatus(row.status)) continue;
    const weekStart = weekStartOf(row.date);
    if (!weekStart) continue;
    counts.set(weekStart, (counts.get(weekStart) ?? 0) + 1);
  }
  return counts;
}

/**
 * Withdrawals per driver. Pass `weekStart` (a Monday) to count only that week —
 * what the week's driver list needs; omit it to count a driver's whole history.
 */
export function countWithdrawnByDriver(
  rows: readonly WithdrawnTrackerRow[],
  weekStart?: string | null,
): Map<string, number> {
  const counts = new Map<string, number>();
  for (const row of rows) {
    if (!isWithdrawnStatus(row.status)) continue;
    if (!row.driver_uuid) continue;
    if (weekStart && weekStartOf(row.date) !== weekStart) continue;
    counts.set(row.driver_uuid, (counts.get(row.driver_uuid) ?? 0) + 1);
  }
  return counts;
}
