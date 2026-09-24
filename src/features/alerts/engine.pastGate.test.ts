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
  typedExecute: () => Promise.resolve(),
  typedExecuteBatch: () => Promise.resolve(),
}));

import { planAlertsForEntity } from "./engine";

const TITLE = "Event Requirements Not Met";

function setup() {
  sqlite = new DatabaseSync(":memory:");
  sqlite.exec(`
    CREATE TABLE Alerts (
      id TEXT PRIMARY KEY, entity_uuid TEXT, entity_type TEXT, title TEXT, message TEXT,
      entity_description TEXT
    );
    CREATE TABLE Events (id TEXT PRIMARY KEY, event_end TEXT);
    CREATE TABLE BleacherEvents (id TEXT PRIMARY KEY, event_uuid TEXT);
    CREATE TABLE WorkTrackers (id TEXT PRIMARY KEY, date TEXT);
  `);
  sqlite.prepare("INSERT INTO Events VALUES ('ev-past', '2026-09-17')").run();
  sqlite.prepare("INSERT INTO Events VALUES ('ev-today', '2026-09-18')").run();
  sqlite.prepare("INSERT INTO BleacherEvents VALUES ('be-past', 'ev-past')").run();
  sqlite.prepare("INSERT INTO WorkTrackers VALUES ('wt-past', '2026-09-17')").run();
}

const payload = (entity_uuid: string, entity_type = "event") => ({
  entity_uuid,
  entity_type: entity_type as any,
  title: TITLE,
  message: "Bleacher mismatch — 15-Row, 450 Seat: 2 needed, 1 assigned.",
  entity_description: "County Fair",
});

const kinds = (statements: CompiledQuery[]) =>
  statements.map((s) => s.sql.split(" ").slice(0, 3).join(" ").replace(/"/g, ""));

beforeEach(() => {
  setup();
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-09-18T16:00:00Z")); // noon in Toronto
});

describe("planAlertsForEntity — never writes an alert in the past", () => {
  it("writes nothing for an event that ended yesterday", async () => {
    const statements = await planAlertsForEntity(
      TITLE,
      "ev-past",
      "event",
      [payload("ev-past")],
      ["user-1"],
    );

    expect(statements).toEqual([]);
  });

  it("deletes an alert an event that ended yesterday already has", async () => {
    sqlite
      .prepare("INSERT INTO Alerts VALUES ('a-1', 'ev-past', 'event', ?, 'old', 'County Fair')")
      .run(TITLE);

    const statements = await planAlertsForEntity(
      TITLE,
      "ev-past",
      "event",
      [payload("ev-past")],
      ["user-1"],
    );

    expect(kinds(statements)).toEqual(["delete from UserAlerts", "delete from Alerts"]);
  });

  it("still writes for an event that ends today", async () => {
    const statements = await planAlertsForEntity(
      TITLE,
      "ev-today",
      "event",
      [payload("ev-today")],
      ["user-1"],
    );

    expect(kinds(statements)).toEqual(["insert into Alerts", "insert into UserAlerts"]);
  });

  it("gates a bleacher event by its event's end date", async () => {
    const statements = await planAlertsForEntity(
      "Scheduling Conflict",
      "be-past",
      "bleacher_event",
      [{ ...payload("be-past", "bleacher_event"), title: "Scheduling Conflict" }],
      ["user-1"],
    );

    expect(statements).toEqual([]);
  });

  it("gates a work tracker by its date, review requests included", async () => {
    const statements = await planAlertsForEntity(
      "Review Requested",
      "wt-past",
      "work_tracker",
      [{ ...payload("wt-past", "work_tracker"), title: "Review Requested" }],
      ["user-1"],
    );

    expect(statements).toEqual([]);
  });

  it("does not gate an entity it cannot find locally", async () => {
    const statements = await planAlertsForEntity(
      TITLE,
      "ev-not-synced",
      "event",
      [payload("ev-not-synced")],
      ["user-1"],
    );

    expect(kinds(statements)).toEqual(["insert into Alerts", "insert into UserAlerts"]);
  });
});
