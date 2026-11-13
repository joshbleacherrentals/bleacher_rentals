import { describe, it, expect, vi } from "vitest";

// What is under test is the statement the builder compiles: which columns, in which order, with
// which values. The Kysely instance is never connected — `.compile()` needs a query builder, not a
// database.
vi.mock("@/components/providers/SystemProvider", async () => {
  const { Kysely, SqliteDialect } = await import("kysely");
  return { db: new Kysely<any>({ dialect: new SqliteDialect({ database: {} as any }) }) };
});

import { eventLogInsert, type EventLogRow } from "./eventLogInsert";

type Compiled = { sql: string; parameters: readonly unknown[] };

/** The values of the INSERT into EventChangeLog, keyed by column. */
function logged(compiled: Compiled) {
  const columns = [...compiled.sql.matchAll(/"([a-z_]+)"/g)]
    .map((m) => m[1])
    .filter((c) => c !== "EventChangeLog");
  return Object.fromEntries(columns.map((c, i) => [c, compiled.parameters[i]]));
}

const base: EventLogRow = {
  eventId: "event-1",
  changedByUserUuid: "user-9",
  fieldName: "payment:pay-1",
  prevValue: null,
  nextValue: "$100.00 · Check · Aug 14, 2026",
  actionType: "payment_add",
};

describe("eventLogInsert", () => {
  it("compiles one INSERT into EventChangeLog", () => {
    const compiled = eventLogInsert(base);
    expect(compiled.sql).toMatch(/^insert into "EventChangeLog"/i);
    expect(compiled.sql).not.toMatch(/returning/i);
  });

  it("writes exactly the eight columns of a Log row, and no other", () => {
    const row = logged(eventLogInsert(base));
    expect(Object.keys(row).sort()).toEqual(
      [
        "action_type",
        "changed_at",
        "changed_by_user_uuid",
        "event_uuid",
        "field_name",
        "id",
        "next_value",
        "prev_value",
      ].sort(),
    );
  });

  it("writes the given values to the columns they belong to", () => {
    const row = logged(
      eventLogInsert({
        ...base,
        prevValue: "before",
        nextValue: "after",
        actionType: "payment_edit",
      }),
    );
    expect(row).toMatchObject({
      event_uuid: "event-1",
      changed_by_user_uuid: "user-9",
      field_name: "payment:pay-1",
      prev_value: "before",
      next_value: "after",
      action_type: "payment_edit",
    });
  });

  it("keeps a null author, a null previous value and a null next value as null", () => {
    const row = logged(
      eventLogInsert({ ...base, changedByUserUuid: null, prevValue: null, nextValue: null }),
    );
    expect(row.changed_by_user_uuid).toBeNull();
    expect(row.prev_value).toBeNull();
    expect(row.next_value).toBeNull();
  });

  it("lets a client_* action type through", () => {
    const row = logged(eventLogInsert({ ...base, actionType: "client_payment_received" }));
    expect(row.action_type).toBe("client_payment_received");
  });

  it("keeps the changedAt it is given", () => {
    const row = logged(eventLogInsert({ ...base, changedAt: "2026-08-14T15:30:00.000Z" }));
    expect(row.changed_at).toBe("2026-08-14T15:30:00.000Z");
  });

  it("uses a time near now when none is given", () => {
    const before = Date.now();
    const row = logged(eventLogInsert(base));
    const after = Date.now();

    const written = new Date(row.changed_at as string).getTime();
    expect(Number.isNaN(written)).toBe(false);
    expect(written).toBeGreaterThanOrEqual(before);
    expect(written).toBeLessThanOrEqual(after);
    // An ISO instant, like every other changed_at in the table.
    expect(row.changed_at).toBe(new Date(written).toISOString());
  });

  it("makes a new uuid for every row", () => {
    const first = logged(eventLogInsert(base)).id;
    const second = logged(eventLogInsert(base)).id;
    expect(first).toMatch(/^[0-9a-f-]{36}$/);
    expect(second).toMatch(/^[0-9a-f-]{36}$/);
    expect(first).not.toBe(second);
  });
});
