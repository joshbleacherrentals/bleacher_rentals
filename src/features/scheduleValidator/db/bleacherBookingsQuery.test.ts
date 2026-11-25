import { describe, it, expect, vi } from "vitest";

// What is under test is the SQL the builder compiles; the Kysely instance is never connected.
vi.mock("@/components/providers/SystemProvider", async () => {
  const { Kysely, SqliteDialect } = await import("kysely");
  return { db: new Kysely<any>({ dialect: new SqliteDialect({ database: {} as any }) }) };
});

import { bleacherBookingsQuery } from "./bleacherBookingsQuery";

describe("bleacherBookingsQuery", () => {
  const compiled = bleacherBookingsQuery("zone-1", "2026-09-14");

  it("keeps only bleachers assigned to the zone", () => {
    expect(compiled.sql).toContain('"b"."zone_uuid" = ?');
    expect(compiled.parameters).toContain("zone-1");
  });

  it("looks a day either side of the week for events that run into it", () => {
    expect(compiled.parameters).toContain("2026-09-13");
    expect(compiled.parameters).toContain("2026-09-22");
  });
});
