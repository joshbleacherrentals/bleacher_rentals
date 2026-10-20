import { beforeEach, describe, expect, it, vi } from "vitest";
import { DatabaseSync } from "node:sqlite";
import {
  createFakePowerSyncDb,
  type FakePowerSyncDb,
} from "@/lib/powersync/testing/fakePowerSyncDb";
import type { LineItem } from "../types/quoteTypes";

// Spec: docs/specs/quote-detail-04-line-items-local.md §3, §6 and §7 (test 2).
//
// `syncEventLineItems` on a fake PowerSync database over Node's SQLite: what it writes, how many
// transactions it takes, and what a failure leaves behind.

const { holder } = vi.hoisted(() => ({ holder: { current: null as unknown } }));

vi.mock("@/components/providers/SystemProvider", async () => {
  const kysely = await import("kysely");
  const fake = () => holder.current as FakePowerSyncDb;
  return {
    db: new kysely.Kysely({
      dialect: {
        createAdapter: () => new kysely.SqliteAdapter(),
        createDriver: () => new kysely.DummyDriver(),
        createIntrospector: (db) => new kysely.SqliteIntrospector(db),
        createQueryCompiler: () => new kysely.SqliteQueryCompiler(),
      },
    }),
    powerSyncDb: {
      getAll: (...args: Parameters<FakePowerSyncDb["getAll"]>) => fake().getAll(...args),
      execute: (...args: Parameters<FakePowerSyncDb["execute"]>) => fake().execute(...args),
      writeTransaction: (...args: Parameters<FakePowerSyncDb["writeTransaction"]>) =>
        fake().writeTransaction(...args),
    },
  };
});

import { syncEventLineItems } from "./eventLineItems";

const EVENT = "ev-1";
const OTHER_EVENT = "ev-2";

let sqlite: DatabaseSync;
let fake: FakePowerSyncDb;

type Row = {
  id: string;
  event_uuid: string;
  header: string | null;
  description: string | null;
  bleacher_type_uuid: string | null;
  value_cents: number | null;
  quantity: number | null;
  currency: string | null;
  is_price_overridden: number | null;
  is_template: number | null;
  deleted: number | null;
  created_at: string | null;
};

function addRow(id: string, over: Partial<Row> = {}) {
  const row: Row = {
    id,
    event_uuid: EVENT,
    header: "15 Row",
    description: null,
    bleacher_type_uuid: "bt-15",
    value_cents: 50000,
    quantity: 2,
    currency: "USD",
    is_price_overridden: 0,
    is_template: 0,
    deleted: 0,
    created_at: "2026-01-01T00:00:00.000Z",
    ...over,
  };
  sqlite
    .prepare(
      `insert into "EventLineItems" (id, event_uuid, header, description, bleacher_type_uuid,
        value_cents, quantity, currency, is_price_overridden, is_template, deleted, created_at)
       values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      row.id,
      row.event_uuid,
      row.header,
      row.description,
      row.bleacher_type_uuid,
      row.value_cents,
      row.quantity,
      row.currency,
      row.is_price_overridden,
      row.is_template,
      row.deleted,
      row.created_at,
    );
}

const rows = () =>
  (sqlite.prepare(`select * from "EventLineItems" order by id`).all() as Row[]).map((r) => ({
    ...r,
  }));
const rowOf = (id: string) => rows().find((r) => r.id === id);

function item(over: Partial<LineItem> = {}): LineItem {
  return {
    id: "li-1",
    category: "bleachers",
    label: "15 Row",
    bleacherTypeUuid: "bt-15",
    qty: 2,
    unitPriceCents: 50000,
    lineTotalCents: 100000,
    overridePrice: false,
    discountType: "percentage",
    discountValue: 0,
    description: null,
    ...over,
  };
}

beforeEach(() => {
  sqlite = new DatabaseSync(":memory:");
  sqlite.exec(`create table "EventLineItems" (
    id text primary key, event_uuid text, header text, description text, bleacher_type_uuid text,
    value_cents integer, quantity integer, currency text, is_price_overridden integer,
    is_template integer, deleted integer, created_at text)`);
  fake = createFakePowerSyncDb(sqlite);
  holder.current = fake;
});

describe("syncEventLineItems", () => {
  it("writes nothing when the form's items are the rows", async () => {
    addRow("li-1");
    const before = rows();

    await syncEventLineItems(EVENT, [item()], "USD");

    expect(rows()).toEqual(before);
    // One transaction, and in it only the read of the event's rows: no write statement.
    expect(fake.stats.writeTransactions).toBe(1);
    expect(fake.stats.statements).toBe(1);
  });

  it("writes nothing the second time: a retry, or a second Save with the form still open", async () => {
    addRow("li-1");
    const items = [item(), item({ id: "li-2", label: "Delivery", bleacherTypeUuid: null })];

    await syncEventLineItems(EVENT, items, "USD");
    const afterFirst = rows();
    fake.stats.statements = 0;

    await syncEventLineItems(EVENT, items, "USD");

    expect(rows()).toEqual(afterFirst);
    expect(fake.stats.statements).toBe(1); // the read
  });

  it("updates only the row that changed and leaves its created_at alone", async () => {
    addRow("li-1");
    addRow("li-2", {
      header: "Delivery",
      bleacher_type_uuid: null,
      created_at: "2026-01-02T00:00:00.000Z",
    });
    fake.stats.statements = 0;

    await syncEventLineItems(
      EVENT,
      [item(), item({ id: "li-2", label: "Delivery", bleacherTypeUuid: null, qty: 5 })],
      "USD",
    );

    expect(rowOf("li-1")).toMatchObject({ quantity: 2, created_at: "2026-01-01T00:00:00.000Z" });
    expect(rowOf("li-2")).toMatchObject({ quantity: 5, created_at: "2026-01-02T00:00:00.000Z" });
    expect(fake.stats.statements).toBe(2); // the read and one update
  });

  it("inserts a new item under the form's id, as a live row with the time it was added", async () => {
    addRow("li-1");
    const startedAt = Date.now();

    await syncEventLineItems(
      EVENT,
      [
        item(),
        item({
          id: "new-1",
          label: "Custom",
          bleacherTypeUuid: null,
          overridePrice: true,
          description: "Note",
        }),
      ],
      "CAD",
    );

    const added = rowOf("new-1")!;
    expect(added).toMatchObject({
      event_uuid: EVENT,
      header: "Custom",
      description: "Note",
      bleacher_type_uuid: null,
      value_cents: 50000,
      quantity: 2,
      currency: "CAD",
      is_price_overridden: 1,
      is_template: 0,
      deleted: 0,
    });
    expect(Date.parse(added.created_at!)).toBeGreaterThanOrEqual(startedAt);
    expect(Date.parse(added.created_at!)).toBeLessThanOrEqual(Date.now());
  });

  it("deletes the rows that were removed from the form", async () => {
    addRow("li-1");
    addRow("li-2");
    addRow("li-3");

    await syncEventLineItems(EVENT, [item({ id: "li-2" })], "USD");

    expect(rows().map((r) => r.id)).toEqual(["li-2"]);
  });

  it("deletes every row when every item was removed", async () => {
    addRow("li-1");
    addRow("li-2");

    await syncEventLineItems(EVENT, [], "USD");

    expect(rows()).toEqual([]);
  });

  it("does delete, update and insert in one transaction", async () => {
    addRow("drop");
    addRow("edit");
    addRow("keep");
    fake.stats.writeTransactions = 0;

    await syncEventLineItems(
      EVENT,
      [item({ id: "keep" }), item({ id: "edit", qty: 9 }), item({ id: "added" })],
      "USD",
    );

    expect(rows().map((r) => r.id)).toEqual(["added", "edit", "keep"]);
    expect(rowOf("edit")!.quantity).toBe(9);
    expect(fake.stats.writeTransactions).toBe(1);
  });

  it("changes the currency of every row when it changed", async () => {
    addRow("li-1");
    addRow("li-2");

    await syncEventLineItems(EVENT, [item({ id: "li-1" }), item({ id: "li-2" })], "CAD");

    expect(rows().map((r) => r.currency)).toEqual(["CAD", "CAD"]);
  });

  it("leaves another event's rows alone", async () => {
    addRow("li-1");
    addRow("theirs", { event_uuid: OTHER_EVENT });

    await syncEventLineItems(EVENT, [], "USD");

    expect(rows().map((r) => r.id)).toEqual(["theirs"]);
  });

  it("leaves a row that is already deleted alone: not read, not purged", async () => {
    addRow("li-1");
    addRow("old", { deleted: 1 });

    await syncEventLineItems(EVENT, [], "USD");

    expect(rows().map((r) => r.id)).toEqual(["old"]);
    expect(rowOf("old")).toMatchObject({ deleted: 1 });
  });

  it("rolls everything back when a write fails part-way, and the error reaches the caller", async () => {
    addRow("drop");
    addRow("edit");
    // The id of the new item is a row of another event: the insert fails on the primary key.
    addRow("taken", { event_uuid: OTHER_EVENT });
    const before = rows();

    await expect(
      syncEventLineItems(EVENT, [item({ id: "edit", qty: 9 }), item({ id: "taken" })], "USD"),
    ).rejects.toThrow();

    expect(rows()).toEqual(before);
  });
});
