import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resetEventContextForTests } from "./eventContext";
import { setMetricsSink } from "./metrics";
import {
  AGGREGATE_WINDOW_MS,
  SLOW_MS,
  describeSql,
  opOf,
  resetSqliteTimingForTests,
  tablesOf,
  timed,
} from "./sqliteTiming";
import type { PerfEvent } from "./telemetryEvent";

let events: PerfEvent[];

/** performance.now(): the first call is the start, the second the end of one timed call. */
function clock(...pairs: Array<[number, number]>) {
  const queue = pairs.flatMap(([start, end]) => [start, end]);
  return vi.spyOn(performance, "now").mockImplementation(() => queue.shift() ?? 0);
}

const SELECT_USERS = 'select "u"."email" from "Users" as "u" where "u"."id" = ?';

beforeEach(() => {
  events = [];
  resetEventContextForTests();
  resetSqliteTimingForTests();
  setMetricsSink((event) => events.push(event));
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  setMetricsSink(null);
});

describe("opOf", () => {
  it.each([
    ["select 1", "select"],
    ["  SELECT * FROM t", "select"],
    ['insert into "T" ("a") values (?)', "insert"],
    ['INSERT OR REPLACE INTO "T" VALUES (?)', "insert"],
    ['update "T" set "a" = ?', "update"],
    ['delete from "T" where "id" = ?', "delete"],
    ["pragma foreign_keys = on", "other"],
    ["", "other"],
    ["create table t (a)", "other"],
  ])("%s -> %s", (sql, op) => {
    expect(opOf(sql)).toBe(op);
  });

  it("reads the main statement of a CTE, not the CTE's own body", () => {
    expect(opOf("with a as (select 1) select * from a")).toBe("select");
    expect(opOf('with a as (select 1) insert into "T" select * from a')).toBe("insert");
    expect(opOf('with a as (delete from "X" returning *) select * from a')).toBe("select");
  });

  it("ignores a keyword inside a string literal", () => {
    expect(opOf("with a as (select 'delete') update t set x = 1")).toBe("update");
  });

  it("skips a leading comment", () => {
    expect(opOf("-- why\nselect 1")).toBe("select");
    expect(opOf("/* why */ delete from t")).toBe("delete");
  });
});

describe("tablesOf", () => {
  it("reads the tables of reads, writes and joins", () => {
    expect(tablesOf('select * from "Users" join "Drivers" on 1')).toBe("Drivers,Users");
    expect(tablesOf('insert into "Events" ("a") values (?)')).toBe("Events");
    expect(tablesOf('update "Addresses" set "a" = ?')).toBe("Addresses");
    expect(tablesOf('delete from "Blocks" where "id" = ?')).toBe("Blocks");
  });

  it("lists each table once and caps the string at 64 characters", () => {
    expect(tablesOf('select * from "A" join "A" on 1')).toBe("A");
    const many = Array.from(
      { length: 20 },
      (_, i) => `join "Table${String(i).padStart(2, "0")}Name" on 1`,
    );
    expect(tablesOf(`select * from "Base" ${many.join(" ")}`).length).toBeLessThanOrEqual(64);
  });

  it("is empty for SQL it does not recognise", () => {
    expect(tablesOf("pragma foreign_keys = on")).toBe("");
  });
});

describe("describeSql", () => {
  it("gives the op and tables, and a batch of one kind keeps its op", () => {
    expect(describeSql(['update "A" set x = ?', 'update "B" set x = ?'])).toEqual({
      op: "update",
      tables: "A,B",
    });
  });

  it("calls a batch of mixed statements `other`", () => {
    expect(describeSql(['insert into "A" values (?)', 'delete from "B"'])).toEqual({
      op: "other",
      tables: "A,B",
    });
  });
});

describe("timed (development: every call is an event)", () => {
  beforeEach(() => vi.stubEnv("NODE_ENV", "development"));

  it("records a duration for a resolved promise and hands back its value", async () => {
    clock([100, 112.5]);
    const result = await timed("sqlite.query", SELECT_USERS, () => Promise.resolve([1, 2, 3]));

    expect(result).toEqual([1, 2, 3]);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ name: "sqlite.query", outcome: "ok", errorKind: null });
    expect(events[0].durationMs).toBe(12.5);
    expect(events[0].attrs).toEqual({ op: "select", tables: "Users", rows: 3 });
  });

  it("records a fast call as its own event too (no aggregation in development)", async () => {
    clock([0, 0.2], [1, 1.3]);
    await timed("sqlite.query", SELECT_USERS, () => Promise.resolve([]));
    await timed("sqlite.query", SELECT_USERS, () => Promise.resolve([]));
    expect(events).toHaveLength(2);
  });

  it("records an error for a rejected promise and rejects with the very same error", async () => {
    clock([0, 4]);
    const failure = Object.assign(new Error("row {email: a@b.c}"), { code: "23505" });

    await expect(
      timed("sqlite.write", 'insert into "Events" values (?)', () => Promise.reject(failure)),
    ).rejects.toBe(failure);

    expect(events[0]).toMatchObject({
      name: "sqlite.write",
      outcome: "error",
      errorKind: "pg:23505",
    });
    expect(JSON.stringify(events)).not.toContain("a@b.c");
  });

  it("records a synchronous throw and rethrows it unchanged", () => {
    clock([0, 1]);
    const failure = new Error("not in the browser");
    expect(() =>
      timed("sqlite.query", SELECT_USERS, () => {
        throw failure;
      }),
    ).toThrow(failure);
    expect(events[0]).toMatchObject({ outcome: "error" });
  });

  it("counts the rows of a read and the statements of a batch", async () => {
    clock([0, 2], [2, 9]);
    await timed("sqlite.query", SELECT_USERS, () => Promise.resolve([{}, {}]));
    await timed("sqlite.batch", ['update "A" set x = ?', 'update "A" set y = ?'], () =>
      Promise.resolve(),
    );

    expect(events[0].attrs).toMatchObject({ rows: 2 });
    expect(events[1].attrs).toEqual({ op: "update", tables: "A", statements: 2 });
  });

  it("prints the normalised SQL to the console, still without parameters", async () => {
    clock([0, 3]);
    const debug = vi.spyOn(console, "debug").mockImplementation(() => {});
    await timed("sqlite.query", 'select  *\n  from "Users"', () => Promise.resolve([]));

    const printed = debug.mock.calls.map((call) => call.join(" ")).join("\n");
    expect(printed).toContain('select * from "Users"');
  });

  it("never lets a value into an event", async () => {
    clock([0, 3]);
    await timed("sqlite.query", 'select * from "Users" where "email" = ?', () =>
      Promise.resolve([{ email: "person@example.com" }]),
    );
    expect(JSON.stringify(events)).not.toContain("person@example.com");
  });
});

describe("timed (production: slow or failed individually, the rest aggregated)", () => {
  beforeEach(() => {
    vi.stubEnv("NODE_ENV", "production");
    vi.useFakeTimers();
    vi.spyOn(console, "debug").mockImplementation(() => {});
  });

  it("makes a call of exactly 50 ms part of the aggregate and writes no event yet", async () => {
    clock([0, SLOW_MS]);
    await timed("sqlite.query", SELECT_USERS, () => Promise.resolve([]));
    expect(events).toEqual([]);
  });

  it("makes a call of 51 ms an event of its own", async () => {
    clock([0, SLOW_MS + 1]);
    await timed("sqlite.query", SELECT_USERS, () => Promise.resolve([]));
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ name: "sqlite.query", outcome: "ok" });
    expect(events[0].durationMs).toBe(51);
  });

  it("makes a failed call an event of its own, however short it was", async () => {
    clock([0, 0.4]);
    await expect(
      timed("sqlite.write", 'insert into "Events" values (?)', () =>
        Promise.reject(new Error("x")),
      ),
    ).rejects.toThrow();
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ outcome: "error", durationMs: 0.4 });
  });

  it("never counts one call in both kinds", async () => {
    clock([0, 10], [10, 80]);
    await timed("sqlite.query", SELECT_USERS, () => Promise.resolve([])); // aggregated
    await timed("sqlite.query", SELECT_USERS, () => Promise.resolve([])); // individual
    vi.advanceTimersByTime(AGGREGATE_WINDOW_MS);

    const individual = events.filter((e) => e.durationMs !== null);
    const aggregates = events.filter((e) => e.durationMs === null);
    expect(individual).toHaveLength(1);
    expect(aggregates).toHaveLength(1);
    expect(aggregates[0].attrs).toMatchObject({ count: 1 });
  });

  it("flushes one aggregate per key after the window, with count, sum, max and buckets", async () => {
    clock([0, 0.5], [0, 1.5], [0, 4], [0, 8], [0, 15], [0, 50]);
    for (let i = 0; i < 6; i++) {
      await timed("sqlite.query", SELECT_USERS, () => Promise.resolve([]));
    }
    expect(events).toEqual([]);

    vi.advanceTimersByTime(AGGREGATE_WINDOW_MS);

    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ name: "sqlite.query", durationMs: null, outcome: "ok" });
    expect(events[0].attrs).toEqual({
      op: "select",
      tables: "Users",
      count: 6,
      sumMs: 79,
      maxMs: 50,
      b1: 1,
      b2: 1,
      b3: 1,
      b4: 1,
      b5: 1,
      b6: 1,
    });
  });

  it("puts a call in the first bucket whose edge is not below it (1, 2, 5, 10, 20, 50)", async () => {
    clock([0, 1], [0, 1.01], [0, 2], [0, 5], [0, 5.01], [0, 10], [0, 20], [0, 20.5]);
    for (let i = 0; i < 8; i++) {
      await timed("sqlite.query", SELECT_USERS, () => Promise.resolve([]));
    }
    vi.advanceTimersByTime(AGGREGATE_WINDOW_MS);

    expect(events[0].attrs).toMatchObject({ b1: 1, b2: 2, b3: 1, b4: 2, b5: 1, b6: 1 });
  });

  it("has buckets that always add up to the count", async () => {
    clock([0, 0.1], [0, 3], [0, 7], [0, 12], [0, 33], [0, 49]);
    for (let i = 0; i < 6; i++) {
      await timed("sqlite.write", 'update "A" set x = ?', () => Promise.resolve());
    }
    vi.advanceTimersByTime(AGGREGATE_WINDOW_MS);

    const attrs = events[0].attrs as Record<string, number>;
    const sum = attrs.b1 + attrs.b2 + attrs.b3 + attrs.b4 + attrs.b5 + attrs.b6;
    expect(sum).toBe(attrs.count);
  });

  it("keeps a separate aggregate per name, op and tables", async () => {
    clock([0, 2], [0, 2], [0, 2]);
    await timed("sqlite.query", 'select * from "A"', () => Promise.resolve([]));
    await timed("sqlite.query", 'select * from "B"', () => Promise.resolve([]));
    await timed("sqlite.write", 'update "A" set x = ?', () => Promise.resolve());
    vi.advanceTimersByTime(AGGREGATE_WINDOW_MS);

    expect(events).toHaveLength(3);
  });

  it("emits nothing for an empty window, and starts counting afresh after a flush", async () => {
    vi.advanceTimersByTime(AGGREGATE_WINDOW_MS * 3);
    expect(events).toEqual([]);

    clock([0, 2], [0, 3]);
    await timed("sqlite.query", SELECT_USERS, () => Promise.resolve([]));
    vi.advanceTimersByTime(AGGREGATE_WINDOW_MS);
    await timed("sqlite.query", SELECT_USERS, () => Promise.resolve([]));
    vi.advanceTimersByTime(AGGREGATE_WINDOW_MS);

    expect(events.map((e) => e.attrs?.count)).toEqual([1, 1]);
  });

  it("flushes when the page goes away", async () => {
    const handlers = new Map<string, () => void>();
    const target = {
      addEventListener: (type: string, handler: () => void) => handlers.set(type, handler),
      visibilityState: "visible",
    };
    vi.stubGlobal("document", target);
    vi.stubGlobal("window", target);

    clock([0, 2]);
    await timed("sqlite.query", SELECT_USERS, () => Promise.resolve([]));
    expect(events).toEqual([]);

    handlers.get("pagehide")!();
    expect(events).toHaveLength(1);
    expect(events[0].attrs).toMatchObject({ count: 1 });
  });

  it("flushes when the page is hidden, and not when it is shown", async () => {
    const handlers = new Map<string, () => void>();
    const target = {
      addEventListener: (type: string, handler: () => void) => handlers.set(type, handler),
      visibilityState: "visible",
    };
    vi.stubGlobal("document", target);
    vi.stubGlobal("window", target);

    clock([0, 2]);
    await timed("sqlite.query", SELECT_USERS, () => Promise.resolve([]));

    handlers.get("visibilitychange")!();
    expect(events).toEqual([]);

    target.visibilityState = "hidden";
    handlers.get("visibilitychange")!();
    expect(events).toHaveLength(1);
  });

  it("never sends SQL text or a value, only the op and the table names", async () => {
    clock([0, 2], [0, 90]);
    const sql = 'select "u"."email", "u"."salary" from "Users" as "u" where "u"."id" = ?';
    await timed("sqlite.query", sql, () => Promise.resolve([{ email: "person@example.com" }]));
    await timed("sqlite.query", sql, () => Promise.resolve([{ email: "person@example.com" }]));
    vi.advanceTimersByTime(AGGREGATE_WINDOW_MS);

    const serialised = JSON.stringify(events);
    expect(serialised).toContain("Users");
    // The op ("select") is meant to be there; the statement around it is not.
    for (const leaked of ["email", "salary", "where", "from", '"u"', "person@example.com"]) {
      expect(serialised).not.toContain(leaked);
    }
  });

  it("writes nothing to the console", async () => {
    const debug = vi.spyOn(console, "debug").mockImplementation(() => {});
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    clock([0, 2], [0, 90]);
    await timed("sqlite.query", SELECT_USERS, () => Promise.resolve([]));
    await timed("sqlite.query", SELECT_USERS, () => Promise.resolve([]));
    vi.advanceTimersByTime(AGGREGATE_WINDOW_MS);
    expect(debug).not.toHaveBeenCalled();
    expect(log).not.toHaveBeenCalled();
  });
});
