import { beforeEach, describe, expect, it, vi } from "vitest";
import { DatabaseSync } from "node:sqlite";
import {
  DummyDriver,
  Kysely,
  SqliteAdapter,
  SqliteIntrospector,
  SqliteQueryCompiler,
  type CompiledQuery,
} from "kysely";

const testDb = new Kysely<any>({
  dialect: {
    createAdapter: () => new SqliteAdapter(),
    createDriver: () => new DummyDriver(),
    createIntrospector: (db) => new SqliteIntrospector(db),
    createQueryCompiler: () => new SqliteQueryCompiler(),
  },
});

let sqlite: DatabaseSync;
const rowCounts: number[] = [];

vi.mock("@/components/providers/SystemProvider", () => ({
  get db() {
    return testDb;
  },
}));

vi.mock("@/lib/powersync/typedQuery", () => ({
  expect: () => undefined,
  typedGetAll: (compiled: CompiledQuery) => {
    const rows = sqlite.prepare(compiled.sql).all(...(compiled.parameters as any[]));
    rowCounts.push(rows.length);
    return Promise.resolve(rows);
  },
}));

import { bleacherTransportation } from "./bleacherTransportation";
import { schedulingConflict } from "./schedulingConflict";

const BLEACHER = "bleacher-1";

function setupSchema() {
  sqlite = new DatabaseSync(":memory:");
  sqlite.exec(`
    CREATE TABLE Addresses (
      id TEXT PRIMARY KEY, street TEXT, city TEXT, state_province TEXT, zip_postal TEXT
    );
    CREATE TABLE Events (
      id TEXT PRIMARY KEY, event_start TEXT, event_end TEXT, event_status TEXT,
      deleted INTEGER, address_uuid TEXT, event_name TEXT,
      setup_start TEXT, teardown_end TEXT, created_by_user_uuid TEXT
    );
    CREATE TABLE BleacherEvents (
      id TEXT PRIMARY KEY, bleacher_uuid TEXT, event_uuid TEXT
    );
    CREATE TABLE WorkTrackers (
      id TEXT PRIMARY KEY, bleacher_uuid TEXT, date TEXT,
      dropoff_address_uuid TEXT, pickup_address_uuid TEXT
    );
    CREATE TABLE Bleachers (id TEXT PRIMARY KEY, bleacher_number INTEGER);
    INSERT INTO Bleachers VALUES ('${BLEACHER}', 12);
  `);
}

const at = (date: string, hour = 12) =>
  new Date(
    Number(date.slice(0, 4)),
    Number(date.slice(5, 7)) - 1,
    Number(date.slice(8, 10)),
    hour,
  ).toISOString();

function addEvent(opts: {
  id: string;
  date: string;
  endDate?: string;
  street: string | null;
  status?: string;
}) {
  const addressId = `addr-${opts.id}`;
  if (opts.street !== null) {
    sqlite
      .prepare(`INSERT INTO Addresses VALUES (?, ?, 'Québec', 'QC', 'G1A 1A1')`)
      .run(addressId, opts.street);
  }
  sqlite
    .prepare(
      `INSERT INTO Events (id, event_start, event_end, event_status, deleted, address_uuid, event_name)
       VALUES (?, ?, ?, ?, 0, ?, ?)`,
    )
    .run(
      opts.id,
      at(opts.date),
      at(opts.endDate ?? opts.date, 18),
      opts.status ?? "booked",
      opts.street === null ? null : addressId,
      `Event ${opts.id}`,
    );
  sqlite
    .prepare(`INSERT INTO BleacherEvents VALUES (?, ?, ?)`)
    .run(`be-${opts.id}`, BLEACHER, opts.id);
}

function addWorkTracker(id: string, date: string, dropoffStreet: string) {
  const addressId = `addr-wt-${id}`;
  sqlite
    .prepare(`INSERT INTO Addresses VALUES (?, ?, 'Québec', 'QC', 'G1A 1A1')`)
    .run(addressId, dropoffStreet);
  sqlite
    .prepare(`INSERT INTO WorkTrackers VALUES (?, ?, ?, ?, NULL)`)
    .run(id, BLEACHER, date, addressId);
}

beforeEach(() => {
  setupSchema();
  rowCounts.length = 0;
});

describe("bleacherTransportation", () => {
  it("flags an event whose location differs from the last known location", async () => {
    addEvent({ id: "prior", date: "2026-09-01", street: "1 Prior St" });
    addEvent({ id: "target", date: "2026-09-20", street: "2 Target St" });

    const result = await bleacherTransportation.evaluate("be-target", undefined);

    expect(result?.message).toContain("1 Prior St");
    expect(result?.message).toContain("2 Target St");
  });

  it("stays silent when the bleacher is already at the event location", async () => {
    addEvent({ id: "prior", date: "2026-09-01", street: "2 Target St" });
    addEvent({ id: "target", date: "2026-09-20", street: "2 Target St" });

    expect(await bleacherTransportation.evaluate("be-target", undefined)).toBeNull();
  });

  it("uses a work tracker drop-off as the last known location when it is nearer", async () => {
    addEvent({ id: "prior", date: "2026-09-01", street: "1 Prior St" });
    addWorkTracker("wt-1", "2026-09-15", "3 Dropoff Rd");
    addEvent({ id: "target", date: "2026-09-20", street: "2 Target St" });

    const result = await bleacherTransportation.evaluate("be-target", undefined);

    expect(result?.message).toContain("3 Dropoff Rd");
  });

  it("ignores an unbooked prior event", async () => {
    addEvent({ id: "booked", date: "2026-09-01", street: "1 Booked St" });
    addEvent({ id: "quote", date: "2026-09-10", street: "9 Quote St", status: "quote" });
    addEvent({ id: "target", date: "2026-09-20", street: "2 Target St" });

    const result = await bleacherTransportation.evaluate("be-target", undefined);

    expect(result?.message).toContain("1 Booked St");
  });

  it("does not scan the bleacher's whole history", async () => {
    for (let i = 1; i <= 9; i++) {
      addEvent({ id: `e${i}`, date: `2026-0${i}-05`, street: `${i} Old St` });
      addWorkTracker(`wt${i}`, `2026-0${i}-06`, `${i} Old Rd`);
    }
    addEvent({ id: "target", date: "2026-09-20", street: "2 Target St" });
    rowCounts.length = 0;

    await bleacherTransportation.evaluate("be-target", undefined);

    // The lookup of the event under evaluation returns 1 row; the two history
    // scans must not return more.
    expect(Math.max(...rowCounts)).toBeLessThanOrEqual(1);
  });
});

describe("schedulingConflict", () => {
  it("flags two booked events overlapping on the same bleacher", async () => {
    addEvent({ id: "a", date: "2026-09-20", endDate: "2026-09-22", street: "1 A St" });
    addEvent({ id: "b", date: "2026-09-21", endDate: "2026-09-23", street: "2 B St" });

    const result = await schedulingConflict.evaluate("be-a", undefined);

    expect(result?.message).toContain("Event b");
  });

  it("stays silent for events that do not overlap", async () => {
    addEvent({ id: "a", date: "2026-09-20", endDate: "2026-09-21", street: "1 A St" });
    addEvent({ id: "b", date: "2026-10-10", endDate: "2026-10-11", street: "2 B St" });

    expect(await schedulingConflict.evaluate("be-a", undefined)).toBeNull();
  });

  it("does not fetch events that cannot possibly overlap", async () => {
    addEvent({ id: "a", date: "2026-09-20", endDate: "2026-09-21", street: "1 A St" });
    for (let i = 1; i <= 8; i++) {
      addEvent({
        id: `far${i}`,
        date: `2026-0${i}-05`,
        endDate: `2026-0${i}-06`,
        street: `${i} Far St`,
      });
    }
    rowCounts.length = 0;

    await schedulingConflict.evaluate("be-a", undefined);

    // 8 distant events plus the one under evaluation: only the target lookup
    // should come back, since none of the others can overlap.
    expect(Math.max(...rowCounts)).toBeLessThanOrEqual(1);
  });
});
