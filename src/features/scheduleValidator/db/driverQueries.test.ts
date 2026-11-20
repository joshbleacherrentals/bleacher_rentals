import { describe, it, expect, vi } from "vitest";

// What is under test is the SQL the builders compile; the Kysely instance is never connected.
vi.mock("@/components/providers/SystemProvider", async () => {
  const { Kysely, SqliteDialect } = await import("kysely");
  return { db: new Kysely<any>({ dialect: new SqliteDialect({ database: {} as any }) }) };
});

import {
  driverAvailabilityTripsQuery,
  driverDataQuery,
  managesZoneQuery,
  driverUserUuidsQuery,
  driverUnavailabilityQuery,
  driverWorkloadQuery,
} from "./driverQueries";

const ZONE_FILTER =
  /in \(select "dz"\."driver_uuid" from "DriverZones" as "dz" where "dz"\."zone_uuid" = \?\)/;

describe.each([
  ["driverWorkloadQuery", driverWorkloadQuery, '"w"."driver_uuid"'],
  ["driverAvailabilityTripsQuery", driverAvailabilityTripsQuery, '"w"."driver_uuid"'],
  ["driverUnavailabilityQuery", driverUnavailabilityQuery, '"du"."driver_uuid"'],
])("%s", (_name, build, driverColumn) => {
  const compiled = build("zone-1", "2026-09-14", "2026-09-20");

  it("keeps only drivers linked to the zone", () => {
    expect(compiled.sql).toContain(`${driverColumn} in (select`);
    expect(compiled.sql).toMatch(ZONE_FILTER);
    expect(compiled.parameters).toContain("zone-1");
  });

  it("stays inside the week", () => {
    expect(compiled.parameters).toContain("2026-09-14");
    expect(compiled.parameters).toContain("2026-09-20");
  });
});

describe("driverDataQuery", () => {
  const compiled = driverDataQuery("zone-1");

  it("keeps only active drivers linked to the zone", () => {
    expect(compiled.sql).toContain('"d"."id" in (select');
    expect(compiled.sql).toMatch(ZONE_FILTER);
    expect(compiled.sql).toContain('"d"."is_active" = ?');
    expect(compiled.parameters).toEqual([1, "zone-1"]);
  });

  it("keeps drivers with no address (left join)", () => {
    expect(compiled.sql).toContain('left join "Addresses" as "a"');
  });
});

describe("managesZoneQuery", () => {
  it("looks for the account manager's link to the zone", () => {
    const compiled = managesZoneQuery("am-1", "zone-1");
    expect(compiled.sql).toContain('from "AccountManagerZones" as "amz"');
    expect(compiled.parameters).toEqual(["am-1", "zone-1", 1]);
  });
});

describe("driverDataQuery exclusion", () => {
  it("reads whether each driver is excluded from the model", () => {
    expect(driverDataQuery("zone-1").sql).toContain('"d"."exclude_from_auto_work_trackers"');
  });
});

describe("driverUserUuidsQuery", () => {
  it("maps the zone's drivers to their users", () => {
    const compiled = driverUserUuidsQuery("zone-1");
    expect(compiled.sql).toContain('"d"."user_uuid"');
    expect(compiled.sql).toMatch(ZONE_FILTER);
  });
});
