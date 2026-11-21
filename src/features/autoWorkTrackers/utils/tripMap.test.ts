import { describe, it, expect } from "vitest";
import { DRIVER_COLORS, NO_DRIVER, buildDriverLoops, type MapTracker } from "./tripMap";

const p = (lat: number, lng: number, label = "") => ({ lat, lng, label });
const HOME = p(43, -80, "home");
const A = p(43.1, -80, "A");
const B = p(43.2, -80, "B");

const tracker = (over: Partial<MapTracker>): MapTracker => ({
  workTrackerUuid: "w",
  date: "2026-09-15",
  driverUuid: "d1",
  driverName: "Zed",
  bleacherNumber: 1,
  home: HOME,
  pickup: A,
  dropoff: B,
  ...over,
});

const label = (t: MapTracker) => `#${t.bleacherNumber}`;

describe("buildDriverLoops", () => {
  it("draws home → pickup → drop-off → home, deadhead around the hauling", () => {
    const [loop] = buildDriverLoops([tracker({})], label);
    expect(loop.legs.map((l) => [l.kind, l.from.label, l.to.label])).toEqual([
      ["deadhead", "home", "A"],
      ["hauling", "A", "B"],
      ["deadhead", "B", "home"],
    ]);
    expect(loop.haulingKm).toBeCloseTo(11.1, 1);
    expect(loop.deadheadKm).toBeCloseTo(33.4, 1);
    expect(loop.incomplete).toBe(0);
  });

  it("gives each driver a colour by name, and puts trackers with no driver last, in grey", () => {
    const loops = buildDriverLoops(
      [
        tracker({ driverUuid: null, driverName: null, home: null }),
        tracker({ driverUuid: "d2", driverName: "Amy" }),
        tracker({ driverUuid: "d1", driverName: "Zed" }),
      ],
      label,
    );
    expect(loops.map((l) => [l.name, l.color])).toEqual([
      ["Amy", DRIVER_COLORS[0]],
      ["Zed", DRIVER_COLORS[1]],
      ["No driver yet", "#6b7280"],
    ]);
    expect(loops[2].key).toBe(NO_DRIVER);
    expect(loops[2].legs.map((l) => l.kind)).toEqual(["hauling"]);
  });

  it("skips legs missing a point and counts the trip as incomplete", () => {
    const [loop] = buildDriverLoops([tracker({ dropoff: null })], label);
    expect(loop.legs.map((l) => l.kind)).toEqual(["deadhead"]);
    expect(loop.incomplete).toBe(1);
  });

  it("follows a chain: the next trip starts at the previous drop-off, and only the last drives home", () => {
    const C = p(43.3, -80, "C");
    const D = p(43.4, -80, "D");
    const [loop] = buildDriverLoops(
      [
        tracker({ workTrackerUuid: "w1", pickup: A, dropoff: B }),
        tracker({ workTrackerUuid: "w2", previousUuid: "w1", pickup: C, dropoff: D }),
      ],
      label,
    );
    expect(loop.legs.map((l) => [l.kind, l.from.label, l.to.label])).toEqual([
      ["deadhead", "home", "A"],
      ["hauling", "A", "B"],
      ["deadhead", "B", "C"],
      ["hauling", "C", "D"],
      ["deadhead", "D", "home"],
    ]);
  });

  it("starts from home when the previous tracker is not this driver's", () => {
    const [loop] = buildDriverLoops([tracker({ previousUuid: "someone-else" })], label);
    expect(loop.legs[0]).toMatchObject({ kind: "deadhead", from: HOME });
  });
});
