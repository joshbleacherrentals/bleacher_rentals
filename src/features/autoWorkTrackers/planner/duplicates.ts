/**
 * Re-run protection: a planned trip is left out when a work tracker that is not cancelled, declined
 * or abandoned already takes the same bleacher to the same place within the trip's window. Trip
 * discovery already skips moves that existing work trackers cover; this is the last check before
 * writing, and it sees trackers written in this browser and not yet uploaded too. Pure.
 */

import { samePlace } from "../utils/samePlace";
import type { PlannedTracker } from "./fromSolve";

export type ExistingTracker = {
  bleacherUuid: string;
  date: string | null;
  dropoffAddressUuid: string | null;
  dropoffStreet: string | null;
  dropoffLatitude: number | null;
  dropoffLongitude: number | null;
};

export function withoutDuplicates(
  planned: PlannedTracker[],
  existing: ExistingTracker[],
): { keep: PlannedTracker[]; skipped: PlannedTracker[] } {
  const keep: PlannedTracker[] = [];
  const skipped: PlannedTracker[] = [];
  for (const p of planned) {
    const t = p.trip;
    const target = {
      addressUuid: t.toAddressUuid,
      street: t.toStreet,
      latitude: t.dropoff?.[0] ?? null,
      longitude: t.dropoff?.[1] ?? null,
    };
    const covered = existing.some(
      (e) =>
        e.bleacherUuid === t.bleacherUuid &&
        e.date !== null &&
        e.date >= t.availableFrom &&
        e.date <= t.mustArriveBy &&
        samePlace(
          {
            addressUuid: e.dropoffAddressUuid,
            street: e.dropoffStreet,
            latitude: e.dropoffLatitude,
            longitude: e.dropoffLongitude,
          },
          target,
        ),
    );
    (covered ? skipped : keep).push(p);
  }
  // A kept trip that followed a skipped one now starts from home.
  const kept = new Set(keep.map((p) => p.id));
  return {
    keep: keep.map((p) =>
      p.previousId && !kept.has(p.previousId) ? { ...p, previousId: null } : p,
    ),
    skipped,
  };
}
