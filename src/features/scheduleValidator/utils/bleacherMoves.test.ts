import { describe, it, expect } from "vitest";
import type { NeededTrip } from "@/features/autoWorkTrackers/utils/discoverTrips";
import type { StoredAddress } from "./addressCheck";
import { buildBleacherMoves, moveAddressUuids, type WeekWorkTracker } from "./bleacherMoves";

const FULL: StoredAddress = {
  street: "1 Main St",
  city: "Simcoe",
  state_province: "ON",
  zip_postal: "N3Y 4K3",
  country: "CA",
  latitude: 42.9,
  longitude: -80.3,
  place_id: "ChIJ1",
};

const needed: NeededTrip = {
  bleacherUuid: "b2",
  bleacherNumber: 2,
  fromStreet: "1 Main St",
  toStreet: "2 Oak Ave",
  fromAddressUuid: "addr-full",
  toAddressUuid: "addr-no-coords",
  fromEventUuid: "e1",
  toEventUuid: "e2",
  availableFrom: "2026-09-15",
  mustArriveBy: "2026-09-18",
  earliestDay: "2026-09-15",
  latestDay: "2026-09-17",
};

const tracker: WeekWorkTracker = {
  workTrackerUuid: "w1",
  bleacherUuid: "b1",
  bleacherNumber: 1,
  date: "2026-09-16",
  status: "draft",
  pickup: { addressUuid: "addr-full", street: "1 Main St", eventUuid: "e1" },
  dropoff: { addressUuid: null, street: null, eventUuid: null },
};

const addresses = new Map<string, StoredAddress>([
  ["addr-full", FULL],
  ["addr-no-coords", { ...FULL, latitude: null, longitude: null }],
]);

describe("buildBleacherMoves", () => {
  const moves = buildBleacherMoves([needed], [tracker], addresses);

  it("lists needed trips and work trackers, by bleacher number", () => {
    expect(moves.map((m) => [m.key, m.source])).toEqual([
      ["wt:w1", "work_tracker"],
      ["needed:b2:e1:e2", "needed"],
    ]);
    expect(moves[1].window).toEqual({ from: "2026-09-15", to: "2026-09-18" });
  });

  it("checks both ends, failing the move when either is incomplete", () => {
    const [wt, trip] = moves;
    expect(wt.pickup.result.ok).toBe(true);
    expect(wt.dropoff.result).toEqual({ ok: false, problem: "No address" });
    expect(wt.ok).toBe(false);
    expect(trip.dropoff.result.problem).toBe("Missing latitude, longitude");
    expect(trip.ok).toBe(false);
  });
});

describe("moveAddressUuids", () => {
  it("collects each address row once", () => {
    expect(moveAddressUuids([needed], [tracker])).toEqual(["addr-full", "addr-no-coords"]);
  });
});
