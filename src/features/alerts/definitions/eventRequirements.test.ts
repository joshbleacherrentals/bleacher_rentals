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

vi.mock("@/components/providers/SystemProvider", () => ({
  get db() {
    return testDb;
  },
}));

vi.mock("@/lib/powersync/typedQuery", () => ({
  expect: () => undefined,
  typedGetAll: (compiled: CompiledQuery) =>
    Promise.resolve(sqlite.prepare(compiled.sql).all(...(compiled.parameters as any[]))),
}));

import { eventRequirements } from "./eventRequirements";

const EVENT = "event-1";

function setupSchema() {
  sqlite = new DatabaseSync(":memory:");
  sqlite.exec(`
    CREATE TABLE Addresses (id TEXT PRIMARY KEY, street TEXT);
    CREATE TABLE Events (
      id TEXT PRIMARY KEY, event_name TEXT, total_seats INTEGER, seven_row INTEGER,
      ten_row INTEGER, fifteen_row INTEGER, lenient INTEGER, address_uuid TEXT,
      created_by_user_uuid TEXT, deleted INTEGER
    );
    CREATE TABLE Bleachers (
      id TEXT PRIMARY KEY, bleacher_seats INTEGER, bleacher_rows INTEGER, bleacher_type_uuid TEXT
    );
    CREATE TABLE BleacherEvents (id TEXT PRIMARY KEY, bleacher_uuid TEXT, event_uuid TEXT);
    CREATE TABLE BleacherTypes (id TEXT PRIMARY KEY, name TEXT);
    CREATE TABLE EventLineItems (
      id TEXT PRIMARY KEY, event_uuid TEXT, bleacher_type_uuid TEXT, quantity INTEGER,
      deleted INTEGER
    );
  `);
}

function insertEvent(overrides: Record<string, unknown> = {}) {
  const row = {
    id: EVENT,
    event_name: "County Fair",
    total_seats: null,
    seven_row: 0,
    ten_row: 0,
    fifteen_row: 0,
    lenient: 0,
    address_uuid: null,
    created_by_user_uuid: "user-1",
    deleted: 0,
    ...overrides,
  };
  const cols = Object.keys(row);
  sqlite
    .prepare(`INSERT INTO Events (${cols.join(",")}) VALUES (${cols.map(() => "?").join(",")})`)
    .run(...(Object.values(row) as any[]));
}

function assignBleacher(id: string, rows: number, typeUuid: string) {
  sqlite.prepare("INSERT INTO Bleachers VALUES (?, ?, ?, ?)").run(id, rows * 10, rows, typeUuid);
  sqlite.prepare("INSERT INTO BleacherEvents VALUES (?, ?, ?)").run(`be-${id}`, id, EVENT);
}

beforeEach(() => {
  setupSchema();
  sqlite.prepare("INSERT INTO BleacherTypes VALUES (?, ?)").run("type-15", "15 Row Bleacher");
});

describe("eventRequirements.evaluate", () => {
  it("never reports the old 7/10/15-row counts when the event has no line items", () => {
    // The reported case: "Bleacher mismatch — 15-row: 0 needed, 2 assigned."
    insertEvent({ fifteen_row: 0 });
    assignBleacher("b-1", 15, "type-15");
    assignBleacher("b-2", 15, "type-15");

    return expect(eventRequirements.evaluate(EVENT, undefined as any)).resolves.toBeNull();
  });

  it("ignores legacy row counts even when they are set", () => {
    insertEvent({ ten_row: 3 });

    return expect(eventRequirements.evaluate(EVENT, undefined as any)).resolves.toBeNull();
  });

  it("still reports a bleacher type mismatch against the line items", async () => {
    insertEvent();
    sqlite
      .prepare("INSERT INTO EventLineItems VALUES (?, ?, ?, ?, ?)")
      .run("li-1", EVENT, "type-15", 2, 0);
    assignBleacher("b-1", 15, "type-15");

    const result = await eventRequirements.evaluate(EVENT, undefined as any);

    expect(result?.message).toBe("Bleacher mismatch — 15 Row Bleacher: 2 needed, 1 assigned.");
  });
});
