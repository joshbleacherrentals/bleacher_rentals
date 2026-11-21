import { describe, it, expect, vi } from "vitest";

// What is under test is the SQL the builders compile; the Kysely instance is never connected.
vi.mock("@/components/providers/SystemProvider", async () => {
  const { Kysely, SqliteDialect } = await import("kysely");
  return { db: new Kysely<any>({ dialect: new SqliteDialect({ database: {} as any }) }) };
});

import { driverNameQuery, driverScheduleQuery } from "./driverScheduleQuery";

describe("driverScheduleQuery", () => {
  const compiled = driverScheduleQuery("u1", "2026-09-14", "2026-09-20");

  it("finds the driver's week by their user, leaving out work trackers that are off", () => {
    expect(compiled.sql).toContain('"d"."user_uuid" = ?');
    expect(compiled.sql).toContain('"w"."status" not in');
    expect(compiled.parameters).toEqual(
      expect.arrayContaining(["u1", "2026-09-14", "2026-09-20", "cancelled"]),
    );
  });

  it("joins the driver's home for the route map", () => {
    expect(compiled.sql).toContain(
      'left join "Addresses" as "ha" on "ha"."id" = "d"."address_uuid"',
    );
  });

  it("reads the planned times and every leg's minutes", () => {
    for (const column of [
      "planned_pickup_at",
      "planned_dropoff_at",
      "deadhead_in_drive_minutes",
      "return_home_drive_minutes",
      "previous_work_tracker_uuid",
    ]) {
      expect(compiled.sql).toContain(`"w"."${column}"`);
    }
  });
});

describe("driverNameQuery", () => {
  it("looks the user up by id", () => {
    expect(driverNameQuery("u1").parameters).toEqual(["u1"]);
  });
});
