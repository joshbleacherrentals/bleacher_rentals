import { describe, it, expect } from "vitest";
import {
  discoverTrips,
  normalizeStreet,
  timestampToDate,
  type BleacherInput,
  type BleacherStop,
  type ExistingTrip,
} from "./discoverTrips";

// The week used throughout: Monday 2026-11-09 to Sunday 2026-11-15.
const WEEK = "2026-11-09";

const stop = (
  id: string,
  street: string | null,
  startDate: string,
  endDate: string,
): BleacherStop => ({
  eventUuid: id,
  eventName: `Event ${id}`,
  street,
  startDate,
  endDate,
});

const trip = (
  id: string,
  date: string | null,
  pickupStreet: string | null,
  dropoffStreet: string | null,
): ExistingTrip => ({ workTrackerUuid: id, date, pickupStreet, dropoffStreet });

const bleacher = (
  stops: BleacherStop[],
  trips: ExistingTrip[] = [],
  bleacherNumber = 1,
): BleacherInput => ({ bleacherUuid: `b${bleacherNumber}`, bleacherNumber, stops, trips });

describe("normalizeStreet", () => {
  it("treats case, spacing and punctuation differences as the same street", () => {
    const a = normalizeStreet("123 Main St.");
    expect(normalizeStreet("  123  main st ")).toBe(a);
    expect(normalizeStreet("123 MAIN ST")).toBe(a);
    expect(normalizeStreet("123 Main St,")).toBe(a);
  });

  it("keeps different streets apart", () => {
    expect(normalizeStreet("123 Main St")).not.toBe(normalizeStreet("124 Main St"));
  });

  it("is empty for a missing or blank street", () => {
    expect(normalizeStreet(null)).toBe("");
    expect(normalizeStreet("   ")).toBe("");
  });
});

describe("timestampToDate", () => {
  it("reads the calendar date out of a database timestamp or a plain date", () => {
    expect(timestampToDate("2026-11-09 12:00:00+00")).toBe("2026-11-09");
    expect(timestampToDate("2026-11-09T12:00:00+00:00")).toBe("2026-11-09");
    expect(timestampToDate("2026-11-09")).toBe("2026-11-09");
  });

  it("is null for nothing or nonsense", () => {
    expect(timestampToDate(null)).toBeNull();
    expect(timestampToDate("not a date")).toBeNull();
  });
});

describe("discoverTrips: a move between two events", () => {
  it("needs nothing for a bleacher with no events", () => {
    expect(discoverTrips([bleacher([])], WEEK)).toEqual([]);
  });

  it("needs nothing for a single event, since there is nothing to move between", () => {
    expect(
      discoverTrips([bleacher([stop("a", "1 Main St", "2026-11-09", "2026-11-10")])], WEEK),
    ).toEqual([]);
  });

  it("needs nothing when the next event is at the same street, however it is written", () => {
    const result = discoverTrips(
      [
        bleacher([
          stop("a", "123 Main St.", "2026-11-06", "2026-11-09"),
          stop("b", "  123 MAIN st ", "2026-11-10", "2026-11-12"),
        ]),
      ],
      WEEK,
    );
    expect(result).toEqual([]);
  });

  it("needs one trip when the next event is at a different street", () => {
    const result = discoverTrips(
      [
        bleacher([
          stop("a", "1 Main St", "2026-11-06", "2026-11-09"),
          stop("b", "2 Oak Ave", "2026-11-15", "2026-11-16"),
        ]),
      ],
      WEEK,
    );
    expect(result).toEqual([
      {
        bleacherUuid: "b1",
        bleacherNumber: 1,
        fromStreet: "1 Main St",
        toStreet: "2 Oak Ave",
        fromEventUuid: "a",
        toEventUuid: "b",
        availableFrom: "2026-11-10",
        mustArriveBy: "2026-11-15",
      },
    ]);
  });

  it("sorts a bleacher's events by date before pairing them", () => {
    const result = discoverTrips(
      [
        bleacher([
          stop("b", "2 Oak Ave", "2026-11-15", "2026-11-16"),
          stop("a", "1 Main St", "2026-11-06", "2026-11-09"),
        ]),
      ],
      WEEK,
    );
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ fromEventUuid: "a", toEventUuid: "b" });
  });

  it("needs a trip for each move across three events in a row", () => {
    const result = discoverTrips(
      [
        bleacher([
          stop("a", "1 Main St", "2026-11-02", "2026-11-09"),
          stop("b", "2 Oak Ave", "2026-11-10", "2026-11-12"),
          stop("c", "3 Pine Rd", "2026-11-14", "2026-11-20"),
        ]),
      ],
      WEEK,
    );
    expect(result.map((t) => [t.fromEventUuid, t.toEventUuid])).toEqual([
      ["a", "b"],
      ["b", "c"],
    ]);
  });

  it("skips events with no street, comparing the ones either side of them", () => {
    const result = discoverTrips(
      [
        bleacher([
          stop("a", "1 Main St", "2026-11-06", "2026-11-09"),
          stop("x", null, "2026-11-10", "2026-11-11"),
          stop("b", "2 Oak Ave", "2026-11-12", "2026-11-13"),
        ]),
      ],
      WEEK,
    );
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ fromEventUuid: "a", toEventUuid: "b" });
  });
});

describe("discoverTrips: which week a move belongs to", () => {
  const move = (fromEnd: string, toStart: string) =>
    bleacher([
      stop("a", "1 Main St", "2026-01-01", fromEnd),
      stop("b", "2 Oak Ave", toStart, "2027-12-31"),
    ]);

  it("includes a move whose whole window is inside the week", () => {
    expect(discoverTrips([move("2026-11-10", "2026-11-12")], WEEK)).toHaveLength(1);
  });

  it("includes a move whose window is far longer than the week, on both sides", () => {
    expect(discoverTrips([move("2026-10-04", "2026-12-13")], WEEK)).toHaveLength(1);
  });

  it("includes a move that is still open on the Monday and one that opens on the Sunday", () => {
    expect(discoverTrips([move("2026-11-01", "2026-11-09")], WEEK)).toHaveLength(1);
    expect(discoverTrips([move("2026-11-14", "2026-11-20")], WEEK)).toHaveLength(1);
  });

  it("leaves out a bleacher whose event ends on the Sunday: it is collected the Monday after", () => {
    expect(discoverTrips([move("2026-11-15", "2026-11-25")], WEEK)).toEqual([]);
    expect(discoverTrips([move("2026-11-15", "2026-11-25")], "2026-11-16")).toHaveLength(1);
  });

  it("opens the move on the day the next event starts when that is before the day after", () => {
    const [trip] = discoverTrips([move("2026-11-10", "2026-11-10")], WEEK);
    expect(trip.availableFrom).toBe("2026-11-10");
  });

  it("leaves out a move that closed the day before the Monday", () => {
    expect(discoverTrips([move("2026-11-01", "2026-11-08")], WEEK)).toEqual([]);
  });

  it("leaves out a move that opens the day after the Sunday", () => {
    expect(discoverTrips([move("2026-11-16", "2026-11-20")], WEEK)).toEqual([]);
  });
});

describe("discoverTrips: work trackers that already exist", () => {
  const a = stop("a", "1 Main St", "2026-11-02", "2026-11-09");
  const b = stop("b", "2 Oak Ave", "2026-11-14", "2026-11-16");

  it("needs nothing when a work tracker already carries the bleacher from one event to the next", () => {
    const result = discoverTrips(
      [bleacher([a, b], [trip("w1", "2026-11-11", "1 Main St", "2 Oak Ave")])],
      WEEK,
    );
    expect(result).toEqual([]);
  });

  it("matches a work tracker's streets the same loose way it matches events", () => {
    const result = discoverTrips(
      [bleacher([a, b], [trip("w1", "2026-11-11", "1 MAIN ST.", " 2 oak ave")])],
      WEEK,
    );
    expect(result).toEqual([]);
  });

  it("needs only the rest of the way when a work tracker stops short of the next event", () => {
    const result = discoverTrips(
      [bleacher([a, b], [trip("w1", "2026-11-11", "1 Main St", "9 Depot Dr")])],
      WEEK,
    );
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      fromStreet: "9 Depot Dr",
      toStreet: "2 Oak Ave",
      fromEventUuid: "a",
      toEventUuid: "b",
    });
  });

  it("needs nothing when two work trackers chain from one event to the next", () => {
    const result = discoverTrips(
      [
        bleacher(
          [a, b],
          [
            trip("w2", "2026-11-12", "9 Depot Dr", "2 Oak Ave"),
            trip("w1", "2026-11-10", "1 Main St", "9 Depot Dr"),
          ],
        ),
      ],
      WEEK,
    );
    expect(result).toEqual([]);
  });

  it("ignores a work tracker that picks up somewhere the bleacher is not", () => {
    const result = discoverTrips(
      [bleacher([a, b], [trip("w1", "2026-11-11", "7 Elsewhere Ln", "2 Oak Ave")])],
      WEEK,
    );
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ fromStreet: "1 Main St", toStreet: "2 Oak Ave" });
  });

  it("ignores a work tracker dated outside the window between the two events", () => {
    const before = trip("w1", "2026-11-01", "1 Main St", "2 Oak Ave");
    const after = trip("w2", "2026-11-20", "1 Main St", "2 Oak Ave");
    expect(discoverTrips([bleacher([a, b], [before, after])], WEEK)).toHaveLength(1);
  });

  it("counts a work tracker dated the day after the first event ends or the day the next begins", () => {
    const dayAfterEnd = trip("w1", "2026-11-10", "1 Main St", "2 Oak Ave");
    expect(discoverTrips([bleacher([a, b], [dayAfterEnd])], WEEK)).toEqual([]);
    const onLastDay = trip("w1", "2026-11-09", "1 Main St", "2 Oak Ave");
    expect(discoverTrips([bleacher([a, b], [onLastDay])], WEEK)).toHaveLength(1);
    const sameDayAsStart = trip("w1", "2026-11-14", "1 Main St", "2 Oak Ave");
    expect(discoverTrips([bleacher([a, b], [sameDayAsStart])], WEEK)).toEqual([]);
  });

  it("ignores a work tracker with no date or no dropoff", () => {
    const result = discoverTrips(
      [
        bleacher(
          [a, b],
          [trip("w1", null, "1 Main St", "2 Oak Ave"), trip("w2", "2026-11-11", "1 Main St", null)],
        ),
      ],
      WEEK,
    );
    expect(result).toHaveLength(1);
  });

  it("does not let a work tracker satisfy a move it is not part of", () => {
    const shortB = stop("b", "2 Oak Ave", "2026-11-14", "2026-11-14");
    const c = stop("c", "3 Pine Rd", "2026-11-15", "2026-11-19");
    const result = discoverTrips(
      [bleacher([a, shortB, c], [trip("w1", "2026-11-11", "1 Main St", "2 Oak Ave")])],
      WEEK,
    );
    // a -> b is covered by the work tracker; b -> c (14th to 15th) is not.
    expect(result.map((t) => [t.fromEventUuid, t.toEventUuid])).toEqual([["b", "c"]]);
  });
});

describe("discoverTrips: several bleachers", () => {
  it("lists them by bleacher number, then by when the move opens", () => {
    const needs = (n: number, fromEnd: string) =>
      bleacher(
        [
          stop(`a${n}`, "1 Main St", "2026-11-01", fromEnd),
          stop(`b${n}`, "2 Oak Ave", "2026-11-15", "2026-11-16"),
        ],
        [],
        n,
      );
    const result = discoverTrips([needs(12, "2026-11-10"), needs(3, "2026-11-12")], WEEK);
    expect(result.map((t) => t.bleacherNumber)).toEqual([3, 12]);
  });

  it("leaves out bleachers that need nothing", () => {
    const fine = bleacher(
      [
        stop("a", "1 Main St", "2026-11-01", "2026-11-09"),
        stop("b", "1 Main St", "2026-11-12", "2026-11-13"),
      ],
      [],
      5,
    );
    const needs = bleacher(
      [
        stop("c", "1 Main St", "2026-11-01", "2026-11-09"),
        stop("d", "2 Oak Ave", "2026-11-12", "2026-11-13"),
      ],
      [],
      6,
    );
    expect(discoverTrips([fine, needs], WEEK).map((t) => t.bleacherNumber)).toEqual([6]);
  });
});
