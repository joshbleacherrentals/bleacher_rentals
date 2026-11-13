import { describe, it, expect, vi, beforeEach } from "vitest";

// Spec: docs/specs/event-change-log-02-file-upload-delete.md §3 and §5. What is under test is the
// row each function hands to `typedExecute`: the columns RLS and the Log tab will read. The Kysely
// instance is never connected, and `typedExecute` is captured instead of run.
const { execute } = vi.hoisted(() => ({ execute: vi.fn() }));

vi.mock("@/lib/powersync/typedQuery", () => ({
  typedExecute: (compiled: unknown) => execute(compiled),
}));

vi.mock("@/components/providers/SystemProvider", async () => {
  const { Kysely, SqliteDialect } = await import("kysely");
  return { db: new Kysely<any>({ dialect: new SqliteDialect({ database: {} as any }) }) };
});

import { logFileDeleted, logFileUploaded } from "./logEventFile";

type Compiled = { sql: string; parameters: readonly unknown[] };

/** The values of the INSERT into EventChangeLog, keyed by column. */
function logged(compiled: Compiled) {
  const columns = [...compiled.sql.matchAll(/"([a-z_]+)"/g)]
    .map((m) => m[1])
    .filter((c) => c !== "EventChangeLog");
  return Object.fromEntries(columns.map((c, i) => [c, compiled.parameters[i]]));
}

/** The one statement the function wrote. */
function written(): Compiled {
  expect(execute).toHaveBeenCalledTimes(1);
  return execute.mock.calls[0][0] as Compiled;
}

const base = { eventId: "event-1", fileName: "Check_Scan.pdf", changedByUserUuid: "user-9" };

describe("logFileUploaded", () => {
  beforeEach(() => {
    execute.mockReset();
    execute.mockResolvedValue(undefined);
  });

  it("writes one INSERT into EventChangeLog", async () => {
    await logFileUploaded(base);
    expect(written().sql).toMatch(/^insert into "EventChangeLog"/i);
  });

  it("writes a file_upload row: field `file`, the name as the next value, no previous value", async () => {
    await logFileUploaded(base);
    expect(logged(written())).toMatchObject({
      event_uuid: "event-1",
      changed_by_user_uuid: "user-9",
      field_name: "file",
      prev_value: null,
      next_value: "Check_Scan.pdf",
      action_type: "file_upload",
    });
  });

  it("writes a null author when the user id is not loaded", async () => {
    await logFileUploaded({ ...base, changedByUserUuid: null });
    expect(logged(written()).changed_by_user_uuid).toBeNull();
  });

  it("never writes file_add, which belongs to the send dialog", async () => {
    await logFileUploaded(base);
    expect(logged(written()).action_type).not.toBe("file_add");
  });

  it("lets a failed write reach the caller, which decides what to do (R4)", async () => {
    execute.mockRejectedValueOnce(new Error("local db closed"));
    await expect(logFileUploaded(base)).rejects.toThrow("local db closed");
  });
});

describe("logFileDeleted", () => {
  beforeEach(() => {
    execute.mockReset();
    execute.mockResolvedValue(undefined);
  });

  it("writes a file_delete row: field `file`, the name as the previous value, no next value", async () => {
    await logFileDeleted(base);
    expect(written().sql).toMatch(/^insert into "EventChangeLog"/i);
    expect(logged(written())).toMatchObject({
      event_uuid: "event-1",
      changed_by_user_uuid: "user-9",
      field_name: "file",
      prev_value: "Check_Scan.pdf",
      next_value: null,
      action_type: "file_delete",
    });
  });

  it("writes a null author when the user id is not loaded", async () => {
    await logFileDeleted({ ...base, changedByUserUuid: null });
    expect(logged(written()).changed_by_user_uuid).toBeNull();
  });

  it("lets a failed write reach the caller", async () => {
    execute.mockRejectedValueOnce(new Error("local db closed"));
    await expect(logFileDeleted(base)).rejects.toThrow("local db closed");
  });
});
