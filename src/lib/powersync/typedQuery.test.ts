import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { powerSyncDb } = vi.hoisted(() => ({
  powerSyncDb: {
    getAll: vi.fn(),
    execute: vi.fn(),
    writeTransaction: vi.fn(),
  },
}));

vi.mock("@/components/providers/SystemProvider", () => ({ powerSyncDb, db: {} }));
vi.mock("@powersync/react", () => ({ useQuery: vi.fn() }));

import { resetEventContextForTests } from "@/lib/perf/eventContext";
import { setMetricsSink } from "@/lib/perf/metrics";
import { dbOpCounts, resetPerfCounters } from "@/lib/perf/perfTrace";
import { resetSqliteTimingForTests } from "@/lib/perf/sqliteTiming";
import type { PerfEvent } from "@/lib/perf/telemetryEvent";
import { typedExecute, typedExecuteBatch, typedGetAll } from "./typedQuery";

let events: PerfEvent[];

const compiled = (sql: string, parameters: unknown[] = []) => ({ sql, parameters }) as never;

beforeEach(() => {
  events = [];
  vi.stubEnv("NODE_ENV", "development");
  vi.spyOn(console, "debug").mockImplementation(() => {});
  resetEventContextForTests();
  resetSqliteTimingForTests();
  resetPerfCounters();
  setMetricsSink((event) => events.push(event));
  powerSyncDb.getAll.mockReset();
  powerSyncDb.execute.mockReset();
  powerSyncDb.writeTransaction.mockReset();
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  setMetricsSink(null);
});

describe("typedGetAll", () => {
  it("still returns what the database returned, with the same sql and parameters", async () => {
    powerSyncDb.getAll.mockResolvedValue([{ id: "1" }]);
    const rows = await typedGetAll(compiled('select "id" from "Users" where "id" = ?', ["u1"]), {
      id: "1",
    } as never);

    expect(rows).toEqual([{ id: "1" }]);
    expect(powerSyncDb.getAll).toHaveBeenCalledWith('select "id" from "Users" where "id" = ?', [
      "u1",
    ]);
  });

  it("records a sqlite.query with the op, the tables and the number of rows", async () => {
    powerSyncDb.getAll.mockResolvedValue([{}, {}, {}]);
    await typedGetAll(compiled('select * from "Users"'), undefined as never);

    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ name: "sqlite.query", outcome: "ok" });
    expect(events[0].attrs).toEqual({ op: "select", tables: "Users", rows: 3 });
  });

  it("never records a parameter", async () => {
    powerSyncDb.getAll.mockResolvedValue([]);
    await typedGetAll(
      compiled('select * from "Users" where "email" = ?', ["person@example.com"]),
      undefined as never,
    );
    expect(JSON.stringify(events)).not.toContain("person@example.com");
  });

  it("still counts the read for perfTrace, exactly once", async () => {
    powerSyncDb.getAll.mockResolvedValue([]);
    await typedGetAll(compiled('select * from "Users"'), undefined as never);
    expect(dbOpCounts().reads).toBe(1);
  });

  it("rejects with the original error and records it", async () => {
    const failure = new Error("locked");
    powerSyncDb.getAll.mockRejectedValue(failure);
    await expect(typedGetAll(compiled('select * from "Users"'), undefined as never)).rejects.toBe(
      failure,
    );
    expect(events[0]).toMatchObject({ outcome: "error" });
  });
});

describe("typedExecute", () => {
  it("returns the database's result and records a sqlite.write", async () => {
    powerSyncDb.execute.mockResolvedValue({ rowsAffected: 1 });
    const result = await typedExecute(
      compiled('update "Events" set "name" = ? where "id" = ?', ["Secret name", "e1"]),
    );

    expect(result).toEqual({ rowsAffected: 1 });
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ name: "sqlite.write", outcome: "ok" });
    expect(events[0].attrs).toEqual({ op: "update", tables: "Events" });
    expect(JSON.stringify(events)).not.toContain("Secret name");
  });

  it("still counts the write for perfTrace", async () => {
    powerSyncDb.execute.mockResolvedValue(undefined);
    await typedExecute(compiled('delete from "Events" where "id" = ?', ["e1"]));
    expect(dbOpCounts().writeTransactions).toBe(1);
    expect(dbOpCounts().writeStatements).toBe(1);
  });

  it("rejects with the original error and records it", async () => {
    const failure = Object.assign(new Error("constraint"), { code: "23505" });
    powerSyncDb.execute.mockRejectedValue(failure);
    await expect(typedExecute(compiled('insert into "Events" values (?)'))).rejects.toBe(failure);
    expect(events[0]).toMatchObject({ outcome: "error", errorKind: "pg:23505" });
  });
});

describe("typedExecuteBatch", () => {
  it("runs every statement in one transaction and records one event with the statement count", async () => {
    const tx = { execute: vi.fn().mockResolvedValue(undefined) };
    powerSyncDb.writeTransaction.mockImplementation(async (work: (t: typeof tx) => Promise<void>) =>
      work(tx),
    );

    await typedExecuteBatch([
      compiled('insert into "Alerts" values (?)', ["a"]),
      compiled('insert into "Alerts" values (?)', ["b"]),
      compiled('insert into "Alerts" values (?)', ["c"]),
    ]);

    expect(powerSyncDb.writeTransaction).toHaveBeenCalledTimes(1);
    expect(tx.execute).toHaveBeenCalledTimes(3);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ name: "sqlite.batch", outcome: "ok" });
    expect(events[0].attrs).toEqual({ op: "insert", tables: "Alerts", statements: 3 });
  });

  it("does nothing, and records nothing, for an empty batch", async () => {
    await typedExecuteBatch([]);
    expect(powerSyncDb.writeTransaction).not.toHaveBeenCalled();
    expect(events).toEqual([]);
  });

  it("still counts one transaction and N statements for perfTrace", async () => {
    powerSyncDb.writeTransaction.mockResolvedValue(undefined);
    await typedExecuteBatch([
      compiled('insert into "A" values (?)'),
      compiled('insert into "A" values (?)'),
    ]);
    expect(dbOpCounts().writeTransactions).toBe(1);
    expect(dbOpCounts().writeStatements).toBe(2);
  });

  it("records a failed transaction and rejects with the original error", async () => {
    const failure = new Error("rolled back");
    powerSyncDb.writeTransaction.mockRejectedValue(failure);
    await expect(typedExecuteBatch([compiled('insert into "A" values (?)')])).rejects.toBe(failure);
    expect(events[0]).toMatchObject({ name: "sqlite.batch", outcome: "error" });
  });
});
