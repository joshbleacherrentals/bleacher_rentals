import { describe, it, expect, vi } from "vitest";

// What is under test is the SQL the builder compiles; the Kysely instance is never connected.
vi.mock("@/components/providers/SystemProvider", async () => {
  const { Kysely, SqliteDialect } = await import("kysely");
  return { db: new Kysely<any>({ dialect: new SqliteDialect({ database: {} as any }) }) };
});

import { planStatements } from "./writePlan";
import type { PlannedTracker } from "./fromSolve";

const planned = (
  id: string,
  previousId: string | null,
  last: boolean,
  pickupAtEvent = true,
): PlannedTracker => ({
  id,
  trip: {
    bleacherUuid: `b-${id}`,
    bleacherNumber: 1,
    fromStreet: "A",
    toStreet: "B",
    fromAddressUuid: "addr-a",
    toAddressUuid: "addr-b",
    pickupAtEvent,
    fromEventUuid: "e1",
    toEventUuid: "e2",
    availableFrom: "2026-09-15",
    mustArriveBy: "2026-09-17",
    earliestDay: "2026-09-15",
    latestDay: "2026-09-16",
    pickup: [43.1, -80],
    dropoff: [43.2, -80],
  },
  driverUuid: "d1",
  date: "2026-09-15",
  sequence: previousId ? 2 : 1,
  previousId,
  plannedPickupAt: "2026-09-15T07:10:00.000-04:00",
  plannedDropoffAt: "2026-09-15T07:30:00.000-04:00",
  haul: { meters: 15_000, minutes: 15 },
  deadheadIn: { meters: 5_000, minutes: 6 },
  returnHome: last ? { meters: 9_000, minutes: 10 } : null,
});

describe("planStatements", () => {
  const statements = planStatements(
    [planned("w1", null, false), planned("w2", "w1", true, false)],
    [
      {
        workTrackerId: "w1",
        type: "hauling",
        qtyDecimal: 1,
        unitAmtCents: 3060,
        description: "15.0KM × $2.04/KM = $30.60",
        isAutomaticallyManaged: false,
      },
      {
        workTrackerId: "w1",
        type: "setup",
        qtyDecimal: 1,
        unitAmtCents: 5500,
        description: null,
        isAutomaticallyManaged: true,
      },
    ],
    "trip-type",
    "zone-1|2026-09-14",
    () => "line-1",
    "2026-11-22T00:00:00.000Z",
  );

  it("writes the trackers first, in chain order, then the line items", () => {
    expect(statements.map((s) => s.sql.split(" ").slice(0, 3).join(" "))).toEqual([
      'insert into "WorkTrackers"',
      'insert into "WorkTrackers"',
      'insert into "WorkTrackerLineItems"',
      'insert into "WorkTrackerLineItems"',
    ]);
    expect(statements[1].parameters).toContain("w1"); // w2 follows w1
  });

  const column = (i: number, name: string) => {
    const cols = statements[i].sql.match(/\(([^)]*)\) values/)![1].split(", ");
    return statements[i].parameters[cols.indexOf(`"${name}"`)];
  };

  it("sets each tracker's pay to the total of its lines, and leaves it empty without any", () => {
    expect(column(0, "pay_cents")).toBe(3060 + 5500);
    expect(column(1, "pay_cents")).toBeNull();
  });

  it("ticks Setup Required always, and Teardown Required only when picked up from the event", () => {
    expect([column(0, "setup_required"), column(0, "teardown_required")]).toEqual([1, 1]);
    expect([column(1, "setup_required"), column(1, "teardown_required")]).toEqual([1, 0]);
  });

  it("writes a Setup line as the modal does: automatically managed", () => {
    expect(statements[3].parameters).toEqual([
      "line-1",
      "2026-11-22T00:00:00.000Z",
      "w1",
      "setup",
      1,
      5500,
      null,
      1,
    ]);
  });

  it("makes every tracker a Trip", () => {
    expect([column(0, "work_tracker_type_uuid"), column(1, "work_tracker_type_uuid")]).toEqual([
      "trip-type",
      "trip-type",
    ]);
  });

  it("stamps every tracker with the zone and week it was planned for", () => {
    expect([column(0, "auto_work_tracker_id"), column(1, "auto_work_tracker_id")]).toEqual([
      "zone-1|2026-09-14",
      "zone-1|2026-09-14",
    ]);
  });

  it("writes the Hauling line as the modal would", () => {
    expect(statements[2].parameters).toEqual([
      "line-1",
      "2026-11-22T00:00:00.000Z",
      "w1",
      "hauling",
      1,
      3060,
      "15.0KM × $2.04/KM = $30.60",
      0,
    ]);
  });
});
