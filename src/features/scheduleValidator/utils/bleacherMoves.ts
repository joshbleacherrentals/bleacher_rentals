/**
 * Bleacher Data: every move of the zone's bleachers that touches the week, with where each is picked
 * up and dropped off, and whether both addresses are complete enough for the work tracker model.
 * The moves are the ones the model works from: the trips still needed (discoverTrips, the same rules
 * as the Python model) and the work trackers already dated in the week. Pure: no database.
 */

import type { NeededTrip } from "@/features/autoWorkTrackers/utils/discoverTrips";
import { checkAddress, type RequirementResult, type StoredAddress } from "./addressCheck";

/** One end of a move: the address row, and the event it belongs to when there is one. */
export type MoveEnd = {
  addressUuid: string | null;
  /** Street text, shown when the address row cannot be found. */
  street: string | null;
  eventUuid: string | null;
};

/** A work tracker dated in the week, for one of the zone's bleachers. */
export type WeekWorkTracker = {
  workTrackerUuid: string;
  bleacherUuid: string;
  bleacherNumber: number | null;
  date: string;
  status: string | null;
  pickup: MoveEnd;
  dropoff: MoveEnd;
};

export type BleacherMoveSource = "needed" | "work_tracker";

export type BleacherMove = {
  /** Unique per row: the work tracker's id, or the needed trip's bleacher and events. */
  key: string;
  bleacherUuid: string;
  bleacherNumber: number | null;
  source: BleacherMoveSource;
  /** A work tracker's day, or a needed trip's window (first and last allowed day). */
  date: string | null;
  window: { from: string; to: string } | null;
  status: string | null;
  pickup: MoveEnd & { address: StoredAddress | null; result: RequirementResult };
  dropoff: MoveEnd & { address: StoredAddress | null; result: RequirementResult };
  /** Both addresses passed. */
  ok: boolean;
};

const endWith = (end: MoveEnd, addresses: Map<string, StoredAddress>) => {
  const address = end.addressUuid ? (addresses.get(end.addressUuid) ?? null) : null;
  return { ...end, address, result: checkAddress(address, "No address") };
};

/** Every move, by bleacher number, then day (a needed trip by the first day of its window). */
export function buildBleacherMoves(
  needed: NeededTrip[],
  workTrackers: WeekWorkTracker[],
  addresses: Map<string, StoredAddress>,
): BleacherMove[] {
  const moves: BleacherMove[] = [
    ...needed.map((t) => {
      const pickup = endWith(
        { addressUuid: t.fromAddressUuid, street: t.fromStreet, eventUuid: t.fromEventUuid },
        addresses,
      );
      const dropoff = endWith(
        { addressUuid: t.toAddressUuid, street: t.toStreet, eventUuid: t.toEventUuid },
        addresses,
      );
      return {
        key: `needed:${t.bleacherUuid}:${t.fromEventUuid}:${t.toEventUuid}`,
        bleacherUuid: t.bleacherUuid,
        bleacherNumber: t.bleacherNumber,
        source: "needed" as const,
        date: null,
        window: { from: t.availableFrom, to: t.mustArriveBy },
        status: null,
        pickup,
        dropoff,
        ok: pickup.result.ok && dropoff.result.ok,
      };
    }),
    ...workTrackers.map((w) => {
      const pickup = endWith(w.pickup, addresses);
      const dropoff = endWith(w.dropoff, addresses);
      return {
        key: `wt:${w.workTrackerUuid}`,
        bleacherUuid: w.bleacherUuid,
        bleacherNumber: w.bleacherNumber,
        source: "work_tracker" as const,
        date: w.date,
        window: null,
        status: w.status,
        pickup,
        dropoff,
        ok: pickup.result.ok && dropoff.result.ok,
      };
    }),
  ];
  const day = (m: BleacherMove) => m.date ?? m.window?.from ?? "";
  return moves.sort(
    (a, b) =>
      (a.bleacherNumber ?? Number.MAX_SAFE_INTEGER) -
        (b.bleacherNumber ?? Number.MAX_SAFE_INTEGER) || day(a).localeCompare(day(b)),
  );
}

/** Every address row the moves point at, to look up in one go. */
export function moveAddressUuids(needed: NeededTrip[], workTrackers: WeekWorkTracker[]): string[] {
  const ids = new Set<string>();
  for (const t of needed) {
    if (t.fromAddressUuid) ids.add(t.fromAddressUuid);
    if (t.toAddressUuid) ids.add(t.toAddressUuid);
  }
  for (const w of workTrackers) {
    if (w.pickup.addressUuid) ids.add(w.pickup.addressUuid);
    if (w.dropoff.addressUuid) ids.add(w.dropoff.addressUuid);
  }
  return [...ids].sort();
}
