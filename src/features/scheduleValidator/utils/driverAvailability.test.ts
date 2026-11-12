import { describe, it, expect } from "vitest";
import { checkDriverAvailability, type DriverTrip } from "./driverAvailability";

const trip = (overrides: Partial<DriverTrip> = {}): DriverTrip => ({
  workTrackerId: "w1",
  date: "2026-11-10",
  driverUuid: "d1",
  driverName: "Sam Lee",
  fromStreet: "1 Main St",
  toStreet: "2 Oak Ave",
  ...overrides,
});

const unavailable = (driverUuid: string, date: string) => ({ driverUuid, date });

describe("checkDriverAvailability", () => {
  it("is available when the driver has no unavailability on the trip's date", () => {
    const [row] = checkDriverAvailability([trip()], [unavailable("d1", "2026-11-11")]);
    expect(row.available).toBe(true);
  });

  it("is not available when the driver is unavailable that date", () => {
    const [row] = checkDriverAvailability([trip()], [unavailable("d1", "2026-11-10")]);
    expect(row.available).toBe(false);
  });

  it("does not mix up drivers: another driver's unavailability does not count", () => {
    const [row] = checkDriverAvailability([trip()], [unavailable("d2", "2026-11-10")]);
    expect(row.available).toBe(true);
  });

  it("keeps the trip's details on the row", () => {
    const [row] = checkDriverAvailability([trip()], []);
    expect(row).toMatchObject({
      workTrackerId: "w1",
      date: "2026-11-10",
      driverName: "Sam Lee",
      fromStreet: "1 Main St",
      toStreet: "2 Oak Ave",
    });
  });

  it("orders rows by date, then driver name, then work tracker", () => {
    const rows = checkDriverAvailability(
      [
        trip({ workTrackerId: "c", date: "2026-11-11", driverName: "Ann" }),
        trip({ workTrackerId: "b", date: "2026-11-10", driverName: "Zed" }),
        trip({ workTrackerId: "a", date: "2026-11-10", driverName: "Bob" }),
      ],
      [],
    );
    expect(rows.map((r) => r.workTrackerId)).toEqual(["a", "b", "c"]);
  });
});
