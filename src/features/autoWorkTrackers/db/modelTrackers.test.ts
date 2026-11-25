import { describe, it, expect, vi } from "vitest";

// What is under test is the SQL the builder compiles; the Kysely instance is never connected.
vi.mock("@/components/providers/SystemProvider", async () => {
  const { Kysely, SqliteDialect } = await import("kysely");
  return { db: new Kysely<any>({ dialect: new SqliteDialect({ database: {} as any }) }) };
});

import { deleteModelDraftsStatements, weekTrackersQuery } from "./modelTrackers";

const key = "zone-1|2026-09-14";

describe("deleteModelDraftsStatements", () => {
  const [lines, trackers] = deleteModelDraftsStatements(key);

  it("deletes the line items first, then the trackers", () => {
    expect(lines.sql).toMatch(/^delete from "WorkTrackerLineItems"/);
    expect(trackers.sql).toMatch(/^delete from "WorkTrackers"/);
  });

  it("only touches drafts still carrying the key", () => {
    for (const s of [lines, trackers]) {
      expect(s.sql).toContain('"auto_work_tracker_id" = ?');
      expect(s.sql).toContain('"status" = ?');
      expect(s.parameters).toEqual([key, "draft"]);
    }
  });
});

describe("weekTrackersQuery", () => {
  it("takes the model's trackers by key, and the zone's live trackers dated in the week", () => {
    const q = weekTrackersQuery("zone-1", "2026-09-14", key);
    expect(q.parameters.slice(0, 5)).toEqual([key, "zone-1", 0, "2026-09-14", "2026-09-20"]);
  });
});
