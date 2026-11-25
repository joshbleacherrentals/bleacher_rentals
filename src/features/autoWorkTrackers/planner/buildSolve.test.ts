import { describe, it, expect } from "vitest";
import { DateTime } from "luxon";
import { allowedDays, buildSolve, pairsToLookUp, type PlanTrip } from "./buildSolve";
import { readSolve } from "./fromSolve";
import { UNKNOWN_MINUTES, estimateLeg, pairKey, type Point } from "./roadTimes";

const WEEK = "2026-09-14";
const HOME: Point = [43.0, -80.0];
const A: Point = [43.1, -80.0];
const B: Point = [43.2, -80.0];

const trip = (over: Partial<PlanTrip> = {}): PlanTrip => ({
  bleacherUuid: "b1",
  bleacherNumber: 1,
  fromStreet: "A",
  toStreet: "B",
  fromAddressUuid: "a",
  toAddressUuid: "b",
  pickupAtEvent: true,
  fromEventUuid: "e1",
  toEventUuid: "e2",
  availableFrom: "2026-09-15",
  mustArriveBy: "2026-09-17",
  earliestDay: "2026-09-15",
  latestDay: "2026-09-16",
  pickup: A,
  dropoff: B,
  ...over,
});

describe("allowedDays", () => {
  it("is the free days inside the week, or why there are none", () => {
    expect(allowedDays(trip(), WEEK)).toEqual({ days: ["2026-09-15", "2026-09-16"], reason: null });
    expect(
      allowedDays(trip({ earliestDay: "2026-09-16", latestDay: "2026-09-15" }), WEEK).reason,
    ).toBe("no_window");
    expect(
      allowedDays(trip({ earliestDay: "2026-09-21", latestDay: "2026-09-25" }), WEEK).reason,
    ).toBe("outside_week");
  });
});

describe("pairsToLookUp", () => {
  it("asks for home → pickup, drop-off → pickup, drop-off → home and the haul", () => {
    const keys = pairsToLookUp([{ driverUuid: "d1", home: HOME }], [trip()]).map(([a, b]) =>
      pairKey(a, b),
    );
    expect(new Set(keys)).toEqual(
      new Set([pairKey(HOME, A), pairKey(B, A), pairKey(B, HOME), pairKey(A, B)]),
    );
  });
});

describe("buildSolve", () => {
  const roadLegs = new Map([[pairKey(A, B), { found: true, meters: 15_000, seconds: 900 }]]);

  it("makes a driver-day per free day, uses Google's time where known and estimates the rest", () => {
    const built = buildSolve({
      trips: [trip()],
      drivers: [{ driverUuid: "d1", home: HOME }],
      blocked: new Set(["d1|2026-09-16"]),
      weekStart: WEEK,
      roadLegs,
    });
    expect(built.vehicles.map((v) => v.id)).toEqual(["d1|2026-09-15"]);
    expect(built.request.trips).toEqual([
      {
        id: "0",
        pickup: 1,
        dropoff: 2,
        vehicles: ["d1|2026-09-15"],
        pickup_minutes: 60, // teardown at the event it leaves
        dropoff_minutes: 60, // setup at the next one
      },
    ]);
    expect(built.request.minutes[1][2]).toBe(15);
    expect(built.request.costs[1][2]).toBe(15_000);
    expect(built.request.minutes[0][1]).toBe(estimateLeg(HOME, A).minutes);
    expect(built.leg(1, 2)).toEqual({ meters: 15_000, minutes: 15 });
  });

  it("asks for no teardown time when the bleacher is not picked up from the event", () => {
    const built = buildSolve({
      trips: [trip({ pickupAtEvent: false })],
      drivers: [{ driverUuid: "d1", home: HOME }],
      blocked: new Set(),
      weekStart: WEEK,
      roadLegs,
    });
    expect(built.request.trips[0]).toMatchObject({ pickup_minutes: 0, dropoff_minutes: 60 });
  });

  it("treats a place with no coordinates as unknown: cautious on the clock, stored as null", () => {
    const built = buildSolve({
      trips: [trip({ pickup: null })],
      drivers: [{ driverUuid: "d1", home: HOME }],
      blocked: new Set(),
      weekStart: WEEK,
      roadLegs,
    });
    const { pickup } = built.tripPlaces[0];
    expect(built.request.minutes[0][pickup]).toBe(UNKNOWN_MINUTES);
    expect(built.leg(0, pickup)).toEqual({ meters: null, minutes: null });
  });

  it("does not send trips with no free day to the solver", () => {
    const built = buildSolve({
      trips: [trip({ earliestDay: "2026-09-16", latestDay: "2026-09-15" })],
      drivers: [{ driverUuid: "d1", home: HOME }],
      blocked: new Set(),
      weekStart: WEEK,
      roadLegs,
    });
    expect(built.request.trips).toEqual([]);
    expect(built.unplaced.map((u) => u.reason)).toEqual(["no_window"]);
  });
});

describe("readSolve", () => {
  it("reads a chained day: times from 7 am local, the second trip follows the first, only the last goes home", () => {
    const C: Point = [43.3, -80.0];
    const D: Point = [43.4, -80.0];
    const built = buildSolve({
      trips: [trip(), trip({ bleacherUuid: "b2", pickup: C, dropoff: D })],
      drivers: [{ driverUuid: "d1", home: HOME }],
      blocked: new Set(["d1|2026-09-16"]),
      weekStart: WEEK,
      roadLegs: new Map(),
    });
    let n = 0;
    const read = readSolve(
      built,
      {
        routes: [
          {
            vehicle: "d1|2026-09-15",
            stops: [
              { trip: "0", pickup_minute: 10, dropoff_minute: 30 },
              { trip: "1", pickup_minute: 45, dropoff_minute: 70 },
            ],
          },
        ],
        unplaced: [],
      },
      "America/Toronto",
      () => `id${++n}`,
    );
    const [first, second] = read.planned;
    expect([first.sequence, first.previousId, second.sequence, second.previousId]).toEqual([
      1,
      null,
      2,
      "id1",
    ]);
    expect(DateTime.fromISO(first.plannedPickupAt, { setZone: true }).toFormat("HH:mm")).toBe(
      "07:10",
    );
    expect(first.returnHome).toBeNull();
    expect(second.returnHome).not.toBeNull();
    expect(second.deadheadIn).toEqual(
      built.leg(built.tripPlaces[0].dropoff, built.tripPlaces[1].pickup),
    );
  });

  it("names why the solver left trips out", () => {
    const built = buildSolve({
      trips: [trip()],
      drivers: [{ driverUuid: "d1", home: HOME }],
      blocked: new Set(),
      weekStart: WEEK,
      roadLegs: new Map(),
    });
    const read = readSolve(
      built,
      { routes: [], unplaced: [{ trip: "0", reason: "no_room" }] },
      "UTC",
    );
    expect(read.unplaced.map((u) => u.reason)).toEqual(["no_free_driver_day"]);
  });
});
