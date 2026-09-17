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

import { getExpectedInstructionsForWorkTracker } from "./resolveEventInstructionsForWorkTracker";

const BLEACHER = "bleacher-1";

function setupSchema() {
  sqlite = new DatabaseSync(":memory:");
  sqlite.exec(`
    CREATE TABLE Events (
      id TEXT PRIMARY KEY, event_start TEXT, event_status TEXT,
      deleted INTEGER, pickup_instructions TEXT, dropoff_instructions TEXT
    );
    CREATE TABLE BleacherEvents (
      id TEXT PRIMARY KEY, bleacher_uuid TEXT, event_uuid TEXT
    );
  `);
}

function addEvent(opts: {
  id: string;
  date: string;
  pickupInstructions?: string | null;
  dropoffInstructions?: string | null;
  status?: string;
}) {
  const startsAt = new Date(
    Number(opts.date.slice(0, 4)),
    Number(opts.date.slice(5, 7)) - 1,
    Number(opts.date.slice(8, 10)),
    12,
  ).toISOString();
  sqlite
    .prepare(
      `INSERT INTO Events (id, event_start, event_status, deleted, pickup_instructions, dropoff_instructions)
       VALUES (?, ?, ?, 0, ?, ?)`,
    )
    .run(
      opts.id,
      startsAt,
      opts.status ?? "booked",
      opts.pickupInstructions ?? null,
      opts.dropoffInstructions ?? null,
    );
  sqlite
    .prepare(`INSERT INTO BleacherEvents VALUES (?, ?, ?)`)
    .run(`be-${opts.id}`, BLEACHER, opts.id);
}

beforeEach(() => {
  setupSchema();
  rowCounts.length = 0;
});

describe("getExpectedInstructionsForWorkTracker", () => {
  it("fetches at most one candidate row, not the bleacher's whole history", async () => {
    for (let i = 1; i <= 12; i++) {
      addEvent({
        id: `e${i}`,
        date: `2026-0${(i % 9) + 1}-0${(i % 9) + 1}`,
        pickupInstructions: `Instructions ${i}`,
      });
    }

    await getExpectedInstructionsForWorkTracker({
      bleacherUuid: BLEACHER,
      targetDate: "2026-09-20",
      direction: "past",
    });

    expect(Math.max(...rowCounts)).toBeLessThanOrEqual(1);
  });

  it("past reads the nearest event's own pickup_instructions", async () => {
    addEvent({ id: "old", date: "2026-08-01", pickupInstructions: "too old" });
    addEvent({ id: "recent", date: "2026-09-10", pickupInstructions: "correct" });
    addEvent({ id: "future", date: "2026-10-01", pickupInstructions: "too new" });

    const result = await getExpectedInstructionsForWorkTracker({
      bleacherUuid: BLEACHER,
      targetDate: "2026-09-20",
      direction: "past",
    });

    expect(result).toEqual({ kind: "ok", text: "correct" });
  });

  it("future reads the nearest event's own dropoff_instructions", async () => {
    addEvent({ id: "past", date: "2026-08-01", dropoffInstructions: "too old" });
    addEvent({ id: "soon", date: "2026-09-25", dropoffInstructions: "correct" });
    addEvent({ id: "later", date: "2026-10-15", dropoffInstructions: "too far" });

    const result = await getExpectedInstructionsForWorkTracker({
      bleacherUuid: BLEACHER,
      targetDate: "2026-09-20",
      direction: "future",
    });

    expect(result).toEqual({ kind: "ok", text: "correct" });
  });

  it("skips a nearer event with blank instructions in favour of the next-nearest qualifying one", async () => {
    addEvent({ id: "nearer-blank", date: "2026-09-18", pickupInstructions: null });
    addEvent({ id: "further-real", date: "2026-09-01", pickupInstructions: "the real answer" });

    const result = await getExpectedInstructionsForWorkTracker({
      bleacherUuid: BLEACHER,
      targetDate: "2026-09-20",
      direction: "past",
    });

    expect(result).toEqual({ kind: "ok", text: "the real answer" });
  });

  it("returns not-found when nothing qualifies", async () => {
    addEvent({ id: "unbooked", date: "2026-09-15", pickupInstructions: "x", status: "quoted" });

    const result = await getExpectedInstructionsForWorkTracker({
      bleacherUuid: BLEACHER,
      targetDate: "2026-09-20",
      direction: "past",
    });

    expect(result).toEqual({ kind: "not-found" });
  });
});
