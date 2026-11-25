import { describe, it, expect, vi } from "vitest";

// What is under test is the SQL the builder compiles; the Kysely instance is never connected.
vi.mock("@/components/providers/SystemProvider", async () => {
  const { Kysely, SqliteDialect } = await import("kysely");
  return { db: new Kysely<any>({ dialect: new SqliteDialect({ database: {} as any }) }) };
});

import { runStatements, tripSnapshots } from "./runLog";
import { DEFAULT_SETTINGS } from "./settings";
import type { PlanRows } from "./writePlan";

const rows = {
  trackers: [
    { id: "w1", driver_uuid: "d1", pay_cents: 3060 },
    { id: "w2", driver_uuid: "d1", pay_cents: null },
  ],
  lineItems: [{ id: "l1", work_tracker_uuid: "w1", type: "hauling", unit_amt_cents: 3060 }],
} as unknown as PlanRows;

describe("tripSnapshots", () => {
  it("keeps each tracker's values and its own line items, as inserted", () => {
    expect(tripSnapshots(rows)).toEqual([
      {
        workTrackerUuid: "w1",
        snapshot: { tracker: rows.trackers[0], lineItems: [rows.lineItems[0]] },
      },
      { workTrackerUuid: "w2", snapshot: { tracker: rows.trackers[1], lineItems: [] } },
    ]);
  });
});

describe("runStatements", () => {
  let n = 0;
  const log = runStatements(
    {
      id: "run-1",
      createdAt: "2026-11-25T12:00:00.000Z",
      createdByUserUuid: "u1",
      zoneUuid: "z1",
      weekStart: "2026-09-14",
      autoKey: "z1|2026-09-14",
      settings: DEFAULT_SETTINGS,
      result: { created: 2 },
    },
    rows,
    { appVersion: "1.28.0", commitSha: "abc1234" },
    () => `trip-${++n}`,
  );

  it("records the run with its version, commit, settings and how many trips it made", () => {
    expect(log.run.sql).toMatch(/^insert into "AutoWorkTrackerRuns"/);
    expect(log.run.parameters).toEqual(
      expect.arrayContaining([
        "run-1",
        "z1|2026-09-14",
        "1.28.0",
        "abc1234",
        JSON.stringify(DEFAULT_SETTINGS),
        2,
      ]),
    );
  });

  it("writes a snapshot row per tracker, linked to the run", () => {
    expect(log.trips).toHaveLength(2);
    expect(log.trips[0].parameters).toEqual(
      expect.arrayContaining([
        "trip-1",
        "run-1",
        "w1",
        JSON.stringify(tripSnapshots(rows)[0].snapshot),
      ]),
    );
  });
});
