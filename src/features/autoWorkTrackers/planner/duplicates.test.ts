import { describe, it, expect } from "vitest";
import { withoutDuplicates, type ExistingTracker } from "./duplicates";
import type { PlannedTracker } from "./fromSolve";
import type { PlanTrip } from "./buildSolve";

const trip = (bleacherUuid: string): PlanTrip => ({
  bleacherUuid,
  bleacherNumber: 1,
  fromStreet: "A",
  toStreet: "2371 Merrittville Highway",
  fromAddressUuid: "a",
  toAddressUuid: "ev-b",
  pickupAtEvent: true,
  fromEventUuid: "e1",
  toEventUuid: "e2",
  availableFrom: "2026-09-13",
  mustArriveBy: "2026-09-18",
  earliestDay: "2026-09-13",
  latestDay: "2026-09-17",
  pickup: [43.3, -73.6],
  dropoff: [43.07778, -79.25207],
});

const planned = (
  id: string,
  bleacherUuid: string,
  previousId: string | null = null,
): PlannedTracker => ({
  id,
  trip: trip(bleacherUuid),
  driverUuid: "d1",
  date: "2026-09-15",
  sequence: previousId ? 2 : 1,
  previousId,
  plannedPickupAt: "",
  plannedDropoffAt: "",
  haul: { meters: 1, minutes: 1 },
  deadheadIn: { meters: 1, minutes: 1 },
  returnHome: null,
});

const existing = (over: Partial<ExistingTracker> = {}): ExistingTracker => ({
  bleacherUuid: "b1",
  date: "2026-09-14",
  dropoffAddressUuid: "wt-d",
  dropoffStreet: "2371 Merrittville Highway, Fonthill, ON, Canada",
  dropoffLatitude: 43.0779,
  dropoffLongitude: -79.2521,
  ...over,
});

describe("withoutDuplicates", () => {
  it("skips a trip a tracker already makes (same bleacher, same place, inside the window)", () => {
    const { keep, skipped } = withoutDuplicates(
      [planned("p1", "b1"), planned("p2", "b2")],
      [existing()],
    );
    expect(skipped.map((p) => p.id)).toEqual(["p1"]);
    expect(keep.map((p) => p.id)).toEqual(["p2"]);
  });

  it("keeps it when the tracker is outside the window or goes elsewhere", () => {
    const outside = existing({ date: "2026-09-25" });
    const elsewhere = existing({
      dropoffAddressUuid: "x",
      dropoffLatitude: 44,
      dropoffLongitude: -80,
      dropoffStreet: "Elsewhere",
    });
    expect(withoutDuplicates([planned("p1", "b1")], [outside, elsewhere]).keep).toHaveLength(1);
  });

  it("starts a kept trip from home when the trip it followed was skipped", () => {
    const { keep } = withoutDuplicates(
      [planned("p1", "b1"), planned("p2", "b2", "p1")],
      [existing()],
    );
    expect(keep).toEqual([expect.objectContaining({ id: "p2", previousId: null })]);
  });
});
