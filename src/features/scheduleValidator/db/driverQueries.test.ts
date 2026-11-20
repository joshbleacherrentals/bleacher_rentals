import { describe, it, expect, vi } from "vitest";

// What is under test is the SQL the builders compile; the Kysely instance is never connected.
vi.mock("@/components/providers/SystemProvider", async () => {
  const { Kysely, SqliteDialect } = await import("kysely");
  return { db: new Kysely<any>({ dialect: new SqliteDialect({ database: {} as any }) }) };
});

import {
  driverAvailabilityTripsQuery,
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
