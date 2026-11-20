import { describe, it, expect } from "vitest";
import {
  buildDriverAvailability,
  type AvailabilityTrip,
  type Unavailability,
} from "./driverAvailability";

const WEEK = "2026-11-09"; // a Monday

const trip = (overrides: Partial<AvailabilityTrip> = {}): AvailabilityTrip => ({
  workTrackerId: "w1",
  date: "2026-11-10",
  driverUuid: "d1",
  driverName: "Sam Lee",
  fromStreet: "1 Main St",
  toStreet: "2 Oak Ave",
  ...overrides,
});

const off = (driverUuid: string, date: string, driverName = "Sam Lee"): Unavailability => ({
  driverUuid,
  driverName,
  date,
});

describe("buildDriverAvailability", () => {
  it("gives each driver the seven days of the week, Monday first", () => {
    const [row] = buildDriverAvailability([trip()], [], WEEK);
    expect(row.days.map((d) => d.date)).toEqual([
      "2026-11-09",
      "2026-11-10",
      "2026-11-11",
      "2026-11-12",
      "2026-11-13",
      "2026-11-14",
      "2026-11-15",
    ]);
  });

  it("marks a day scheduled when the driver has a trip that day", () => {
    const [row] = buildDriverAvailability([trip(), trip({ workTrackerId: "w2" })], [], WEEK);
    expect(row.days[1]).toMatchObject({ unavailable: false, conflict: false });
    expect(row.days[1].trips.map((t) => t.workTrackerId)).toEqual(["w1", "w2"]);
    expect(row.days[0].trips).toEqual([]);
  });

  it("marks a day unavailable without a conflict when the driver has no trip that day", () => {
    const [row] = buildDriverAvailability([trip()], [off("d1", "2026-11-12")], WEEK);
    expect(row.days[3]).toMatchObject({ unavailable: true, conflict: false });
    expect(row.ok).toBe(true);
  });

  it("is a conflict when the driver is scheduled on a day they marked unavailable", () => {
    const [row] = buildDriverAvailability([trip()], [off("d1", "2026-11-10")], WEEK);
    expect(row.days[1]).toMatchObject({ unavailable: true, conflict: true });
    expect(row.ok).toBe(false);
  });

  it("does not mix up drivers: another driver's unavailability does not count", () => {
    const rows = buildDriverAvailability([trip()], [off("d2", "2026-11-10", "Ann Bo")], WEEK);
    const sam = rows.find((r) => r.driverUuid === "d1")!;
    expect(sam.days[1].conflict).toBe(false);
    expect(sam.ok).toBe(true);
  });

  it("lists a driver who only marked a day unavailable, with no trips", () => {
    const [row] = buildDriverAvailability([], [off("d2", "2026-11-11", "Ann Bo")], WEEK);
    expect(row).toMatchObject({ driverUuid: "d2", driverName: "Ann Bo", ok: true });
    expect(row.days[2].unavailable).toBe(true);
  });

  it("ignores trips and unavailability outside the week", () => {
    const rows = buildDriverAvailability(
      [trip({ date: "2026-11-16" })],
      [off("d2", "2026-11-08", "Ann Bo")],
      WEEK,
    );
    expect(rows).toEqual([]);
  });

  it("orders drivers by name", () => {
    const rows = buildDriverAvailability(
      [trip({ driverUuid: "d1", driverName: "Zed Ray" })],
      [off("d2", "2026-11-11", "Ann Bo")],
      WEEK,
    );
    expect(rows.map((r) => r.driverName)).toEqual(["Ann Bo", "Zed Ray"]);
  });
});
