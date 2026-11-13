import { describe, it, expect } from "vitest";
import type { AuditDriverRow } from "./auditDriverRows";
import type { AuditTrackerRow } from "./auditRows";
import {
  AUDIT_DRIVERS_CSV_HEADERS,
  AUDIT_TRACKERS_CSV_HEADERS,
  auditDriversCsvPrefix,
  auditTrackersCsvPrefix,
  buildAuditDriversCsv,
  buildAuditTrackersCsv,
} from "./auditCsv";

const BOM = "﻿";
const lines = (csv: string) => csv.replace(BOM, "").split("\r\n");

function driver(overrides: Partial<AuditDriverRow> = {}): AuditDriverRow {
  return {
    driverUuid: "d1",
    firstName: "Ada",
    lastName: "Lovelace",
    distanceMeters: 1609,
    driveMinutes: 125,
    payCents: 123400,
    payCurrency: "USD",
    tripCount: 7,
    ...overrides,
  };
}

describe("buildAuditDriversCsv", () => {
  it("uses the drivers table's columns", () => {
    expect(AUDIT_DRIVERS_CSV_HEADERS).toEqual(["Driver", "Distance", "Drive Time", "Trips", "Pay"]);
    expect(lines(buildAuditDriversCsv([]))).toEqual([AUDIT_DRIVERS_CSV_HEADERS.join(",")]);
  });

  it("writes each cell as the table shows it", () => {
    const [, line] = lines(buildAuditDriversCsv([driver()]));
    expect(line).toBe('Ada Lovelace,1.6 km/1.0 mi,2h 5m,7,"$1,234.00 USD"');
  });

  it("keeps the driver's own currency", () => {
    const [, line] = lines(buildAuditDriversCsv([driver({ payCurrency: "CAD", payCents: 56700 })]));
    expect(line.endsWith(",$567.00 CAD")).toBe(true);
  });

  it("leaves Drive Time empty when there is none", () => {
    const [, line] = lines(buildAuditDriversCsv([driver({ driveMinutes: 0 })]));
    expect(line).toContain(",1.6 km/1.0 mi,,7,");
  });

  it("names a driver with no name Unknown Driver, and one with a single name by it", () => {
    const [, none, first] = lines(
      buildAuditDriversCsv([
        driver({ firstName: null, lastName: null }),
        driver({ firstName: "Cher", lastName: null }),
      ]),
    );
    expect(none.startsWith("Unknown Driver,")).toBe(true);
    expect(first.startsWith("Cher,")).toBe(true);
  });

  it("keeps the order it is given", () => {
    const [, a, b] = lines(
      buildAuditDriversCsv([driver({ firstName: "Zed" }), driver({ firstName: "Abe" })]),
    );
    expect(a.startsWith("Zed ")).toBe(true);
    expect(b.startsWith("Abe ")).toBe(true);
  });
});

function tracker(overrides: Partial<AuditTrackerRow> = {}): AuditTrackerRow {
  return {
    id: "w1",
    status: "completed",
    date: "2026-09-21",
    bleacherNumber: 12,
    typeCode: "pickup",
    typeName: "Pickup",
    pickup: { street: "1 Main St", city: "Calgary", stateProvince: "AB", zipPostal: "T2P 1A1" },
    dropoff: { street: "9 Elm Ave", city: "Airdrie", stateProvince: "AB", zipPostal: null },
    driveMinutes: 90,
    distanceMeters: 16093,
    payment: "paid",
    ...overrides,
  };
}

describe("buildAuditTrackersCsv", () => {
  it("uses the driver page's nine columns", () => {
    expect(AUDIT_TRACKERS_CSV_HEADERS).toEqual([
      "Status",
      "Date",
      "Bleacher",
      "Type",
      "Pickup location",
      "Dropoff location",
      "Drive time",
      "Distance",
      "Payment status",
    ]);
    expect(lines(buildAuditTrackersCsv([]))).toEqual([AUDIT_TRACKERS_CSV_HEADERS.join(",")]);
  });

  it("writes each cell as the table shows it, a location on one line", () => {
    const [, line] = lines(buildAuditTrackersCsv([tracker()]));
    expect(line).toBe(
      'Completed,2026-09-21,12,Pickup,"1 Main St, Calgary, AB T2P 1A1","9 Elm Ave, Airdrie, AB",1.5 hrs,10.0 mi (16.1 km),Paid',
    );
  });

  it("says Not paid for a tracker in an unpaid week", () => {
    const [, line] = lines(buildAuditTrackersCsv([tracker({ payment: "not_paid" })]));
    expect(line.endsWith(",Not paid")).toBe(true);
  });

  it("words the status as the badge does", () => {
    const [, line] = lines(buildAuditTrackersCsv([tracker({ status: "dest_pickup" })]));
    expect(line.startsWith("In Progress,")).toBe(true);
  });

  it("leaves every missing value empty", () => {
    const [, line] = lines(
      buildAuditTrackersCsv([
        tracker({
          date: null,
          bleacherNumber: null,
          typeName: null,
          pickup: null,
          dropoff: null,
          driveMinutes: null,
          distanceMeters: null,
          payment: "none",
        }),
      ]),
    );
    expect(line).toBe("Completed,,,,,,,,");
  });

  it("defuses a street that a spreadsheet would run as a formula", () => {
    const [, line] = lines(
      buildAuditTrackersCsv([
        tracker({ pickup: { street: "=1+1", city: null, stateProvince: null, zipPostal: null } }),
      ]),
    );
    expect(line).toContain(",'=1+1,");
  });
});

describe("the file names", () => {
  const range = { from: "2026-10-01", to: "2026-10-31" };

  it("name the range of the drivers table, since the file does not say it", () => {
    expect(auditDriversCsvPrefix(range)).toBe("accountant-audit-drivers-2026-10-01-to-2026-10-31");
    expect(auditDriversCsvPrefix({ from: null, to: null })).toBe(
      "accountant-audit-drivers-all-time",
    );
    expect(auditDriversCsvPrefix({ from: "2026-10-01", to: null })).toBe(
      "accountant-audit-drivers-from-2026-10-01",
    );
    expect(auditDriversCsvPrefix({ from: null, to: "2026-10-31" })).toBe(
      "accountant-audit-drivers-until-2026-10-31",
    );
  });

  it("name the driver and the range of a driver's trackers", () => {
    expect(auditTrackersCsvPrefix("Ada Lovelace", range)).toBe(
      "accountant-audit-ada-lovelace-2026-10-01-to-2026-10-31",
    );
  });

  it("keep a driver's name safe in a file name", () => {
    expect(auditTrackersCsvPrefix("José Núñez / Jr.", range)).toBe(
      "accountant-audit-jose-nunez-jr-2026-10-01-to-2026-10-31",
    );
    expect(auditTrackersCsvPrefix("", range)).toBe(
      "accountant-audit-driver-2026-10-01-to-2026-10-31",
    );
  });
});
