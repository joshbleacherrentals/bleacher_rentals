import { describe, it, expect, vi } from "vitest";

vi.mock("@/components/providers/SystemProvider", async () => {
  const { Kysely, SqliteDialect } = await import("kysely");
  return { db: new Kysely<any>({ dialect: new SqliteDialect({ database: {} as any }) }) };
});

import { activeRunTripQuery, discardRunsStatement, feedbackStatement } from "./runFeedback";

describe("feedbackStatement", () => {
  it("records nothing when no reason was given", () => {
    expect(
      feedbackStatement({ kind: "edit", reason: "   ", runUuid: "r1", userUuid: "u1" }),
    ).toBeNull();
  });

  it("records the trimmed reason with what it is about", () => {
    const stmt = feedbackStatement({
      kind: "delete",
      reason: "  Customer cancelled ",
      runUuid: "r1",
      runTripUuid: "rt1",
      workTrackerUuid: "w1",
      userUuid: "u1",
      id: "f1",
      now: "2026-11-25T12:00:00.000Z",
    })!;
    expect(stmt.sql).toMatch(/^insert into "AutoWorkTrackerFeedback"/);
    expect(stmt.parameters).toEqual([
      "f1",
      "2026-11-25T12:00:00.000Z",
      "u1",
      "r1",
      "rt1",
      "w1",
      "delete",
      "Customer cancelled",
    ]);
  });
});

describe("activeRunTripQuery", () => {
  it("only finds trips of runs that were not discarded", () => {
    expect(activeRunTripQuery("w1").sql).toContain('"r"."discarded_at" is null');
  });
});

describe("discardRunsStatement", () => {
  it("discards only the zone and week's open runs", () => {
    const stmt = discardRunsStatement("z|2026-09-14", "u1", "2026-11-25T12:00:00.000Z");
    expect(stmt.sql).toContain('"discarded_at" is null');
    expect(stmt.parameters).toEqual(["2026-11-25T12:00:00.000Z", "u1", "z|2026-09-14"]);
  });
});
