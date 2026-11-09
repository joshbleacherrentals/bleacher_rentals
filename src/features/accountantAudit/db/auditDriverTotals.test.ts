import { beforeEach, describe, expect, it, vi } from "vitest";
import { DatabaseSync } from "node:sqlite";
import {
  DummyDriver,
  Kysely,
  SqliteAdapter,
  SqliteIntrospector,
  SqliteQueryCompiler,
} from "kysely";

// docs/specs/accountant-audit-05-drivers-table.md §2.2, §4 (D1, D2, D15, R16). The same harness as
// auditTrackers.test.ts: the module compiles its SQL with the app's Kysely instance, behind the
// same bound proxy the app uses, and the text runs on a real SQLite database.
const testDb = new Kysely<any>({
  dialect: {
    createAdapter: () => new SqliteAdapter(),
    createDriver: () => new DummyDriver(),
    createIntrospector: (d) => new SqliteIntrospector(d),
    createQueryCompiler: () => new SqliteQueryCompiler(),
  },
});
const boundDb = new Proxy({} as Kysely<any>, {
  get(_target, prop) {
    const value = (testDb as any)[prop];
    return typeof value === "function" ? value.bind(testDb) : value;
  },
});
vi.mock("@/components/providers/SystemProvider", () => ({
  get db() {
    return boundDb;
  },
}));

const { buildAuditDriverTotalsQuery } = await import("./auditDriverTotals");
const { toAuditDriverRows } = await import("../utils/auditDriverRows");

let sqlite: DatabaseSync;
type Range = { from: string | null; to: string | null };
const ALL: Range = { from: null, to: null };

const totals = (range: Range = ALL) => {
  const compiled = buildAuditDriverTotalsQuery(range).compile();
  const raw = sqlite.prepare(compiled.sql).all(...(compiled.parameters as any[])) as any[];
  return toAuditDriverRows(raw);
};
const byDriver = (range: Range = ALL) =>
  Object.fromEntries(totals(range).map((r) => [r.driverUuid, r]));

beforeEach(() => {
  sqlite = new DatabaseSync(":memory:");
  sqlite.exec(`
    create table "WorkTrackers" (
      id text primary key, driver_uuid text, date text, status text,
      distance_meters integer, drive_minutes integer, pay_cents integer
    );
    create table "Drivers" (id text primary key, user_uuid text, pay_currency text);
    create table "Users" (id text primary key, first_name text, last_name text);
    insert into "Users" values ('u1', 'Ann', 'Lee'), ('u2', 'Bob', 'Stone'), ('u3', 'Cy', 'Park');
    insert into "Drivers" values ('d1', 'u1', 'USD'), ('d2', 'u2', 'CAD'), ('d3', 'u3', null);
  `);
});

type Seed = {
  id: string;
  driver?: string | null;
  date?: string | null;
  status?: string;
  meters?: number | null;
  minutes?: number | null;
  cents?: number | null;
};
function addTracker(seed: Seed) {
  const t = {
    driver: "d1" as string | null,
    date: "2026-11-10" as string | null,
    status: "completed",
    meters: 1000 as number | null,
    minutes: 10 as number | null,
    cents: 5000 as number | null,
    ...seed,
  };
  sqlite
    .prepare(
      `insert into "WorkTrackers" (id, driver_uuid, date, status, distance_meters, drive_minutes, pay_cents)
       values (?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(t.id, t.driver, t.date, t.status, t.meters, t.minutes, t.cents);
}

describe("the sums of a driver", () => {
  it("adds distance, drive time and pay, and counts one trip per tracker", () => {
    addTracker({ id: "a", meters: 1000, minutes: 10, cents: 5000 });
    addTracker({ id: "b", meters: 2500, minutes: 25, cents: 7500 });

    expect(totals()).toEqual([
      {
        driverUuid: "d1",
        firstName: "Ann",
        lastName: "Lee",
        distanceMeters: 3500,
        driveMinutes: 35,
        payCents: 12500,
        payCurrency: "USD",
        tripCount: 2,
      },
    ]);
  });

  it("gives one row per driver, with the driver's own currency (D17)", () => {
    addTracker({ id: "a", driver: "d1" });
    addTracker({ id: "b", driver: "d2" });
    addTracker({ id: "c", driver: "d3" });

    const rows = byDriver();
    expect(Object.keys(rows).sort()).toEqual(["d1", "d2", "d3"]);
    expect(rows.d1.payCurrency).toBe("USD");
    expect(rows.d2.payCurrency).toBe("CAD");
    expect(rows.d3.payCurrency).toBe("USD"); // empty currency counts as USD
  });

  it("counts a null metric as 0", () => {
    addTracker({ id: "a", meters: null, minutes: null, cents: null });
    addTracker({ id: "b", meters: 400, minutes: null, cents: 100 });

    expect(byDriver().d1).toMatchObject({
      distanceMeters: 400,
      driveMinutes: 0,
      payCents: 100,
      tripCount: 2,
    });
  });

  it("returns a driver with only null metrics, as zeros, with their trips", () => {
    addTracker({ id: "a", meters: null, minutes: null, cents: null });

    expect(byDriver().d1).toMatchObject({
      distanceMeters: 0,
      driveMinutes: 0,
      payCents: 0,
      tripCount: 1,
    });
  });
});

describe("which trackers count (D1, D15)", () => {
  it("counts every status", () => {
    const statuses = [
      "draft",
      "released",
      "accepted",
      "dest_pickup",
      "pickup_inspection",
      "dest_dropoff",
      "dropoff_inspection",
      "completed",
      "cancelled",
      "declined",
      "abandoned",
    ];
    statuses.forEach((status, i) => addTracker({ id: `t${i}`, status }));

    expect(byDriver().d1.tripCount).toBe(statuses.length);
  });

  it("leaves out a tracker with no date", () => {
    addTracker({ id: "a" });
    addTracker({ id: "b", date: null, meters: 9999, cents: 9999 });

    expect(byDriver().d1).toMatchObject({ tripCount: 1, distanceMeters: 1000, payCents: 5000 });
  });

  it("leaves out a tracker with no driver", () => {
    addTracker({ id: "a", driver: null });

    expect(totals()).toEqual([]);
  });

  it("leaves out a tracker whose driver has no Drivers row", () => {
    addTracker({ id: "a", driver: "ghost" });

    expect(totals()).toEqual([]);
  });

  it("leaves out a tracker whose driver's user row is missing", () => {
    sqlite.exec(`insert into "Drivers" values ('d9', 'u-gone', 'USD')`);
    addTracker({ id: "a", driver: "d9" });

    expect(totals()).toEqual([]);
  });
});

describe("the range (R7)", () => {
  beforeEach(() => {
    addTracker({ id: "before", date: "2026-10-31" });
    addTracker({ id: "first", date: "2026-11-01" });
    addTracker({ id: "mid", date: "2026-11-15" });
    addTracker({ id: "last", date: "2026-11-30" });
    addTracker({ id: "after", date: "2026-12-01" });
  });
  const trips = (range: Range) => byDriver(range).d1?.tripCount ?? 0;

  it("includes both ends", () => {
    expect(trips({ from: "2026-11-01", to: "2026-11-30" })).toBe(3);
  });
  it("a one-day range gives that day", () => {
    expect(trips({ from: "2026-11-15", to: "2026-11-15" })).toBe(1);
  });
  it("with only From, there is no upper limit", () => {
    expect(trips({ from: "2026-11-15", to: null })).toBe(3);
  });
  it("with only To, there is no lower limit", () => {
    expect(trips({ from: null, to: "2026-11-01" })).toBe(2);
  });
  it("with neither end, every dated tracker counts (All time)", () => {
    expect(trips(ALL)).toBe(5);
  });
  it("gives no row for a driver with nothing in the range (D2)", () => {
    addTracker({ id: "other", driver: "d2", date: "2025-01-01" });

    const rows = byDriver({ from: "2026-11-01", to: "2026-11-30" });
    expect(Object.keys(rows)).toEqual(["d1"]);
  });
  it("an inverted range gives nothing", () => {
    expect(totals({ from: "2026-11-30", to: "2026-11-01" })).toEqual([]);
  });
});

describe("parity with the scorecard's rule", () => {
  it("one whole year's range gives, per driver, the sums of the trigger's rule for that year", () => {
    // The trigger's bucket: sum and count of the trackers of (driver, year of date), driver and
    // date not null, any status. The expected values are computed here from the same fixture.
    const fixture: Seed[] = [
      { id: "1", driver: "d1", date: "2025-12-31", meters: 111, minutes: 1, cents: 10 },
      { id: "2", driver: "d1", date: "2026-01-01", meters: 222, minutes: 2, cents: 20 },
      {
        id: "3",
        driver: "d1",
        date: "2026-06-15",
        meters: 333,
        minutes: 3,
        cents: 30,
        status: "draft",
      },
      { id: "4", driver: "d1", date: "2026-12-31", meters: 444, minutes: 4, cents: 40 },
      { id: "5", driver: "d1", date: "2027-01-01", meters: 555, minutes: 5, cents: 50 },
      { id: "6", driver: "d2", date: "2026-03-03", meters: 1000, minutes: 10, cents: 100 },
      { id: "7", driver: "d2", date: null, meters: 7777, minutes: 77, cents: 777 },
    ];
    fixture.forEach(addTracker);

    const year = "2026";
    const expected: Record<string, { m: number; min: number; c: number; n: number }> = {};
    for (const t of fixture) {
      if (!t.driver || !t.date || !t.date.startsWith(year)) continue;
      const e = (expected[t.driver] ??= { m: 0, min: 0, c: 0, n: 0 });
      e.m += t.meters ?? 0;
      e.min += t.minutes ?? 0;
      e.c += t.cents ?? 0;
      e.n += 1;
    }

    const rows = byDriver({ from: `${year}-01-01`, to: `${year}-12-31` });
    expect(Object.keys(rows).sort()).toEqual(Object.keys(expected).sort());
    for (const [driver, e] of Object.entries(expected)) {
      expect(rows[driver]).toMatchObject({
        distanceMeters: e.m,
        driveMinutes: e.min,
        payCents: e.c,
        tripCount: e.n,
      });
    }
  });
});
