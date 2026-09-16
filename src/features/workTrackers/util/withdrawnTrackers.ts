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
  id: string;
  driver_uuid: string | null;
  /** The tracker's own work date (`WorkTrackers.date`), not when it was withdrawn. */
  date: string | null;
  status: string | null;
  bleacher_uuid: string | null;
  /** What really left the yard; NULL until the driver confirms. See bleacherSwap.ts. */
  actual_bleacher_uuid: string | null;
};

/**
 * Whether a tracker belongs in the account manager's count: the driver walked
 * away from it, or the driver took a different bleacher than the one assigned.
 *
 * One predicate for both, so a tracker that is abandoned *and* swapped is still
 * one tracker to look at, counted once. A swap drops out as soon as the manager
 * makes the two bleachers match. An unconfirmed tracker (actual NULL) is not a
 * swap, and a cancelled one has nothing left to reconcile.
 */
export function needsAttention(row: WithdrawnTrackerRow): boolean {
  return attentionReason(row) != null;
}

export type AttentionReason = WithdrawnStatus | "bleacher_swap";

/**
 * Why a tracker needs attention, or null when it does not. A withdrawal wins
 * over a swap: once the work is handed back, which bleacher went out is moot.
 */
export function attentionReason(row: WithdrawnTrackerRow): AttentionReason | null {
  if (isWithdrawnStatus(row.status)) return row.status;
  if (row.status === "cancelled") return null;
  if (row.actual_bleacher_uuid != null && row.actual_bleacher_uuid !== row.bleacher_uuid) {
    return "bleacher_swap";
  }
  return null;
}

/**
 * The reason per tracker id, for marking the individual rows on a driver's week
 * — built from the same rows as the counts, so a driver showing 2 has exactly
 * two marked trackers. A tracker needing nothing is absent.
 */
export function attentionByTracker(
  rows: readonly WithdrawnTrackerRow[],
): Map<string, AttentionReason> {
  const reasons = new Map<string, AttentionReason>();
  for (const row of rows) {
    const reason = attentionReason(row);
    if (reason) reasons.set(row.id, reason);
  }
  return reasons;
}

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
  return rows.reduce((total, row) => (needsAttention(row) ? total + 1 : total), 0);
}

/**
 * Withdrawals per week, keyed by Monday. A week with none is absent from the
 * map rather than present as 0 — the caller renders a badge for what is there
 * and nothing for what is not, so "no key" and "no badge" are the same thing.
 */
export function countWithdrawnByWeek(rows: readonly WithdrawnTrackerRow[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const row of rows) {
    if (!needsAttention(row)) continue;
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
    if (!needsAttention(row)) continue;
    if (!row.driver_uuid) continue;
    if (weekStart && weekStartOf(row.date) !== weekStart) continue;
    counts.set(row.driver_uuid, (counts.get(row.driver_uuid) ?? 0) + 1);
  }
  return counts;
}
