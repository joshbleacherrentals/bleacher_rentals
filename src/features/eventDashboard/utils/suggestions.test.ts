import { describe, it, expect } from "vitest";
import type { Bleacher } from "@/features/dashboard/types";
import {
  ghostsByCell,
  isInWeek,
  tripKey,
  tripsInWeek,
  withoutTrips,
  type SuggestedTrip,
} from "./suggestions";

const trip = (overrides: Partial<SuggestedTrip> = {}): SuggestedTrip => ({
  bleacherUuid: "b1",
  bleacherNumber: 1,
  fromAddressUuid: "a1",
  toAddressUuid: "a2",
  fromStreet: "1 Main",
  toStreet: "2 Oak",
  fromEventUuid: "e1",
  toEventUuid: "e2",
  date: "2026-11-10",
  availableFrom: "2026-11-05",
  mustArriveBy: "2026-11-12",
  ...overrides,
});
const rows = (...uuids: string[]) => uuids.map((u) => ({ bleacherUuid: u }) as unknown as Bleacher);
const dates = ["2026-11-09", "2026-11-10", "2026-11-11"];

describe("ghostsByCell", () => {
  it("puts a trip in the cell of its bleacher's row and its date's column", () => {
    const cells = ghostsByCell([trip()], rows("b0", "b1"), dates);
    expect([...cells.keys()]).toEqual(["1:1"]);
  });

  it("shows the trip on every row of a bleacher that is on several events", () => {
    const cells = ghostsByCell([trip()], rows("b1", "b9", "b1"), dates);
    expect([...cells.keys()].sort()).toEqual(["0:1", "2:1"]);
  });

  it("groups trips that land in the same cell", () => {
    const cells = ghostsByCell([trip(), trip({ toAddressUuid: "a3" })], rows("b1"), dates);
    expect(cells.get("0:1")).toHaveLength(2);
  });

  it("drops a trip whose date is not a column or whose bleacher has no row", () => {
    expect(ghostsByCell([trip({ date: "2030-01-01" })], rows("b1"), dates).size).toBe(0);
    expect(ghostsByCell([trip({ bleacherUuid: "zzz" })], rows("b1"), dates).size).toBe(0);
  });
});

describe("isInWeek", () => {
  it("is true Monday to Sunday and false either side", () => {
    expect(isInWeek("2026-11-09", "2026-11-09")).toBe(true);
    expect(isInWeek("2026-11-15", "2026-11-09")).toBe(true);
    expect(isInWeek("2026-11-08", "2026-11-09")).toBe(false);
    expect(isInWeek("2026-11-16", "2026-11-09")).toBe(false);
  });
});

describe("tripKey", () => {
  it("tells apart trips by bleacher, date and drop-off", () => {
    expect(tripKey(trip())).toBe("b1|2026-11-10|a2");
    expect(tripKey(trip({ toAddressUuid: null }))).toBe("b1|2026-11-10|");
  });
});

describe("tripsInWeek", () => {
  it("keeps only the trips dated inside the selected week", () => {
    const trips = [
      trip({ date: "2026-11-08" }),
      trip({ date: "2026-11-09" }),
      trip({ date: "2026-11-15" }),
      trip({ date: "2026-11-16" }),
    ];
    expect(tripsInWeek(trips, "2026-11-09").map((t) => t.date)).toEqual([
      "2026-11-09",
      "2026-11-15",
    ]);
  });
});

describe("withoutTrips", () => {
  it("removes the trips that were accepted and keeps the rest", () => {
    const a = trip();
    const b = trip({ bleacherUuid: "b2" });
    expect(withoutTrips([a, b], [a])).toEqual([b]);
  });
});
