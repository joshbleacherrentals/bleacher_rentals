import { bench, describe, vi } from "vitest";
import { DatabaseSync } from "node:sqlite";
import {
  DummyDriver,
  Kysely,
  SqliteAdapter,
  SqliteIntrospector,
  SqliteQueryCompiler,
  type CompiledQuery,
} from "kysely";

/**
 * How expensive is one save, in reads and in wall time?
 *
 * Saving an event or a work tracker fans out: every definition is evaluated for the entity, for
 * each of its bleacher events, and then again for every OTHER bleacher event on the same bleachers
 * (the "ripple"). That fan-out is what made saves take ~14s once before, so any change to the
 * ripple's bounds gets measured here first.
 *
 * Scale comes from the real fleet: the worst event in production has 19 bleachers and ~180 related
 * bleacher events in range.
 *
 *   npx vitest bench src/features/alerts/triage.bench.ts
 *
 * Bench files do not run in `vitest run`, so this costs CI nothing.
 */
const BLEACHERS = 19;
const RELATED_EVENTS = 180;
/** Long events spanning today — only the fixed ripple bound reaches these. */
const IN_PROGRESS_EVENTS = 20;
const TARGET_EVENT = "event-under-test";
const TARGET_WT = "wt-under-test";

const testDb = new Kysely<any>({
  dialect: {
    createAdapter: () => new SqliteAdapter(),
    createDriver: () => new DummyDriver(),
    createIntrospector: (db) => new SqliteIntrospector(db),
    createQueryCompiler: () => new SqliteQueryCompiler(),
  },
});

let sqlite: DatabaseSync;
/** Reads and writes issued by the run being measured. */
const counters = { reads: 0, writes: 0 };

vi.mock("@/components/providers/SystemProvider", () => ({
  get db() {
    return testDb;
  },
}));

vi.mock("@/lib/powersync/typedQuery", () => ({
  expect: () => undefined,
  typedGetAll: (compiled: CompiledQuery) => {
    counters.reads += 1;
    return Promise.resolve(sqlite.prepare(compiled.sql).all(...(compiled.parameters as any[])));
  },
  typedExecute: () => {
    counters.writes += 1;
    return Promise.resolve();
  },
  typedExecuteBatch: (statements: CompiledQuery[]) => {
    counters.writes += statements.length;
    return Promise.resolve();
  },
}));

const { triage } = await import("./triage");
const { resetCascadeQueue } = await import("./cascadeQueue");

/** A date `days` from today, as YYYY-MM-DD — the shape every date column holds. */
function day(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function seed() {
  sqlite = new DatabaseSync(":memory:");
  sqlite.exec(`
    CREATE TABLE Alerts (
      id TEXT PRIMARY KEY, entity_uuid TEXT, entity_type TEXT, title TEXT, message TEXT,
      entity_description TEXT
    );
    CREATE TABLE UserAlerts (id TEXT PRIMARY KEY, alert_uuid TEXT, user_uuid TEXT);
    CREATE TABLE Events (
      id TEXT PRIMARY KEY, event_name TEXT, event_start TEXT, event_end TEXT, setup_start TEXT,
      teardown_end TEXT, event_status TEXT, deleted INTEGER, address_uuid TEXT, total_seats INTEGER,
      lenient INTEGER, created_by_user_uuid TEXT
    );
    CREATE TABLE BleacherEvents (id TEXT PRIMARY KEY, bleacher_uuid TEXT, event_uuid TEXT);
    CREATE TABLE Bleachers (
      id TEXT PRIMARY KEY, bleacher_number INTEGER, bleacher_seats INTEGER, bleacher_rows INTEGER,
      bleacher_type_uuid TEXT
    );
    CREATE TABLE Addresses (
      id TEXT PRIMARY KEY, street TEXT, city TEXT, state_province TEXT, zip_postal TEXT
    );
    CREATE TABLE WorkTrackers (
      id TEXT PRIMARY KEY, bleacher_uuid TEXT, date TEXT, status TEXT, released_at TEXT,
      accepted_at TEXT, dropoff_address_uuid TEXT, pickup_address_uuid TEXT,
      created_by_user_uuid TEXT
    );
    CREATE TABLE EventLineItems (
      id TEXT PRIMARY KEY, event_uuid TEXT, bleacher_type_uuid TEXT, quantity INTEGER,
      deleted INTEGER
    );
    CREATE TABLE BleacherTypes (id TEXT PRIMARY KEY, name TEXT);
  `);

  const addEvent = (id: string, start: string, end: string, addressId: string) =>
    sqlite
      .prepare(
        `INSERT INTO Events (id, event_name, event_start, event_end, setup_start, teardown_end,
         event_status, deleted, address_uuid, total_seats, lenient, created_by_user_uuid)
         VALUES (?, ?, ?, ?, NULL, NULL, 'booked', 0, ?, 100, 0, 'user-1')`,
      )
      .run(id, `Event ${id}`, start, end, addressId);

  for (let i = 0; i < RELATED_EVENTS + 2; i++) {
    sqlite
      .prepare(`INSERT INTO Addresses VALUES (?, ?, 'Tampa', 'FL', '33601')`)
      .run(`addr-${i}`, `${i} Venue Rd`);
  }

  for (let b = 0; b < BLEACHERS; b++) {
    sqlite.prepare(`INSERT INTO Bleachers VALUES (?, ?, 100, 10, 'type-a')`).run(`b-${b}`, b);
  }
  sqlite.prepare(`INSERT INTO BleacherTypes VALUES ('type-a', '10-Row')`).run();

  // The event being saved, running next week, on every bleacher.
  addEvent(TARGET_EVENT, day(3), day(5), "addr-0");
  for (let b = 0; b < BLEACHERS; b++) {
    sqlite
      .prepare(`INSERT INTO BleacherEvents VALUES (?, ?, ?)`)
      .run(`be-target-${b}`, `b-${b}`, TARGET_EVENT);
  }

  // The ripple: other events spread across those same bleachers, inside the window.
  for (let i = 0; i < RELATED_EVENTS; i++) {
    const id = `related-${i}`;
    addEvent(id, day(1 + (i % 9)), day(2 + (i % 9)), `addr-${i + 1}`);
    sqlite
      .prepare(`INSERT INTO BleacherEvents VALUES (?, ?, ?)`)
      .run(`be-${id}`, `b-${i % BLEACHERS}`, id);
  }

  // Long events already under way: started weeks ago, still running. Bounding the ripple on
  // event_start skipped these entirely, which is how a stale "Double booked" alert survived.
  for (let i = 0; i < IN_PROGRESS_EVENTS; i++) {
    const id = `in-progress-${i}`;
    addEvent(id, day(-30), day(30), `addr-${i + 1}`);
    sqlite
      .prepare(`INSERT INTO BleacherEvents VALUES (?, ?, ?)`)
      .run(`be-${id}`, `b-${i % BLEACHERS}`, id);
  }

  // One work tracker per bleacher, plus the one under test.
  for (let b = 0; b < BLEACHERS; b++) {
    sqlite
      .prepare(
        `INSERT INTO WorkTrackers (id, bleacher_uuid, date, status, released_at, accepted_at,
         dropoff_address_uuid, pickup_address_uuid, created_by_user_uuid)
         VALUES (?, ?, ?, 'released', NULL, NULL, ?, NULL, 'user-1')`,
      )
      .run(`wt-${b}`, `b-${b}`, day(2), `addr-${b}`);
  }
  sqlite
    .prepare(
      `INSERT INTO WorkTrackers (id, bleacher_uuid, date, status, released_at, accepted_at,
       dropoff_address_uuid, pickup_address_uuid, created_by_user_uuid)
       VALUES (?, 'b-0', ?, 'released', NULL, NULL, 'addr-0', NULL, 'user-1')`,
    )
    .run(TARGET_WT, day(2));
}

function report(label: string) {
  // Printed once per bench run: wall time is noisy, the query count is not.
  console.log(`[bench] ${label}: ${counters.reads} reads, ${counters.writes} statements`);
}

describe("saving an event with 19 bleachers and ~180 related events", () => {
  bench(
    "triage Events",
    async () => {
      counters.reads = 0;
      counters.writes = 0;
      seed();
      resetCascadeQueue();
      await triage("Events", { id: TARGET_EVENT });
      report("triage Events");
    },
    { iterations: 5, warmupIterations: 1 },
  );
});

describe("saving a work tracker on a busy bleacher", () => {
  bench(
    "triage WorkTrackers",
    async () => {
      counters.reads = 0;
      counters.writes = 0;
      seed();
      resetCascadeQueue();
      await triage("WorkTrackers", { id: TARGET_WT, previous_bleacher_uuid: null });
      report("triage WorkTrackers");
    },
    { iterations: 5, warmupIterations: 1 },
  );
});
