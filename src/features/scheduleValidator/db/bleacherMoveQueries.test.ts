import { describe, it, expect, vi } from "vitest";

// What is under test is the SQL the builders compile; the Kysely instance is never connected.
vi.mock("@/components/providers/SystemProvider", async () => {
  const { Kysely, SqliteDialect } = await import("kysely");
  return { db: new Kysely<any>({ dialect: new SqliteDialect({ database: {} as any }) }) };
});

import {
  addressesQuery,
  eventNamesQuery,
  weekWorkTrackersQuery,
  workTrackerMapQuery,
} from "./bleacherMoveQueries";

describe("weekWorkTrackersQuery", () => {
  const compiled = weekWorkTrackersQuery("zone-1", "2026-09-14", "2026-09-20");

  it("keeps the zone's bleachers' work trackers dated in the week, not off ones", () => {
    expect(compiled.sql).toContain('"b"."zone_uuid" = ?');
    expect(compiled.sql).toContain('"w"."status" not in');
    expect(compiled.parameters).toEqual(
      expect.arrayContaining(["zone-1", "2026-09-14", "2026-09-20", "cancelled"]),
    );
  });
});

describe("addressesQuery / eventNamesQuery", () => {
  it("look up the given ids, and match nothing for none", () => {
    expect(addressesQuery(["a1"]).parameters).toEqual(["a1"]);
    expect(addressesQuery([]).parameters).toEqual(["__no_match__"]);
    expect(eventNamesQuery([]).parameters).toEqual(["__no_match__"]);
  });
});

describe("workTrackerMapQuery", () => {
  it("joins the driver's home, the pickup and the drop-off for the zone's week", () => {
    const compiled = workTrackerMapQuery("zone-1", "2026-09-14", "2026-09-20");
    expect(compiled.sql).toContain(
      'left join "Addresses" as "ha" on "ha"."id" = "d"."address_uuid"',
    );
    expect(compiled.sql).toContain('"w"."status" not in');
    expect(compiled.parameters).toEqual(expect.arrayContaining(["zone-1", "2026-09-14"]));
  });
});
