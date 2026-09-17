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

import { getAdjacentEventsForWorkTracker } from "./resolveAdjacentEventsForWorkTracker";

const BLEACHER = "bleacher-1";

function setupSchema() {
  sqlite = new DatabaseSync(":memory:");
  sqlite.exec(`
    CREATE TABLE Events (
      id TEXT PRIMARY KEY, event_name TEXT, event_start TEXT, event_end TEXT,
      event_status TEXT, deleted INTEGER
    );
    CREATE TABLE BleacherEvents (
      id TEXT PRIMARY KEY, bleacher_uuid TEXT, event_uuid TEXT
    );
  `);
}

function addEvent(opts: { id: string; date: string; name?: string; status?: string }) {
  const startsAt = new Date(
    Number(opts.date.slice(0, 4)),
    Number(opts.date.slice(5, 7)) - 1,
    Number(opts.date.slice(8, 10)),
    12,
  ).toISOString();
  sqlite
    .prepare(
      `INSERT INTO Events (id, event_name, event_start, event_end, event_status, deleted)
       VALUES (?, ?, ?, ?, ?, 0)`,
    )
    .run(opts.id, opts.name ?? `Event ${opts.id}`, startsAt, startsAt, opts.status ?? "booked");
  sqlite
    .prepare(`INSERT INTO BleacherEvents VALUES (?, ?, ?)`)
    .run(`be-${opts.id}`, BLEACHER, opts.id);
}

beforeEach(() => {
  setupSchema();
  rowCounts.length = 0;
});

describe("getAdjacentEventsForWorkTracker", () => {
  it("fetches at most one row per direction, not the bleacher's whole history", async () => {
    for (let i = 1; i <= 12; i++) {
      addEvent({ id: `e${i}`, date: `2026-0${(i % 9) + 1}-0${(i % 9) + 1}` });
    }

    await getAdjacentEventsForWorkTracker({ bleacherUuid: BLEACHER, targetDate: "2026-09-20" });

    expect(Math.max(...rowCounts)).toBeLessThanOrEqual(1);
  });

  it("returns the nearest booked event before and after the target date", async () => {
    addEvent({ id: "too-early", date: "2026-08-01" });
    addEvent({ id: "previous", date: "2026-09-10" });
    addEvent({ id: "next", date: "2026-09-25" });
    addEvent({ id: "too-late", date: "2026-10-15" });

    const result = await getAdjacentEventsForWorkTracker({
      bleacherUuid: BLEACHER,
      targetDate: "2026-09-20",
    });

    expect(result.previous?.id).toBe("previous");
    expect(result.next?.id).toBe("next");
  });

  it("ignores non-booked events even when nearest", async () => {
    addEvent({ id: "unbooked", date: "2026-09-18", status: "quoted" });
    addEvent({ id: "booked-further", date: "2026-09-05" });

    const result = await getAdjacentEventsForWorkTracker({
      bleacherUuid: BLEACHER,
      targetDate: "2026-09-20",
    });

    expect(result.previous?.id).toBe("booked-further");
  });

  it("returns nulls when nothing qualifies", async () => {
    const result = await getAdjacentEventsForWorkTracker({
      bleacherUuid: BLEACHER,
      targetDate: "2026-09-20",
    });

    expect(result).toEqual({ previous: null, next: null });
  });
});
