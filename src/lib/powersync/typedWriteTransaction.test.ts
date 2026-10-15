import { beforeEach, describe, expect, it, vi } from "vitest";
import { DatabaseSync } from "node:sqlite";
import { createFakePowerSyncDb, type FakePowerSyncDb } from "./testing/fakePowerSyncDb";

// Spec: docs/specs/slow-local-db-step2-fewer-calls.md §3.0 and §7.

const { holder } = vi.hoisted(() => ({ holder: { current: null as unknown } }));

vi.mock("@/components/providers/SystemProvider", () => {
  const fake = () => holder.current as FakePowerSyncDb;
  return {
    db: {},
    powerSyncDb: {
      getAll: (...args: Parameters<FakePowerSyncDb["getAll"]>) => fake().getAll(...args),
      execute: (...args: Parameters<FakePowerSyncDb["execute"]>) => fake().execute(...args),
      writeTransaction: (...args: Parameters<FakePowerSyncDb["writeTransaction"]>) =>
        fake().writeTransaction(...args),
    },
  };
});

import { dbOpCounts, resetPerfCounters } from "@/lib/perf/perfTrace";
import { typedWriteTransaction } from "./typedQuery";

let sqlite: DatabaseSync;
let fake: FakePowerSyncDb;

const rowsOf = () => sqlite.prepare(`select id, label from "Things" order by id`).all();

beforeEach(() => {
  sqlite = new DatabaseSync(":memory:");
  sqlite.exec(`create table "Things" (id text primary key, label text)`);
  fake = createFakePowerSyncDb(sqlite);
  holder.current = fake;
  resetPerfCounters();
});

describe("typedWriteTransaction", () => {
  it("runs the work in one write transaction and returns what the work returns", async () => {
    const result = await typedWriteTransaction(async (tx) => {
      await tx.execute(`insert into "Things" values (?, ?)`, ["a", "one"]);
      await tx.execute(`insert into "Things" values (?, ?)`, ["b", "two"]);
      return "done";
    });

    expect(result).toBe("done");
    expect(fake.stats.writeTransactions).toBe(1);
    expect(rowsOf()).toHaveLength(2);
  });

  it("lets a read inside the transaction see the writes made before it", async () => {
    const seen = await typedWriteTransaction(async (tx) => {
      await tx.execute(`insert into "Things" values (?, ?)`, ["a", "one"]);
      return tx.getAll<{ id: string }>(`select id from "Things" where label = ?`, ["one"]);
    });

    expect(seen).toEqual([{ id: "a" }]);
    expect(fake.stats.writeTransactions).toBe(1);
  });

  it("counts one write transaction and every statement it ran in perfLog", async () => {
    await typedWriteTransaction(async (tx) => {
      await tx.getAll(`select id from "Things"`);
      await tx.execute(`insert into "Things" values (?, ?)`, ["a", "one"]);
      await tx.execute(`insert into "Things" values (?, ?)`, ["b", "two"]);
    });

    expect(dbOpCounts()).toMatchObject({ writeTransactions: 1, writeStatements: 3 });
  });

  it("rolls everything back and rethrows the same error when the work fails", async () => {
    const failure = new Error("boom");

    await expect(
      typedWriteTransaction(async (tx) => {
        await tx.execute(`insert into "Things" values (?, ?)`, ["a", "one"]);
        throw failure;
      }),
    ).rejects.toBe(failure);

    expect(rowsOf()).toEqual([]);
    expect(dbOpCounts().writeTransactions).toBe(1);
  });

  it("still counts a transaction whose work ran no statement", async () => {
    await typedWriteTransaction(async () => undefined);
    expect(dbOpCounts()).toMatchObject({ writeTransactions: 1, writeStatements: 0 });
  });
});
