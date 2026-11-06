import { describe, expect, it, beforeEach, vi } from "vitest";
import { DatabaseSync } from "node:sqlite";
import {
  Kysely,
  DummyDriver,
  SqliteAdapter,
  SqliteIntrospector,
  SqliteQueryCompiler,
  type CompiledQuery,
} from "kysely";

// docs/specs/accountant-audit-03-tracker-data.md §5. Same harness as
// workTrackers/db/workTrackerGroupPaid.test.ts: the module compiles its SQL with the app's Kysely
// instance and the compiled text runs against a real SQLite database shaped like the local
// PowerSync one (booleans are 0/1), so this checks what the queries do, not how they are spelled.
const testDb = new Kysely<any>({
  dialect: {
    createAdapter: () => new SqliteAdapter(),
    createDriver: () => new DummyDriver(),
    createIntrospector: (d) => new SqliteIntrospector(d),
    createQueryCompiler: () => new SqliteQueryCompiler(),
  },
});

let sqlite: DatabaseSync;

function run(compiled: CompiledQuery) {
  return sqlite.prepare(compiled.sql).all(...(compiled.parameters as any[])) as any[];
}

vi.mock("@/components/providers/SystemProvider", () => ({
  get db() {
    return testDb;
  },
}));

const { buildAuditTrackersQuery, buildAuditTrackerCountQuery } = await import("./auditTrackers");
const { toAuditRow } = await import("../utils/auditRows");

beforeEach(() => {
  sqlite = new DatabaseSync(":memory:");
  sqlite.exec(`
    create table "WorkTrackers" (
      id text primary key, driver_uuid text, date text, status text,
      pickup_time_start text, bleacher_uuid text, actual_bleacher_uuid text,
      work_tracker_type_uuid text, pickup_address_uuid text, dropoff_address_uuid text,
      worktracker_group_uuid text, drive_minutes integer, distance_meters integer
    );
    create table "WorkTrackerGroups" (
      id text primary key, driver_uuid text, week_start text, week_end text, is_paid integer
    );
    create table "Bleachers" (id text primary key, bleacher_number integer);
    create table "WorkTrackerTypes" (id text primary key, code text, display_name text);
    create table "Addresses" (
      id text primary key, street text, city text, state_province text, zip_postal text
    );
  `);
});

type TrackerSeed = {
  id: string;
  driver?: string;
  date?: string | null;
  status?: string;
  pickupTime?: string | null;
  bleacher?: string | null;
  actualBleacher?: string | null;
  type?: string | null;
  pickup?: string | null;
  dropoff?: string | null;
  group?: string | null;
  minutes?: number | null;
  meters?: number | null;
};

function addTracker(seed: TrackerSeed) {
  const t = {
    driver: "d1",
    date: "2026-09-22" as string | null,
    status: "completed",
    pickupTime: null as string | null,
    bleacher: null as string | null,
    actualBleacher: null as string | null,
    type: null as string | null,
    pickup: null as string | null,
    dropoff: null as string | null,
    group: null as string | null,
    minutes: null as number | null,
    meters: null as number | null,
    ...seed,
  };
  sqlite
    .prepare(
      `insert into "WorkTrackers"
         (id, driver_uuid, date, status, pickup_time_start, bleacher_uuid, actual_bleacher_uuid,
          work_tracker_type_uuid, pickup_address_uuid, dropoff_address_uuid,
          worktracker_group_uuid, drive_minutes, distance_meters)
       values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      t.id,
      t.driver,
      t.date,
      t.status,
      t.pickupTime,
      t.bleacher,
      t.actualBleacher,
      t.type,
      t.pickup,
      t.dropoff,
      t.group,
      t.minutes,
      t.meters,
    );
}

function addGroup(id: string, driver: string, weekStart: string, isPaid: number | null) {
  sqlite
    .prepare(
      `insert into "WorkTrackerGroups" (id, driver_uuid, week_start, week_end, is_paid)
       values (?, ?, ?, '2026-09-27', ?)`,
    )
    .run(id, driver, weekStart, isPaid);
}

function addBleacher(id: string, number: number) {
  sqlite.prepare(`insert into "Bleachers" (id, bleacher_number) values (?, ?)`).run(id, number);
}

function addType(id: string, code: string, displayName: string) {
  sqlite
    .prepare(`insert into "WorkTrackerTypes" (id, code, display_name) values (?, ?, ?)`)
    .run(id, code, displayName);
}

function addAddress(id: string, street: string, city: string) {
  sqlite
    .prepare(
      `insert into "Addresses" (id, street, city, state_province, zip_postal)
       values (?, ?, ?, 'AB', 'T2P 1A1')`,
    )
    .run(id, street, city);
}

const page = (driver: string | null, pageNumber = 1, pageSize = 25) =>
  run(buildAuditTrackersQuery(driver, pageNumber, pageSize)).map(toAuditRow);

const idsOf = (driver: string | null, pageNumber = 1, pageSize = 25) =>
  page(driver, pageNumber, pageSize).map((r) => r.id);

describe("which trackers are listed (D1)", () => {
  it("returns only the chosen driver's trackers", () => {
    addTracker({ id: "a1", driver: "d1" });
    addTracker({ id: "a2", driver: "d1", date: "2026-09-21" });
    addTracker({ id: "b1", driver: "d2" });

    expect(idsOf("d1")).toEqual(["a1", "a2"]);
    expect(idsOf("d2")).toEqual(["b1"]);
  });

  it("lists every status, none filtered out", () => {
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
    statuses.forEach((status, i) => addTracker({ id: `t${i}`, status, date: `2026-09-${10 + i}` }));

    const rows = page("d1");

    expect(rows).toHaveLength(statuses.length);
    expect(rows.map((r) => r.status).sort()).toEqual([...statuses].sort());
  });

  it("carries the columns the table needs (R7: no date window)", () => {
    addType("ty1", "trip", "Trip");
    addBleacher("b1", 12);
    addAddress("a1", "1 Main St", "Calgary");
    addAddress("a2", "9 Lake Rd", "Banff");
    addTracker({
      id: "t1",
      date: "2019-01-02",
      type: "ty1",
      bleacher: "b1",
      pickup: "a1",
      dropoff: "a2",
      minutes: 144,
      meters: 34400,
    });
    addTracker({ id: "t2", date: "2031-12-30" });

    expect(page("d1").find((r) => r.id === "t1")).toEqual({
      id: "t1",
      status: "completed",
      date: "2019-01-02",
      bleacherNumber: 12,
      typeCode: "trip",
      typeName: "Trip",
      pickup: { street: "1 Main St", city: "Calgary", stateProvince: "AB", zipPostal: "T2P 1A1" },
      dropoff: { street: "9 Lake Rd", city: "Banff", stateProvince: "AB", zipPostal: "T2P 1A1" },
      driveMinutes: 144,
      distanceMeters: 34400,
      payment: "none",
    });
    expect(idsOf("d1")).toEqual(["t2", "t1"]);
  });
});

describe("the order (D5, R3)", () => {
  it("puts the newest date first and a tracker with no date at the end", () => {
    addTracker({ id: "old", date: "2026-09-01" });
    addTracker({ id: "nodate", date: null });
    addTracker({ id: "new", date: "2026-09-20" });
    addTracker({ id: "mid", date: "2026-09-10" });

    expect(idsOf("d1")).toEqual(["new", "mid", "old", "nodate"]);
  });

  it("orders one day by pickup time, Any Time (no pickup time) last in the day", () => {
    addTracker({ id: "late", date: "2026-09-20", pickupTime: "14:00:00" });
    addTracker({ id: "any", date: "2026-09-20", pickupTime: null });
    addTracker({ id: "early", date: "2026-09-20", pickupTime: "08:30:00" });
    addTracker({ id: "next-day", date: "2026-09-21", pickupTime: null });

    expect(idsOf("d1")).toEqual(["next-day", "early", "late", "any"]);
  });

  it("breaks ties by id so equal rows never swap places", () => {
    // Inserted against the id order on purpose: only a tie-break on id can put them right.
    addTracker({ id: "b", date: "2026-09-05", pickupTime: "09:00:00" });
    addTracker({ id: "a", date: "2026-09-05", pickupTime: "09:00:00" });
    addTracker({ id: "d", date: "2026-09-05", pickupTime: null });
    addTracker({ id: "c", date: "2026-09-05", pickupTime: null });

    expect(idsOf("d1")).toEqual(["a", "b", "c", "d"]);
  });
});

describe("paging (D6, R3)", () => {
  beforeEach(() => {
    for (let day = 1; day <= 5; day++) addTracker({ id: `t${day}`, date: `2026-09-0${day}` });
    addTracker({ id: "other-1", driver: "d2" });
    addTracker({ id: "other-2", driver: "d2" });
  });

  it("gives pages of 2, 2 and 1 rows over 5 trackers, none twice, none missing", () => {
    const first = idsOf("d1", 1, 2);
    const second = idsOf("d1", 2, 2);
    const third = idsOf("d1", 3, 2);

    expect([first.length, second.length, third.length]).toEqual([2, 2, 1]);
    expect([...first, ...second, ...third]).toEqual(["t5", "t4", "t3", "t2", "t1"]);
  });

  it("gives no rows past the last page", () => {
    expect(idsOf("d1", 4, 2)).toEqual([]);
  });

  it("counts the driver's trackers, not the page and not other drivers'", () => {
    expect(run(buildAuditTrackerCountQuery("d1"))).toEqual([{ total: 5 }]);
    expect(run(buildAuditTrackerCountQuery("d2"))).toEqual([{ total: 2 }]);
    expect(run(buildAuditTrackerCountQuery("nobody"))).toEqual([{ total: 0 }]);
  });
});

describe("Paid / Not paid through the tracker's own group link (D2, R1, R5, A1)", () => {
  it("is paid for a tracker linked to a paid group", () => {
    addGroup("g1", "d1", "2026-09-21", 1);
    addTracker({ id: "t1", group: "g1" });

    expect(page("d1")[0].payment).toBe("paid");
  });

  it("is not_paid for a tracker linked to an unpaid group (is_paid 0)", () => {
    addGroup("g1", "d1", "2026-09-21", 0);
    addTracker({ id: "t1", group: "g1" });

    expect(page("d1")[0].payment).toBe("not_paid");
  });

  it("is not_paid for a tracker linked to a group whose is_paid is null", () => {
    addGroup("g1", "d1", "2026-09-21", null);
    addTracker({ id: "t1", group: "g1" });

    expect(page("d1")[0].payment).toBe("not_paid");
  });

  it("is none for a tracker with a null worktracker_group_uuid (no date)", () => {
    addGroup("g1", "d1", "2026-09-21", 1);
    addTracker({ id: "t1", date: null, group: null });

    expect(page("d1")[0].payment).toBe("none");
  });

  it("is none for a tracker whose group row is not on the device", () => {
    addGroup("g1", "d1", "2026-09-21", 1);
    addTracker({ id: "t1", group: "g-missing" });

    expect(page("d1")[0].payment).toBe("none");
  });

  it("follows the linked group and nothing else", () => {
    // A paid group of the same driver and week that the tracker is not linked to.
    addGroup("g-paid", "d1", "2026-09-21", 1);
    addGroup("g-linked", "d1", "2026-09-21", 0);
    addTracker({ id: "t1", date: "2026-09-22", group: "g-linked" });
    // No link at all, although a paid group of its driver and week exists.
    addTracker({ id: "t2", date: "2026-09-23", group: null });

    const byId = Object.fromEntries(page("d1").map((r) => [r.id, r.payment]));
    expect(byId).toEqual({ t1: "not_paid", t2: "none" });
  });

  it("gives two trackers linked to one group the same status, without repeating a row", () => {
    addGroup("g1", "d1", "2026-09-21", 1);
    addTracker({ id: "t1", date: "2026-09-22", group: "g1" });
    addTracker({ id: "t2", date: "2026-09-23", group: "g1" });

    const rows = page("d1");
    expect(rows.map((r) => [r.id, r.payment])).toEqual([
      ["t2", "paid"],
      ["t1", "paid"],
    ]);
  });
});

describe("the bleacher (D3)", () => {
  it("is the assigned one, even when the driver confirmed another", () => {
    addBleacher("b-assigned", 7);
    addBleacher("b-actual", 9);
    addTracker({ id: "t1", bleacher: "b-assigned", actualBleacher: "b-actual" });

    expect(page("d1")[0].bleacherNumber).toBe(7);
  });
});

describe("a missing part leaves the tracker listed (R6)", () => {
  it("lists a tracker whose type, bleacher and address rows are missing, with nulls", () => {
    addTracker({
      id: "t1",
      type: "ty-gone",
      bleacher: "b-gone",
      pickup: "a-gone",
      dropoff: "a-gone-too",
    });

    expect(page("d1")).toEqual([
      {
        id: "t1",
        status: "completed",
        date: "2026-09-22",
        bleacherNumber: null,
        typeCode: null,
        typeName: null,
        pickup: null,
        dropoff: null,
        driveMinutes: null,
        distanceMeters: null,
        payment: "none",
      },
    ]);
  });

  it("lists a tracker with no links at all", () => {
    addTracker({ id: "t1" });

    expect(idsOf("d1")).toEqual(["t1"]);
  });

  it("keeps a present address when the other one is missing", () => {
    addAddress("a1", "1 Main St", "Calgary");
    addTracker({ id: "t1", pickup: "a1", dropoff: "a-gone" });

    const [row] = page("d1");
    expect(row.pickup).toMatchObject({ street: "1 Main St" });
    expect(row.dropoff).toBeNull();
  });
});

describe("no driver chosen", () => {
  it("returns no rows and a count of 0 for the sentinel driver", () => {
    addTracker({ id: "t1", driver: "d1" });

    expect(run(buildAuditTrackersQuery(null, 1, 25))).toEqual([]);
    expect(run(buildAuditTrackerCountQuery(null))).toEqual([{ total: 0 }]);
  });
});
