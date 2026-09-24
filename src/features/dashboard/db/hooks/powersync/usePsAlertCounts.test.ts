import { beforeEach, describe, expect, it, vi } from "vitest";
import { DatabaseSync } from "node:sqlite";
import {
  DummyDriver,
  Kysely,
  SqliteAdapter,
  SqliteIntrospector,
  SqliteQueryCompiler,
} from "kysely";

const testDb = new Kysely<any>({
  dialect: {
    createAdapter: () => new SqliteAdapter(),
    createDriver: () => new DummyDriver(),
    createIntrospector: (db) => new SqliteIntrospector(db),
    createQueryCompiler: () => new SqliteQueryCompiler(),
  },
});

vi.mock("@/components/providers/SystemProvider", () => ({
  get db() {
    return testDb;
  },
}));

import { compileAlertCountsQuery } from "./usePsAlertCounts";

const TODAY = "2026-09-21"; // a Monday, so the transportation window closes on Sunday the 27th
const WINDOW_END = "2026-09-27";

let sqlite: DatabaseSync;

function run(): { entity_uuid: string; cnt: number }[] {
  const compiled = compileAlertCountsQuery(TODAY, WINDOW_END);
  return sqlite.prepare(compiled.sql).all(...(compiled.parameters as any[])) as any;
}

function addEvent(id: string, start: string, end: string) {
  sqlite.prepare("INSERT INTO Events VALUES (?, ?, ?)").run(id, start, end);
}

function addBleacherEvent(id: string, eventId: string) {
  sqlite.prepare("INSERT INTO BleacherEvents VALUES (?, ?)").run(id, eventId);
}

function addAlert(id: string, entityUuid: string, entityType: string, title: string) {
  sqlite.prepare("INSERT INTO Alerts VALUES (?, ?, ?, ?)").run(id, entityUuid, entityType, title);
}

beforeEach(() => {
  sqlite = new DatabaseSync(":memory:");
  sqlite.exec(`
    CREATE TABLE Alerts (id TEXT PRIMARY KEY, entity_uuid TEXT, entity_type TEXT, title TEXT);
    CREATE TABLE Events (id TEXT PRIMARY KEY, event_start TEXT, event_end TEXT);
    CREATE TABLE BleacherEvents (id TEXT PRIMARY KEY, event_uuid TEXT);
    CREATE TABLE WorkTrackers (id TEXT PRIMARY KEY, date TEXT);
  `);
});

describe("compileAlertCountsQuery", () => {
  it("does not count a No Transportation alert for an event starting after the window", () => {
    // The reported case: an event in October still showing a red badge on the grid while the
    // dropdown and the event form both hid the alert.
    addEvent("ev-october", "2026-10-09", "2026-10-13");
    addBleacherEvent("be-october", "ev-october");
    addAlert("a-1", "be-october", "bleacher_event", "No Transportation");

    expect(run()).toEqual([]);
  });

  it("counts a No Transportation alert inside the window", () => {
    addEvent("ev-soon", "2026-09-24", "2026-09-26");
    addBleacherEvent("be-soon", "ev-soon");
    addAlert("a-1", "be-soon", "bleacher_event", "No Transportation");

    expect(run()).toEqual([{ entity_uuid: "be-soon", entity_type: "bleacher_event", cnt: 1 }]);
  });

  it("counts other alert types outside the window", () => {
    addEvent("ev-october", "2026-10-09", "2026-10-13");
    addBleacherEvent("be-october", "ev-october");
    addAlert("a-1", "be-october", "bleacher_event", "Scheduling Conflict");

    expect(run()).toHaveLength(1);
  });

  it("does not count anything on an event that has ended", () => {
    addEvent("ev-past", "2026-09-01", "2026-09-20");
    addAlert("a-1", "ev-past", "event", "Event Requirements Not Met");

    expect(run()).toEqual([]);
  });

  it("counts an event ending today", () => {
    addEvent("ev-today", "2026-09-01", TODAY);
    addAlert("a-1", "ev-today", "event", "Event Requirements Not Met");

    expect(run()).toHaveLength(1);
  });

  it("counts an alert whose entity is not synced locally", () => {
    addAlert("a-1", "ev-missing", "event", "Event Requirements Not Met");

    expect(run()).toHaveLength(1);
  });

  it("does not count a work tracker alert from yesterday", () => {
    sqlite.prepare("INSERT INTO WorkTrackers VALUES (?, ?)").run("wt-1", "2026-09-20");
    addAlert("a-1", "wt-1", "work_tracker", "Work Tracker Pending Acceptance");

    expect(run()).toEqual([]);
  });
});
