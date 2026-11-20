import { describe, it, expect, vi } from "vitest";

// What is under test is the SQL the builder compiles; the Kysely instance is never connected.
vi.mock("@/components/providers/SystemProvider", async () => {
  const { Kysely, SqliteDialect } = await import("kysely");
  return { db: new Kysely<any>({ dialect: new SqliteDialect({ database: {} as any }) }) };
});

import { NO_EVENT, eventDataQuery } from "./eventQueries";

describe("eventDataQuery", () => {
  it("looks up the given events with their own address", () => {
    const compiled = eventDataQuery(["e1", "e2"]);
    expect(compiled.sql).toContain('left join "Addresses" as "a" on "a"."id" = "e"."address_uuid"');
    expect(compiled.parameters).toEqual(["e1", "e2"]);
  });

  it("matches nothing when there are no events", () => {
    expect(eventDataQuery([]).parameters).toEqual([NO_EVENT]);
  });
});
