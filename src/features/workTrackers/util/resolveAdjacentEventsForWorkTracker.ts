import { DateTime } from "luxon";
import { db } from "@/components/providers/SystemProvider";
import { expect, typedGetAll } from "@/lib/powersync/typedQuery";
import { localDayEndInstant, localDayStartInstant } from "@/features/alerts/util/localDayInstant";

export type AdjacentEvent = {
  id: string;
  eventName: string | null;
  eventStart: string;
  eventEnd: string | null;
};

export type AdjacentEventCandidate = {
  id: string;
  eventName: string | null;
  eventStart: string | null;
  eventEnd: string | null;
  booked: boolean;
};

const pickNearest = (
  rows: AdjacentEventCandidate[],
  targetDate: string,
  direction: "past" | "future",
): AdjacentEvent | null => {
  const inRange = (date: string) =>
    direction === "past" ? date <= targetDate : date >= targetDate;
  const isNearer = (candidate: string, best: string) =>
    direction === "past" ? candidate > best : candidate < best;

  let bestDate: string | null = null;
  let best: AdjacentEvent | null = null;

  for (const row of rows) {
    if (!row.booked || !row.eventStart) continue;

    // Parsed as UTC — same reasoning as resolveEventInstructionsForWorkTracker:
    // Events.event_start carries no meaningful time-of-day, so a local-zone
    // parse could shift the day.
    const date = DateTime.fromISO(row.eventStart, { zone: "utc" }).toISODate();
    if (!date || !inRange(date)) continue;

    if (!bestDate || isNearer(date, bestDate)) {
      bestDate = date;
      best = {
        id: row.id,
        eventName: row.eventName,
        eventStart: row.eventStart,
        eventEnd: row.eventEnd,
      };
    }
  }

  return best;
};

/**
 * Pure — the unit-tested core. The nearest booked event on this bleacher on
 * or before `targetDate` (previous) and on or after it (next). Purely
 * informational: never written back to the work tracker.
 */
export function resolveAdjacentEvents(
  rows: AdjacentEventCandidate[],
  targetDate: string,
): { previous: AdjacentEvent | null; next: AdjacentEvent | null } {
  return {
    previous: pickNearest(rows, targetDate, "past"),
    next: pickNearest(rows, targetDate, "future"),
  };
}

// ─── PowerSync adapter ───────────────────────────────────────────────────────

type NeighbourRow = {
  id: string;
  eventName: string | null;
  eventStart: string | null;
  eventEnd: string | null;
  eventStatus: string | null;
};

async function fetchNearest(
  bleacherUuid: string,
  targetDate: string,
  direction: "past" | "future",
): Promise<NeighbourRow[]> {
  const lookingBack = direction === "past";

  let query = db
    .selectFrom("BleacherEvents as be")
    .innerJoin("Events as e", "e.id", "be.event_uuid")
    .select([
      "e.id as id",
      "e.event_name as eventName",
      "e.event_start as eventStart",
      "e.event_end as eventEnd",
      "e.event_status as eventStatus",
    ])
    .where("be.bleacher_uuid", "=", bleacherUuid)
    .where("e.deleted", "=", 0)
    .where("e.event_status", "=", "booked");

  query = lookingBack
    ? query.where("e.event_start", "<=", localDayEndInstant(targetDate))
    : query.where("e.event_start", ">=", localDayStartInstant(targetDate));

  return typedGetAll(
    query
      .orderBy("e.event_start", lookingBack ? "desc" : "asc")
      .limit(1)
      .compile(),
    expect<NeighbourRow>(),
  );
}

const toCandidate = (row: NeighbourRow): AdjacentEventCandidate => ({
  id: row.id,
  eventName: row.eventName,
  eventStart: row.eventStart,
  eventEnd: row.eventEnd,
  booked: row.eventStatus === "booked",
});

/**
 * A work tracker lives on one bleacher and one date. This looks up the
 * nearest booked, non-deleted event before and after it on that bleacher —
 * for display only (the "Previous Event" / "Next Event" card), computed
 * fresh on demand and never persisted.
 *
 * Two separate SQL date-bound + `LIMIT 1` queries (one per direction)
 * instead of fetching the bleacher's whole history — same discipline as the
 * address query. Each result is fed through the shared `resolveAdjacentEvents`
 * pure resolver, using only the half of its output that query's own bound
 * makes meaningful (the past-bounded rows' `.previous`, the future-bounded
 * rows' `.next`), so the pure resolver's own filtering still applies exactly
 * as it does in its unit tests.
 */
export async function getAdjacentEventsForWorkTracker(params: {
  bleacherUuid: string;
  targetDate: string;
}): Promise<{ previous: AdjacentEvent | null; next: AdjacentEvent | null }> {
  const { bleacherUuid, targetDate } = params;

  const [pastRows, futureRows] = await Promise.all([
    fetchNearest(bleacherUuid, targetDate, "past"),
    fetchNearest(bleacherUuid, targetDate, "future"),
  ]);

  return {
    previous: resolveAdjacentEvents(pastRows.map(toCandidate), targetDate).previous,
    next: resolveAdjacentEvents(futureRows.map(toCandidate), targetDate).next,
  };
}
