/**
 * Proof of delivery from GPS: did a completed work tracker's bleacher reach its drop-off? Pure.
 *
 * The window runs from the driver's Complete until the bleacher's next move begins (the next work
 * tracker's start), or now when it has not moved again. Only GPS reports in that window count, so a
 * later trip's position can never be taken for this delivery's.
 *
 *  - verified: a stop or position within DELIVERY_RADIUS_M of the drop-off, from an hour before
 *    Complete (drivers tap it a little late) to the end of the window.
 *  - not_found: the bleacher reported after Complete, but never within the radius.
 *  - waiting: no report since Complete yet; GPS trackers on parked bleachers report rarely, so the
 *    next run looks again.
 *  - no_gps: no report came before the bleacher moved again, or within GRACE_MS of Complete.
 *
 * A verdict is final once the window is over (the next move began, or the grace period passed);
 * until then even not_found is looked at again, e.g. a driver who tapped Complete before arriving.
 */

import { straightLineKm } from "@/features/autoWorkTrackers/utils/distance";

export const DELIVERY_RADIUS_M = 500;
/** Matching may start this long before Complete: drivers tap it after arriving. */
export const EARLY_MS = 60 * 60 * 1000;
/** With no next move, give the GPS this long after Complete before giving up. */
export const GRACE_MS = 3 * 24 * 60 * 60 * 1000;
/** Do not judge a completion younger than this: the GPS stop may not be recorded yet. */
export const SETTLE_MS = 2 * 60 * 60 * 1000;

export type ProofStatus = "verified" | "not_found" | "waiting" | "no_gps" | "no_location";

/** A GPS report: a stop (from begin to end, end null while still there) or a single position. */
export type Evidence = {
  kind: "stop" | "position";
  latitude: number;
  longitude: number;
  fromMs: number;
  toMs: number | null;
  /** Where Linxup placed it: its geofence name, else street and city (stops only). */
  place?: string | null;
};

export type Verdict = {
  status: ProofStatus;
  final: boolean;
  /** The closest report in the window, and how far it was from the drop-off. */
  best: (Evidence & { meters: number }) | null;
};

const overlaps = (e: Evidence, from: number, to: number, nowMs: number) =>
  e.fromMs <= to && (e.toMs ?? nowMs) >= from;

export function deliveryVerdict(input: {
  dropoff: { latitude: number; longitude: number } | null;
  completedMs: number;
  /** When the bleacher's next move began; null when it has not moved again. */
  nextMoveMs: number | null;
  nowMs: number;
  evidence: Evidence[];
}): Verdict {
  const { dropoff, completedMs, nextMoveMs, nowMs } = input;
  if (!dropoff) return { status: "no_location", final: true, best: null };

  const end = nextMoveMs ?? nowMs;
  const over = nextMoveMs != null || nowMs - completedMs > GRACE_MS;
  const meters = (e: Evidence) => Math.round((straightLineKm(e, dropoff) ?? Infinity) * 1000);
  const closest = (list: Evidence[]) =>
    list.map((e) => ({ ...e, meters: meters(e) })).sort((a, b) => a.meters - b.meters)[0] ?? null;

  const inWindow = input.evidence.filter((e) => overlaps(e, completedMs - EARLY_MS, end, nowMs));
  // A stop is the better proof (the bleacher stayed, and Linxup names the place), so a stop within
  // the radius is preferred over a single position, even a closer one.
  const near =
    closest(inWindow.filter((e) => e.kind === "stop" && meters(e) <= DELIVERY_RADIUS_M)) ??
    closest(inWindow);
  if (near && near.meters <= DELIVERY_RADIUS_M) {
    return { status: "verified", final: true, best: near };
  }

  const after = closest(input.evidence.filter((e) => overlaps(e, completedMs, end, nowMs)));
  if (after) return { status: "not_found", final: over, best: after };
  return over
    ? { status: "no_gps", final: true, best: null }
    : { status: "waiting", final: false, best: null };
}
