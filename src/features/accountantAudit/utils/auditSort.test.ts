import { describe, expect, it } from "vitest";
import type { AuditDriverRow } from "./auditDriverRows";
import {
  AUDIT_SORT_KEYS,
  DEFAULT_AUDIT_SORT,
  FIRST_DIRECTION,
  nextAuditSort,
  sortAuditDriverRows,
} from "./auditSort";

// docs/specs/accountant-audit-05-drivers-table.md §4 (D19, D20, D22, R4, R22, R23).

const row = (id: string, first: string | null, last: string | null, over = {}): AuditDriverRow => ({
  driverUuid: id,
  firstName: first,
  lastName: last,
  distanceMeters: 0,
  driveMinutes: 0,
  payCents: 0,
  payCurrency: "USD",
  tripCount: 0,
  ...over,
});
const ids = (rows: AuditDriverRow[]) => rows.map((r) => r.driverUuid);

describe("the opening sort (D19)", () => {
  it("is Pay, largest first", () => {
    expect(DEFAULT_AUDIT_SORT).toEqual({ key: "pay", direction: "desc" });
  });
  it("has the five keys", () => {
    expect([...AUDIT_SORT_KEYS]).toEqual(["driver", "distance", "time", "trips", "pay"]);
  });
});

describe("sortAuditDriverRows by each key", () => {
  const rows = [
    row("a", "Cara", "Z", { distanceMeters: 300, driveMinutes: 20, tripCount: 5, payCents: 500 }),
    row("b", "Ann", "Y", { distanceMeters: 100, driveMinutes: 90, tripCount: 1, payCents: 900 }),
    row("c", "Bob", "X", { distanceMeters: 200, driveMinutes: 50, tripCount: 9, payCents: 100 }),
  ];
  it("Driver, A to Z and Z to A", () => {
    expect(ids(sortAuditDriverRows(rows, { key: "driver", direction: "asc" }))).toEqual([
      "b",
      "c",
      "a",
    ]);
    expect(ids(sortAuditDriverRows(rows, { key: "driver", direction: "desc" }))).toEqual([
      "a",
      "c",
      "b",
    ]);
  });
  it("Distance, on the metres", () => {
    expect(ids(sortAuditDriverRows(rows, { key: "distance", direction: "desc" }))).toEqual([
      "a",
      "c",
      "b",
    ]);
    expect(ids(sortAuditDriverRows(rows, { key: "distance", direction: "asc" }))).toEqual([
      "b",
      "c",
      "a",
    ]);
  });
  it("Drive Time, on the minutes", () => {
    expect(ids(sortAuditDriverRows(rows, { key: "time", direction: "desc" }))).toEqual([
      "b",
      "c",
      "a",
    ]);
    expect(ids(sortAuditDriverRows(rows, { key: "time", direction: "asc" }))).toEqual([
      "a",
      "c",
      "b",
    ]);
  });
  it("Trips", () => {
    expect(ids(sortAuditDriverRows(rows, { key: "trips", direction: "desc" }))).toEqual([
      "c",
      "a",
      "b",
    ]);
    expect(ids(sortAuditDriverRows(rows, { key: "trips", direction: "asc" }))).toEqual([
      "b",
      "a",
      "c",
    ]);
  });
  it("Pay, on the cents", () => {
    expect(ids(sortAuditDriverRows(rows, DEFAULT_AUDIT_SORT))).toEqual(["b", "a", "c"]);
    expect(ids(sortAuditDriverRows(rows, { key: "pay", direction: "asc" }))).toEqual([
      "c",
      "a",
      "b",
    ]);
  });
  it("does not change the array it is given", () => {
    const copy = [...rows];
    sortAuditDriverRows(rows, DEFAULT_AUDIT_SORT);
    expect(rows).toEqual(copy);
  });
});

describe("the Driver column", () => {
  it("sorts by first name, then last name, ignoring case", () => {
    const rows = [
      row("1", "ann", "Zed"),
      row("2", "Ann", "Abe"),
      row("3", "ANN", "Moss"),
      row("4", "Bea", "A"),
    ];
    expect(ids(sortAuditDriverRows(rows, { key: "driver", direction: "asc" }))).toEqual([
      "2",
      "3",
      "1",
      "4",
    ]);
  });
  it("puts a driver with no name first when ascending", () => {
    const rows = [row("1", "Ann", "Lee"), row("2", null, null)];
    expect(ids(sortAuditDriverRows(rows, { key: "driver", direction: "asc" }))).toEqual(["2", "1"]);
  });
});

describe("ties (R4)", () => {
  const tied = [
    row("z-id", "Bob", "Stone", { payCents: 100 }),
    row("a-id", "Bob", "Stone", { payCents: 100 }),
    row("m-id", "Ann", "Stone", { payCents: 100 }),
    row("k-id", "Ann", "Lee", { payCents: 100 }),
  ];
  const expected = ["k-id", "m-id", "a-id", "z-id"]; // Ann Lee, Ann Stone, Bob Stone x2 by id

  it("go by first name, last name, then driver id, A to Z, when sorting descending", () => {
    expect(ids(sortAuditDriverRows(tied, { key: "pay", direction: "desc" }))).toEqual(expected);
  });
  it("go the same way when sorting ascending: the tie-break does not flip", () => {
    expect(ids(sortAuditDriverRows(tied, { key: "pay", direction: "asc" }))).toEqual(expected);
  });
  it("give the same order whatever order the rows came in", () => {
    const reversed = [...tied].reverse();
    expect(ids(sortAuditDriverRows(reversed, { key: "pay", direction: "desc" }))).toEqual(expected);
  });
  it("two drivers with the same name sort by id under the Driver column", () => {
    const rows = [row("2", "Bob", "Stone"), row("1", "Bob", "Stone")];
    expect(ids(sortAuditDriverRows(rows, { key: "driver", direction: "desc" }))).toEqual([
      "1",
      "2",
    ]);
  });
});

describe("Pay across currencies (D22)", () => {
  it("compares the plain cents and ignores the currency", () => {
    const rows = [
      row("usd", "A", "A", { payCents: 400000, payCurrency: "USD" }),
      row("cad", "B", "B", { payCents: 500000, payCurrency: "CAD" }),
    ];
    expect(ids(sortAuditDriverRows(rows, { key: "pay", direction: "desc" }))).toEqual([
      "cad",
      "usd",
    ]);
    expect(ids(sortAuditDriverRows(rows, { key: "pay", direction: "asc" }))).toEqual([
      "usd",
      "cad",
    ]);
  });
});

describe("nextAuditSort (D20, R22)", () => {
  it("takes Driver A to Z and the other columns largest first on the first click", () => {
    expect(FIRST_DIRECTION).toEqual({
      driver: "asc",
      distance: "desc",
      time: "desc",
      trips: "desc",
      pay: "desc",
    });
    const start = { key: "pay", direction: "desc" } as const;
    expect(nextAuditSort(start, "driver")).toEqual({ key: "driver", direction: "asc" });
    expect(nextAuditSort(start, "distance")).toEqual({ key: "distance", direction: "desc" });
    expect(nextAuditSort(start, "trips")).toEqual({ key: "trips", direction: "desc" });
  });
  it("flips the direction on a click on the sorted column", () => {
    expect(nextAuditSort({ key: "pay", direction: "desc" }, "pay")).toEqual({
      key: "pay",
      direction: "asc",
    });
    expect(nextAuditSort({ key: "pay", direction: "asc" }, "pay")).toEqual({
      key: "pay",
      direction: "desc",
    });
    expect(nextAuditSort({ key: "driver", direction: "asc" }, "driver")).toEqual({
      key: "driver",
      direction: "desc",
    });
  });
  it("always leaves one sorted column", () => {
    let s = DEFAULT_AUDIT_SORT;
    for (const key of ["driver", "driver", "time", "pay", "pay"] as const)
      s = nextAuditSort(s, key);
    expect(s).toEqual({ key: "pay", direction: "asc" });
  });
});
