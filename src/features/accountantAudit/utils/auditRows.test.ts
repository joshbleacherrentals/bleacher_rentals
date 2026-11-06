import { describe, expect, it } from "vitest";
import { clampPage, resolvePayment, toAuditRow, type AuditTrackerResultRow } from "./auditRows";

// docs/specs/accountant-audit-03-tracker-data.md §3 and §5.

describe("resolvePayment (D2, R5, A1)", () => {
  it("is none when the tracker has no group, whatever is_paid says", () => {
    expect(resolvePayment(null, null)).toBe("none");
    expect(resolvePayment(null, 1)).toBe("none");
    expect(resolvePayment(null, 0)).toBe("none");
  });

  it("is paid for a group marked paid", () => {
    expect(resolvePayment("g1", 1)).toBe("paid");
  });

  it("is not_paid for a group marked unpaid", () => {
    expect(resolvePayment("g1", 0)).toBe("not_paid");
  });

  it("is not_paid for a group synced before the column existed (null)", () => {
    expect(resolvePayment("g1", null)).toBe("not_paid");
  });
});

describe("clampPage (R4)", () => {
  it("raises a page below 1 to page 1", () => {
    expect(clampPage(0, 100, 25)).toBe(1);
    expect(clampPage(-4, 100, 25)).toBe(1);
  });

  it("keeps a page inside the range", () => {
    expect(clampPage(2, 100, 25)).toBe(2);
  });

  it("keeps exactly the last page", () => {
    expect(clampPage(2, 4, 2)).toBe(2);
    expect(clampPage(3, 5, 2)).toBe(3);
  });

  it("pulls a page past the end back to the last page", () => {
    expect(clampPage(3, 4, 2)).toBe(2);
    expect(clampPage(9, 5, 2)).toBe(3);
  });

  it("gives page 1 when there is nothing to page (total 0)", () => {
    expect(clampPage(1, 0, 25)).toBe(1);
    expect(clampPage(5, 0, 25)).toBe(1);
  });

  it("only raises the page to 1 while the total is still loading (undefined)", () => {
    expect(clampPage(7, undefined, 25)).toBe(7);
    expect(clampPage(0, undefined, 25)).toBe(1);
    expect(clampPage(-3, undefined, 25)).toBe(1);
  });
});

const fullRow: AuditTrackerResultRow = {
  id: "t1",
  status: "completed",
  date: "2026-09-22",
  bleacher_number: 12,
  type_code: "trip",
  type_name: "Trip",
  pickup_id: "a1",
  pickup_street: "1 Main St",
  pickup_city: "Calgary",
  pickup_state_province: "AB",
  pickup_zip_postal: "T2P 1A1",
  dropoff_id: "a2",
  dropoff_street: "9 Lake Rd",
  dropoff_city: "Banff",
  dropoff_state_province: "AB",
  dropoff_zip_postal: "T1L 1A1",
  drive_minutes: 144,
  distance_meters: 34400,
  group_id: "g1",
  group_is_paid: 1,
};

describe("toAuditRow", () => {
  it("maps a full result row", () => {
    expect(toAuditRow(fullRow)).toEqual({
      id: "t1",
      status: "completed",
      date: "2026-09-22",
      bleacherNumber: 12,
      typeCode: "trip",
      typeName: "Trip",
      pickup: {
        street: "1 Main St",
        city: "Calgary",
        stateProvince: "AB",
        zipPostal: "T2P 1A1",
      },
      dropoff: {
        street: "9 Lake Rd",
        city: "Banff",
        stateProvince: "AB",
        zipPostal: "T1L 1A1",
      },
      driveMinutes: 144,
      distanceMeters: 34400,
      payment: "paid",
    });
  });

  it("gives null addresses when the address ids are null", () => {
    const row = toAuditRow({
      ...fullRow,
      pickup_id: null,
      pickup_street: null,
      pickup_city: null,
      pickup_state_province: null,
      pickup_zip_postal: null,
      dropoff_id: null,
      dropoff_street: null,
      dropoff_city: null,
      dropoff_state_province: null,
      dropoff_zip_postal: null,
    });

    expect(row.pickup).toBeNull();
    expect(row.dropoff).toBeNull();
  });

  it("keeps one address when the other is missing", () => {
    const row = toAuditRow({
      ...fullRow,
      dropoff_id: null,
      dropoff_street: null,
      dropoff_city: null,
      dropoff_state_province: null,
      dropoff_zip_postal: null,
    });

    expect(row.pickup).toEqual({
      street: "1 Main St",
      city: "Calgary",
      stateProvince: "AB",
      zipPostal: "T2P 1A1",
    });
    expect(row.dropoff).toBeNull();
  });

  it("reads the payment from the group columns (D2, R5)", () => {
    expect(toAuditRow({ ...fullRow, group_id: null, group_is_paid: null }).payment).toBe("none");
    expect(toAuditRow({ ...fullRow, group_is_paid: 0 }).payment).toBe("not_paid");
    expect(toAuditRow({ ...fullRow, group_is_paid: null }).payment).toBe("not_paid");
  });

  it("keeps null parts null (R6)", () => {
    const row = toAuditRow({
      ...fullRow,
      date: null,
      bleacher_number: null,
      type_code: null,
      type_name: null,
      drive_minutes: null,
      distance_meters: null,
    });

    expect(row).toMatchObject({
      date: null,
      bleacherNumber: null,
      typeCode: null,
      typeName: null,
      driveMinutes: null,
      distanceMeters: null,
    });
  });
});
