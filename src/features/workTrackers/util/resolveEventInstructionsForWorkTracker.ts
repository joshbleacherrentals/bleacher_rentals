import { DateTime } from "luxon";
import { db } from "@/components/providers/SystemProvider";
import { expect, typedGetAll } from "@/lib/powersync/typedQuery";
import { localDayEndInstant, localDayStartInstant } from "@/features/alerts/util/localDayInstant";

export type InstructionsDirection = "past" | "future";

/**
 * Row shape fed to the pure resolver. Kept dumb so the nearest-neighbour
 * picking rule stays unit-testable without a database — deleted rows are
 * excluded by the query, same convention as `resolvePocContact`.
 */
export type EventInstructionsRow = {
  /** ISO timestamp (Events.event_start). */
  eventStart: string | null;
  booked: boolean;
  pickupInstructions: string | null;
  dropoffInstructions: string | null;
};

const isBlank = (value: string | null): boolean => (value ?? "").trim() === "";

/**
 * Pick the nearest booked neighbouring event's OWN instructions field in
 * `direction`. A trip's Pickup Instructions describe retrieving bleachers
 * from wherever they last were — the previous event's own pickup_instructions
 * (how THAT event wants them picked up after it ended). Dropoff Instructions
 * describe delivering them to where they're going next — the next event's
 * own dropoff_instructions (how it wants them dropped off before it starts).
 *
 * A neighbour with blank text for the relevant field does not win and does
 * not block a further, qualifying neighbour from being found — it simply
 * doesn't compete.
 */
export function resolveEventInstructions(
  rows: EventInstructionsRow[],
  targetDate: string,
  direction: InstructionsDirection,
): string | null {
  const inRange = (date: string) =>
    direction === "past" ? date <= targetDate : date >= targetDate;
  const isNearer = (candidate: string, best: string) =>
    direction === "past" ? candidate > best : candidate < best;

  let bestDate: string | null = null;
  let bestText: string | null = null;

  for (const row of rows) {
    if (!row.booked || !row.eventStart) continue;

    // Parsed as UTC, never in the viewer's zone — same reasoning as
    // resolvePocContact's toEventCandidate: Events.event_start carries no
    // meaningful time-of-day, so a local-zone parse could shift the day.
    const date = DateTime.fromISO(row.eventStart, { zone: "utc" }).toISODate();
    if (!date || !inRange(date)) continue;

    const text = direction === "past" ? row.pickupInstructions : row.dropoffInstructions;
    if (isBlank(text)) continue;

    if (!bestDate || isNearer(date, bestDate)) {
      bestDate = date;
      bestText = text!.trim();
    }
  }

  return bestText;
}

// ─── PowerSync adapter ───────────────────────────────────────────────────────

export type InstructionsResult = { kind: "ok"; text: string } | { kind: "not-found" };

type NeighbourRow = {
  eventStart: string | null;
  eventStatus: string | null;
  pickupInstructions: string | null;
  dropoffInstructions: string | null;
};

/**
 * A work tracker lives on one bleacher and one date. Find the nearest
 * booked, non-deleted event on that same bleacher and read its own
 * pickup/dropoff instructions (per direction) — mirrors the Events-only
 * source branch of `getExpectedAddressFullForWorkTracker`, minus the
 * Addresses join and the WorkTrackers-merge branch: this pulls Event →
 * WorkTracker only, never Event → Event or WorkTracker → WorkTracker.
 *
 * Fetches at most ONE candidate row (SQL date bound + `LIMIT 1`) instead of
 * the bleacher's whole history — every filter `resolveEventInstructions`
 * applies is mirrored in SQL below, same discipline as the address query.
 */
export async function getExpectedInstructionsForWorkTracker(params: {
  bleacherUuid: string;
  targetDate: string;
  direction: InstructionsDirection;
}): Promise<InstructionsResult> {
  const { bleacherUuid, targetDate, direction } = params;
  const lookingBack = direction === "past";
  const instructionsColumn = lookingBack ? "e.pickup_instructions" : "e.dropoff_instructions";

  let query = db
    .selectFrom("BleacherEvents as be")
    .innerJoin("Events as e", "e.id", "be.event_uuid")
    .select([
      "e.event_start as eventStart",
      "e.event_status as eventStatus",
      "e.pickup_instructions as pickupInstructions",
      "e.dropoff_instructions as dropoffInstructions",
    ])
    .where("be.bleacher_uuid", "=", bleacherUuid)
    .where("e.deleted", "=", 0)
    .where("e.event_status", "=", "booked")
    .where(instructionsColumn, "is not", null)
    .where(instructionsColumn, "!=", "");

  query = lookingBack
    ? query.where("e.event_start", "<=", localDayEndInstant(targetDate))
    : query.where("e.event_start", ">=", localDayStartInstant(targetDate));

  const neighbourRows = await typedGetAll(
    query
      .orderBy("e.event_start", lookingBack ? "desc" : "asc")
      .limit(1)
      .compile(),
    expect<NeighbourRow>(),
  );

  const text = resolveEventInstructions(
    neighbourRows.map((row) => ({
      eventStart: row.eventStart,
      booked: row.eventStatus === "booked",
      pickupInstructions: row.pickupInstructions,
      dropoffInstructions: row.dropoffInstructions,
    })),
    targetDate,
    direction,
  );

  return text ? { kind: "ok", text } : { kind: "not-found" };
}
