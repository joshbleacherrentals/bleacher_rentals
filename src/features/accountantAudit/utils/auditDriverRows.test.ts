import { describe, expect, it } from "vitest";
import {
  filterAuditDriverRows,
  toAuditDriverRows,
  type AuditDriverRow,
  type AuditDriverTotalsResultRow,
} from "./auditDriverRows";

// docs/specs/accountant-audit-05-drivers-table.md §2.1, §4 (D17, R6, R23, R24).

const raw = (over: Partial<AuditDriverTotalsResultRow> = {}): AuditDriverTotalsResultRow => ({
  driver_uuid: "d1",
  first_name: "Ann",
  last_name: "Lee",
  pay_currency: "USD",
  distance_meters: 1000,
  drive_minutes: 60,
  pay_cents: 12345,
  trip_count: 3,
  ...over,
});

describe("toAuditDriverRows", () => {
  it("maps the columns to the row", () => {
    expect(toAuditDriverRows([raw()])).toEqual([
      {
        driverUuid: "d1",
        firstName: "Ann",
        lastName: "Lee",
        distanceMeters: 1000,
        driveMinutes: 60,
        payCents: 12345,
        payCurrency: "USD",
        tripCount: 3,
      },
    ]);
  });
  it("drops a row with no driver", () => {
    expect(toAuditDriverRows([raw({ driver_uuid: null }), raw({ driver_uuid: "d2" })])).toEqual([
      expect.objectContaining({ driverUuid: "d2" }),
    ]);
  });
  it("turns null sums into 0", () => {
    const [row] = toAuditDriverRows([
      raw({ distance_meters: null, drive_minutes: null, pay_cents: null }),
    ]);
    expect(row).toMatchObject({ distanceMeters: 0, driveMinutes: 0, payCents: 0, tripCount: 3 });
  });
  it("keeps CAD and USD", () => {
    const rows = toAuditDriverRows([
      raw({ driver_uuid: "a", pay_currency: "CAD" }),
      raw({ driver_uuid: "b", pay_currency: "USD" }),
    ]);
    expect(rows.map((r) => r.payCurrency)).toEqual(["CAD", "USD"]);
  });
  it("makes an empty or odd currency USD, and tolerates case and spaces", () => {
    const rows = toAuditDriverRows([
      raw({ driver_uuid: "a", pay_currency: null }),
      raw({ driver_uuid: "b", pay_currency: "" }),
      raw({ driver_uuid: "c", pay_currency: "EUR" }),
      raw({ driver_uuid: "d", pay_currency: " cad " }),
    ]);
    expect(rows.map((r) => r.payCurrency)).toEqual(["USD", "USD", "USD", "CAD"]);
  });
  it("keeps the order it was given (R23)", () => {
    const rows = toAuditDriverRows([
      raw({ driver_uuid: "z" }),
      raw({ driver_uuid: "a" }),
      raw({ driver_uuid: "m" }),
    ]);
    expect(rows.map((r) => r.driverUuid)).toEqual(["z", "a", "m"]);
  });
});

describe("filterAuditDriverRows (R6)", () => {
  const row = (id: string, first: string | null, last: string | null): AuditDriverRow => ({
    driverUuid: id,
    firstName: first,
    lastName: last,
    distanceMeters: 0,
    driveMinutes: 0,
    payCents: 0,
    payCurrency: "USD",
    tripCount: 0,
  });
  const rows = [
    row("1", "Ann", "Lee"),
    row("2", "Bob", "Stone"),
    row("3", "Annabel", "Gray"),
    row("4", null, null),
  ];
  const ids = (s: string) => filterAuditDriverRows(rows, s).map((r) => r.driverUuid);

  it("keeps every row for empty text or spaces", () => {
    expect(ids("")).toEqual(["1", "2", "3", "4"]);
    expect(ids("   ")).toEqual(["1", "2", "3", "4"]);
  });
  it("matches the first name, the last name and the full name", () => {
    expect(ids("ann")).toEqual(["1", "3"]);
    expect(ids("stone")).toEqual(["2"]);
    expect(ids("ann lee")).toEqual(["1"]);
  });
  it("ignores case and surrounding spaces", () => {
    expect(ids("  BOB ")).toEqual(["2"]);
  });
  it("matches on a part of a name", () => {
    expect(ids("nab")).toEqual(["3"]);
  });
  it("shows nobody when nothing matches", () => {
    expect(ids("zzz")).toEqual([]);
  });
});
