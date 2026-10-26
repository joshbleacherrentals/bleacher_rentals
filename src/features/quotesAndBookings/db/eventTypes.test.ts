import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  DummyDriver,
  Kysely,
  SqliteAdapter,
  SqliteIntrospector,
  SqliteQueryCompiler,
  type CompiledQuery,
} from "kysely";

// docs/specs/qbo-invoice-12c-manage-quote-types.md §4, §7: the quote types are written through
// PowerSync (`db` and the typed helpers), so both are replaced by fakes that record the compiled SQL.

const testDb = new Kysely<any>({
  dialect: {
    createAdapter: () => new SqliteAdapter(),
    createDriver: () => new DummyDriver(),
    createIntrospector: (db) => new SqliteIntrospector(db),
    createQueryCompiler: () => new SqliteQueryCompiler(),
  },
});

const executed: CompiledQuery[] = [];
const read: CompiledQuery[] = [];
// What each table answers when the type is looked up in it.
const usedBy = { Events: false, Prices: false };

vi.mock("@/components/providers/SystemProvider", () => ({
  get db() {
    return testDb;
  },
}));

vi.mock("@/lib/powersync/typedQuery", () => ({
  expect: <T>() => undefined as unknown as T,
  typedExecute: (compiled: CompiledQuery) => {
    executed.push(compiled);
    return Promise.resolve();
  },
  typedGetAll: (compiled: CompiledQuery) => {
    read.push(compiled);
    const table = /from "(Events|Prices)"/.exec(compiled.sql)?.[1] as "Events" | "Prices";
    return Promise.resolve(usedBy[table] ? [{ id: "row-1" }] : []);
  },
}));

import { createEventType, deleteEventType, isEventTypeInUse, renameEventType } from "./eventTypes";

beforeEach(() => {
  executed.length = 0;
  read.length = 0;
  usedBy.Events = false;
  usedBy.Prices = false;
  vi.useRealTimers();
});

describe("createEventType", () => {
  it("inserts one EventTypes row with a new uuid, the trimmed name, deleted 0, an ISO time and the creator", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-26T12:00:00.000Z"));

    const id = await createEventType("  Sale  ", "user-1");

    expect(executed).toHaveLength(1);
    const [insert] = executed;
    expect(insert.sql).toContain('insert into "EventTypes"');
    expect(id).toMatch(/^[0-9a-f-]{36}$/);
    const values = Object.fromEntries(
      ["id", "name", "deleted", "created_at", "created_by_user_uuid"].map((column) => [
        column,
        insert.parameters[
          /\(([^)]*)\)\s+values/
            .exec(insert.sql)![1]
            .split(",")
            .map((c) => c.trim().replace(/"/g, ""))
            .indexOf(column)
        ],
      ]),
    );
    expect(values).toEqual({
      id,
      name: "Sale",
      deleted: 0,
      created_at: "2026-10-26T12:00:00.000Z",
      created_by_user_uuid: "user-1",
    });
  });

  it("gives each type its own id", async () => {
    const first = await createEventType("A", "user-1");
    const second = await createEventType("B", "user-1");

    expect(first).not.toBe(second);
  });

  it.each([[""], ["   "], ["\t\n"]])(
    "refuses the blank name %j and inserts nothing",
    async (name) => {
      await expect(createEventType(name, "user-1")).rejects.toThrow(
        "Enter a name for the quote type.",
      );

      expect(executed).toEqual([]);
    },
  );
});

describe("renameEventType", () => {
  it("updates only the name, of only that type, with the trimmed name", async () => {
    await renameEventType("type-1", "  Festival ");

    expect(executed).toHaveLength(1);
    const [update] = executed;
    expect(update.sql).toContain('update "EventTypes"');
    expect(update.sql).toMatch(/set "name" = \?\s+where "id" = \?$/);
    expect(update.parameters).toEqual(["Festival", "type-1"]);
  });

  it.each([[""], ["  "]])("refuses the blank name %j and updates nothing", async (name) => {
    await expect(renameEventType("type-1", name)).rejects.toThrow(
      "Enter a name for the quote type.",
    );

    expect(executed).toEqual([]);
  });

  it("does not look at the other types: a name another type has is accepted", async () => {
    await renameEventType("type-1", "City");

    expect(read).toEqual([]);
    expect(executed).toHaveLength(1);
  });
});

describe("isEventTypeInUse", () => {
  it("is false for a type nothing refers to", async () => {
    expect(await isEventTypeInUse("type-1")).toBe(false);
  });

  it("is true for a type an event uses", async () => {
    usedBy.Events = true;

    expect(await isEventTypeInUse("type-1")).toBe(true);
  });

  it("is true for a type a price uses", async () => {
    usedBy.Prices = true;

    expect(await isEventTypeInUse("type-1")).toBe(true);
  });

  it("asks Events for any row of the type, a deleted quote included", async () => {
    await isEventTypeInUse("type-1");

    const events = read.find((q) => q.sql.includes('from "Events"'))!;
    expect(events.sql).toContain('"event_type_uuid" = ?');
    expect(events.sql).not.toContain("deleted");
    expect(events.sql).toMatch(/limit \?$|limit 1$/);
    expect(events.parameters).toContain("type-1");
  });

  it("asks Prices only for prices that are not deleted", async () => {
    await isEventTypeInUse("type-1");

    const prices = read.find((q) => q.sql.includes('from "Prices"'))!;
    expect(prices.sql).toContain('"event_type_uuid" = ?');
    expect(prices.sql).toContain('"deleted" = ?');
    expect(prices.parameters).toContain("type-1");
    expect(prices.parameters).toContain(0);
  });

  it("runs two queries and joins nothing", async () => {
    await isEventTypeInUse("type-1");

    expect(read).toHaveLength(2);
    for (const query of read) expect(query.sql).not.toMatch(/\bjoin\b/i);
  });

  it("writes nothing", async () => {
    usedBy.Events = true;

    await isEventTypeInUse("type-1");

    expect(executed).toEqual([]);
  });
});

describe("deleteEventType", () => {
  it("on a type an event uses: throws the message and writes nothing", async () => {
    usedBy.Events = true;

    await expect(deleteEventType("type-1", "City")).rejects.toThrow(
      "City is used by quotes or prices, so it cannot be deleted.",
    );

    expect(executed).toEqual([]);
  });

  it("on a type a price uses: throws the message and writes nothing", async () => {
    usedBy.Prices = true;

    await expect(deleteEventType("type-1", "Rural")).rejects.toThrow(
      "Rural is used by quotes or prices, so it cannot be deleted.",
    );

    expect(executed).toEqual([]);
  });

  it("on a free type: sets deleted to 1 for that id only", async () => {
    await deleteEventType("type-1", "Sale");

    expect(executed).toHaveLength(1);
    const [update] = executed;
    expect(update.sql).toContain('update "EventTypes"');
    expect(update.sql).toMatch(/set "deleted" = \?\s+where "id" = \?$/);
    expect(update.parameters).toEqual([1, "type-1"]);
  });

  it("never issues a DELETE", async () => {
    await deleteEventType("type-1", "Sale");
    usedBy.Events = true;
    await deleteEventType("type-2", "City").catch(() => undefined);

    for (const query of executed) expect(query.sql).not.toMatch(/^delete/i);
  });
});
