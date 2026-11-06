import { describe, it, expect, vi, beforeEach } from "vitest";
import { DatabaseSync, type SQLInputValue } from "node:sqlite";

// `saveNextTask` writes through `typedWriteTransaction`. The first half of this file captures the
// statements it sends; the second half runs the same statements on an in-memory SQLite.
type Statement = { sql: string; parameters: readonly unknown[] };

const { writeTransaction, setTx } = vi.hoisted(() => {
  const state: { tx: { execute: (sql: string, params?: unknown[]) => Promise<unknown> } } = {
    tx: { execute: async () => undefined },
  };
  return {
    writeTransaction: vi.fn(async (work: (tx: unknown) => Promise<unknown>) => work(state.tx)),
    setTx: (tx: typeof state.tx) => {
      state.tx = tx;
    },
  };
});

vi.mock("@/lib/powersync/typedQuery", () => ({
  typedWriteTransaction: (work: (tx: unknown) => Promise<unknown>) => writeTransaction(work),
}));

vi.mock("@/components/providers/SystemProvider", async () => {
  const { Kysely, SqliteDialect } = await import("kysely");
  // A dialect that is never connected: `.compile()` needs a query builder, not a database.
  return {
    db: new Kysely<any>({ dialect: new SqliteDialect({ database: {} as any }) }),
  };
});

import { NextTaskValidationError, saveNextTask } from "./saveNextTask";

const TODAY = "2026-11-15";
const EVENT = "e0000000-0000-4000-8000-000000000001";
const input = {
  eventUuid: EVENT,
  dueDate: "2026-11-17",
  note: "  Follow-up needed  ",
  today: TODAY,
};

describe("saveNextTask (statements)", () => {
  let sent: Statement[];

  beforeEach(() => {
    writeTransaction.mockClear();
    sent = [];
    setTx({
      execute: async (sql, params = []) => {
        sent.push({ sql, parameters: params });
      },
    });
  });

  it("sends exactly two statements in one transaction", async () => {
    await saveNextTask(input);
    expect(writeTransaction).toHaveBeenCalledTimes(1);
    expect(sent).toHaveLength(2);
  });

  it("completes the old tasks first, then inserts the new one", async () => {
    await saveNextTask(input);
    expect(sent[0].sql).toMatch(/^update "ArEventTasks"/i);
    expect(sent[1].sql).toMatch(/^insert into "ArEventTasks"/i);
  });

  it("completes only the open tasks of the given event", async () => {
    await saveNextTask(input);
    const { sql, parameters } = sent[0];
    expect(sql).toMatch(/set "completed" = \?/i);
    expect(sql).toMatch(/"event_uuid" = \?/);
    expect(sql).toMatch(/"completed" = \?/);
    expect(parameters).toEqual([1, EVENT, 0]);
  });

  it("inserts a uuid, an ISO created_at, completed 0 and the trimmed note", async () => {
    await saveNextTask(input);
    const { sql, parameters } = sent[1];
    const columns = [...sql.matchAll(/"([a-z_]+)"/g)].map((m) => m[1]);
    const row = Object.fromEntries(columns.map((c, i) => [c, parameters[i]]));
    expect(Object.keys(row).sort()).toEqual(
      ["completed", "created_at", "due_date", "event_uuid", "id", "note"].sort(),
    );
    expect(row.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(row.created_at).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    expect(row.completed).toBe(0);
    expect(row.note).toBe("Follow-up needed");
    expect(row.due_date).toBe("2026-11-17");
    expect(row.event_uuid).toBe(EVENT);
  });

  it("returns the id it inserted", async () => {
    const { taskId } = await saveNextTask(input);
    const columns = [...sent[1].sql.matchAll(/"([a-z_]+)"/g)].map((m) => m[1]);
    expect(sent[1].parameters[columns.indexOf("id")]).toBe(taskId);
  });

  it("writes nothing and throws the messages when validation fails", async () => {
    const error = await saveNextTask({ ...input, note: " ", dueDate: "2026-11-14" }).catch(
      (e: unknown) => e,
    );
    expect(error).toBeInstanceOf(NextTaskValidationError);
    expect((error as NextTaskValidationError).errors).toEqual([
      "Write a note for the next task.",
      "The date cannot be in the past.",
    ]);
    expect(writeTransaction).not.toHaveBeenCalled();
    expect(sent).toEqual([]);
  });

  it("surfaces a failed local write to the caller", async () => {
    setTx({
      execute: async () => {
        throw new Error("disk is full");
      },
    });
    await expect(saveNextTask(input)).rejects.toThrow(/disk is full/);
  });
});

describe("saveNextTask (in-memory SQLite)", () => {
  const OTHER = "e0000000-0000-4000-8000-000000000002";

  function run(sqlite: DatabaseSync) {
    setTx({
      execute: async (sql, params = []) => {
        sqlite.prepare(sql).run(...(params as SQLInputValue[]));
      },
    });
  }

  function seed(): DatabaseSync {
    const sqlite = new DatabaseSync(":memory:");
    sqlite.exec(`
      create table "ArEventTasks" (id text primary key, created_at text, due_date text,
        completed integer, note text, event_uuid text);
      insert into "ArEventTasks" values
        ('t1', '2026-11-01T00:00:00.000Z', '2026-11-10', 0, 'Remind', '${EVENT}'),
        ('t0', '2026-10-01T00:00:00.000Z', '2026-10-05', 1, 'Old, done', '${EVENT}'),
        ('t2', '2026-11-02T00:00:00.000Z', '2026-11-12', 0, 'Other event', '${OTHER}');
    `);
    return sqlite;
  }

  type TaskRow = { id: string; completed: number; note: string; due_date: string };
  const tasksOf = (sqlite: DatabaseSync, event: string) =>
    sqlite
      .prepare(
        `select id, completed, note, due_date from "ArEventTasks" where event_uuid = ? order by id`,
      )
      .all(event) as TaskRow[];

  it("leaves the event with one completed task more and exactly one open task", async () => {
    const sqlite = seed();
    run(sqlite);
    const { taskId } = await saveNextTask(input);

    const tasks = tasksOf(sqlite, EVENT);
    expect(tasks).toHaveLength(3);
    expect(tasks.filter((t) => t.completed === 0)).toEqual([
      { id: taskId, completed: 0, note: "Follow-up needed", due_date: "2026-11-17" },
    ]);
    expect(tasks.find((t) => t.id === "t1")).toMatchObject({ completed: 1, note: "Remind" });
    expect(tasks.find((t) => t.id === "t0")).toMatchObject({ completed: 1, note: "Old, done" });
  });

  it("does not touch another event", async () => {
    const sqlite = seed();
    run(sqlite);
    await saveNextTask(input);
    expect(tasksOf(sqlite, OTHER)).toEqual([
      { id: "t2", completed: 0, note: "Other event", due_date: "2026-11-12" },
    ]);
  });

  it("completes a task whose date has not come", async () => {
    const sqlite = seed();
    sqlite.exec(`update "ArEventTasks" set due_date = '2027-03-01' where id = 't1'`);
    run(sqlite);
    await saveNextTask(input);
    expect(tasksOf(sqlite, EVENT).find((t) => t.id === "t1")?.completed).toBe(1);
  });

  it("still inserts when the event has no open task", async () => {
    const sqlite = seed();
    sqlite.exec(`update "ArEventTasks" set completed = 1 where id = 't1'`);
    run(sqlite);
    await saveNextTask(input);
    expect(tasksOf(sqlite, EVENT).filter((t) => t.completed === 0)).toHaveLength(1);
  });
});
