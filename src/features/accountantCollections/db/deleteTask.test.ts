import { beforeEach, describe, expect, it, vi } from "vitest";
import { DatabaseSync, type SQLInputValue } from "node:sqlite";

// Spec: docs/specs/accountant-collections-19-task-delete.md §3, §5 and §7. `deleteClosedTask`
// writes through `typedExecute`. The first half of this file captures the statement it sends; the
// second half runs the same statement on an in-memory SQLite.
type Compiled = { sql: string; parameters: readonly unknown[] };

const { typedExecute } = vi.hoisted(() => ({ typedExecute: vi.fn() }));

vi.mock("@/lib/powersync/typedQuery", () => ({ typedExecute }));

vi.mock("@/components/providers/SystemProvider", async () => {
  const { Kysely, SqliteDialect } = await import("kysely");
  // A dialect that is never connected: `.compile()` needs a query builder, not a database.
  return {
    db: new Kysely<any>({ dialect: new SqliteDialect({ database: {} as any }) }),
  };
});

import { deleteClosedTask } from "./deleteTask";

const TASK = "a0000000-0000-4000-8000-000000000001";
const OTHER = "a0000000-0000-4000-8000-000000000002";
const NOW = "2026-11-11T15:30:00.000Z";

describe("deleteClosedTask (statement)", () => {
  let sent: Compiled[];

  beforeEach(() => {
    typedExecute.mockReset();
    sent = [];
    typedExecute.mockImplementation(async (compiled: Compiled) => {
      sent.push(compiled);
    });
  });

  it("sends exactly one statement, an UPDATE of ArEventTasks, never a DELETE", async () => {
    await deleteClosedTask({ taskId: TASK, now: NOW });
    expect(typedExecute).toHaveBeenCalledTimes(1);
    expect(sent[0].sql).toMatch(/^update "ArEventTasks"/i);
    expect(sent[0].sql).not.toMatch(/\bdelete from\b/i);
  });

  it("sets deleted_at to the moment it was given and nothing else", async () => {
    await deleteClosedTask({ taskId: TASK, now: NOW });
    const set = /\bset (.*) where\b/i.exec(sent[0].sql)?.[1] ?? "";
    expect(set).toBe('"deleted_at" = ?');
    expect(sent[0].parameters[0]).toBe(NOW);
  });

  it("names the task by its id", async () => {
    await deleteClosedTask({ taskId: TASK, now: NOW });
    expect(sent[0].sql).toMatch(/where "id" = \?/);
    expect(sent[0].parameters[1]).toBe(TASK);
  });

  it("names both guards: the task is closed, and it is not deleted yet", async () => {
    await deleteClosedTask({ taskId: TASK, now: NOW });
    const { sql, parameters } = sent[0];
    // completed = 1 (a parameter), deleted_at is null (in the text).
    expect(sql).toMatch(/and "completed" = \?/);
    expect(sql).toMatch(/and "deleted_at" is null/);
    expect(parameters).toEqual([NOW, TASK, 1]);
  });

  it("surfaces a failed local write to the caller", async () => {
    typedExecute.mockRejectedValue(new Error("disk is full"));
    await expect(deleteClosedTask({ taskId: TASK, now: NOW })).rejects.toThrow(/disk is full/);
  });
});

describe("deleteClosedTask (in-memory SQLite)", () => {
  function seed(): DatabaseSync {
    const sqlite = new DatabaseSync(":memory:");
    sqlite.exec(`
      create table "ArEventTasks" (id text primary key, due_date text, completed integer,
        note text, event_uuid text, finished_at text, deleted_at text);
      insert into "ArEventTasks" values
        ('${TASK}', '2026-11-01', 1, 'Closed', 'e1', '2026-11-02T10:00:00.000Z', null),
        ('${OTHER}', '2026-11-03', 1, 'Another closed one', 'e1', null, null),
        ('t-open', '2026-11-12', 0, 'Open', 'e1', null, null),
        ('t-gone', '2026-10-01', 1, 'Deleted before', 'e1', null, '2026-10-05T08:00:00.000Z');
    `);
    return sqlite;
  }

  function run(sqlite: DatabaseSync) {
    typedExecute.mockReset();
    typedExecute.mockImplementation(async (compiled: Compiled) => {
      sqlite.prepare(compiled.sql).run(...(compiled.parameters as SQLInputValue[]));
    });
  }

  type Row = { id: string; completed: number; deleted_at: string | null; note: string };
  const rows = (sqlite: DatabaseSync) =>
    sqlite
      .prepare(`select id, completed, deleted_at, note from "ArEventTasks" order by id`)
      .all() as Row[];
  const byId = (sqlite: DatabaseSync, id: string) => rows(sqlite).find((r) => r.id === id);

  it("marks a closed task and keeps the row", async () => {
    const sqlite = seed();
    run(sqlite);
    await deleteClosedTask({ taskId: TASK, now: NOW });
    expect(byId(sqlite, TASK)).toEqual({
      id: TASK,
      completed: 1,
      deleted_at: NOW,
      note: "Closed",
    });
    expect(rows(sqlite)).toHaveLength(4);
  });

  it("does not touch any other task", async () => {
    const sqlite = seed();
    run(sqlite);
    await deleteClosedTask({ taskId: TASK, now: NOW });
    expect(byId(sqlite, OTHER)?.deleted_at).toBeNull();
    expect(byId(sqlite, "t-open")?.deleted_at).toBeNull();
    expect(byId(sqlite, "t-gone")?.deleted_at).toBe("2026-10-05T08:00:00.000Z");
  });

  it("never hides an open task, even when it is asked to (a stale click)", async () => {
    const sqlite = seed();
    run(sqlite);
    await deleteClosedTask({ taskId: "t-open", now: NOW });
    expect(byId(sqlite, "t-open")).toEqual({
      id: "t-open",
      completed: 0,
      deleted_at: null,
      note: "Open",
    });
  });

  it("keeps the first moment when a deleted task is deleted again", async () => {
    const sqlite = seed();
    run(sqlite);
    await deleteClosedTask({ taskId: "t-gone", now: NOW });
    expect(byId(sqlite, "t-gone")?.deleted_at).toBe("2026-10-05T08:00:00.000Z");
  });

  it("does nothing, and does not fail, for a task that does not exist", async () => {
    const sqlite = seed();
    run(sqlite);
    await expect(
      deleteClosedTask({ taskId: "a0000000-0000-4000-8000-0000000000ff", now: NOW }),
    ).resolves.toBeUndefined();
    expect(
      rows(sqlite)
        .filter((r) => r.deleted_at !== null)
        .map((r) => r.id),
    ).toEqual(["t-gone"]);
  });
});
