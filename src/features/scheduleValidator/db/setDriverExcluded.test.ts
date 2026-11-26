import { describe, it, expect, vi } from "vitest";

// What is under test is the SQL the builder compiles; the Kysely instance is never connected.
vi.mock("@/components/providers/SystemProvider", async () => {
  const { Kysely, SqliteDialect } = await import("kysely");
  return { db: new Kysely<any>({ dialect: new SqliteDialect({ database: {} as any }) }) };
});

import { driverExcludedWrite } from "./setDriverExcluded";

describe("driverExcludedWrite", () => {
  it.each([
    [true, 1],
    [false, 0],
  ])("sets the driver's exclusion to %s, stored as %s", (excluded, stored) => {
    const compiled = driverExcludedWrite("d1", excluded);
    expect(compiled.sql).toBe(
      'update "Drivers" set "exclude_from_auto_work_trackers" = ? where "id" = ?',
    );
    expect(compiled.parameters).toEqual([stored, "d1"]);
  });
});
