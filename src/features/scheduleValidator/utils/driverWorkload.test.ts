import { describe, it, expect } from "vitest";
import {
  MAX_DRIVING_HOURS,
  buildDriverWorkload,
  formatHours,
  formatKm,
  type WorkloadTrip,
} from "./driverWorkload";

const WEEK = "2026-11-09"; // Monday; the week ends Sunday 2026-11-15

const trip = (overrides: Partial<WorkloadTrip> = {}): WorkloadTrip => ({
  driverUuid: "d1",
  driverName: "Sam Lee",
  date: "2026-11-10",
  driveMinutes: 60,
  ...overrides,
});

const day = (rows: ReturnType<typeof buildDriverWorkload>, driver: string, date: string) =>
  rows.find((r) => r.driverUuid === driver)!.days.find((d) => d.date === date)!;

describe("buildDriverWorkload", () => {
  it("gives each driver seven days, Monday first", () => {
    const [row] = buildDriverWorkload([trip()], WEEK);
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

  it("adds up a driver's hours and trips on a day", () => {
    const rows = buildDriverWorkload(
      [trip({ driveMinutes: 90 }), trip({ driveMinutes: 150 })],
      WEEK,
    );
    expect(day(rows, "d1", "2026-11-10")).toMatchObject({
      minutes: 240,
      trips: 2,
      overLimit: false,
    });
  });

  it("adds the deadhead to the hauling, and the 12-hour limit is on the total", () => {
    const rows = buildDriverWorkload(
      [
        trip({ driveMinutes: 300, deadheadMinutes: 120 }),
        trip({ driveMinutes: 240, deadheadMinutes: 90 }),
      ],
      WEEK,
    );
    expect(day(rows, "d1", "2026-11-10")).toMatchObject({
      haulMinutes: 540,
      deadheadMinutes: 210,
      minutes: 750,
      overLimit: true,
    });
  });

  it("adds up the hauling and deadhead distances", () => {
    const rows = buildDriverWorkload(
      [
        trip({ haulMeters: 100_000, deadheadMeters: 30_000 }),
        trip({ haulMeters: 50_000, deadheadMeters: null }),
      ],
      WEEK,
    );
    expect(day(rows, "d1", "2026-11-10")).toMatchObject({
      haulMeters: 150_000,
      deadheadMeters: 30_000,
      meters: 180_000,
    });
    expect(formatKm(180_400)).toBe("180km");
  });

  it("leaves a day with no trips empty", () => {
    const rows = buildDriverWorkload([trip()], WEEK);
    expect(day(rows, "d1", "2026-11-11")).toMatchObject({ minutes: 0, trips: 0, overLimit: false });
  });

  it("is fine at exactly 12 hours and an error past it", () => {
    expect(MAX_DRIVING_HOURS).toBe(12);
    const at = buildDriverWorkload([trip({ driveMinutes: 720 })], WEEK);
    expect(day(at, "d1", "2026-11-10").overLimit).toBe(false);
    const over = buildDriverWorkload(
      [trip({ driveMinutes: 400 }), trip({ driveMinutes: 321 })],
      WEEK,
    );
    expect(day(over, "d1", "2026-11-10").overLimit).toBe(true);
  });

  it("counts a trip with no drive time as a trip, adds no hours, and flags it", () => {
    const rows = buildDriverWorkload(
      [trip({ driveMinutes: null }), trip({ driveMinutes: 60 })],
      WEEK,
    );
    expect(day(rows, "d1", "2026-11-10")).toMatchObject({
      minutes: 60,
      trips: 2,
      missingDriveTime: 1,
    });
  });

  it("keeps drivers apart and ignores trips outside the week", () => {
    const rows = buildDriverWorkload(
      [trip(), trip({ driverUuid: "d2", driverName: "Ann Bee" }), trip({ date: "2026-11-16" })],
      WEEK,
    );
    expect(rows.map((r) => r.driverUuid)).toEqual(["d2", "d1"]); // by name: Ann Bee, Sam Lee
    expect(day(rows, "d1", "2026-11-10").trips).toBe(1);
  });

  it("has no rows when no driver has a trip", () => {
    expect(buildDriverWorkload([], WEEK)).toEqual([]);
  });
});

describe("formatHours", () => {
  it("drops a pointless .0 and rounds to one decimal", () => {
    expect(formatHours(480)).toBe("8h");
    expect(formatHours(450)).toBe("7.5h");
    expect(formatHours(100)).toBe("1.7h");
    expect(formatHours(0)).toBe("0h");
  });
});
