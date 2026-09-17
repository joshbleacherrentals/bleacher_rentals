import { beforeEach, describe, expect, it, vi } from "vitest";
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

const singleExecutes: CompiledQuery[] = [];
const batches: CompiledQuery[][] = [];

vi.mock("@/components/providers/SystemProvider", () => ({
  get db() {
    return testDb;
  },
}));

vi.mock("@/lib/powersync/typedQuery", () => ({
  expect: () => undefined,
  typedGetAll: () => Promise.resolve([]),
  typedExecute: (compiled: CompiledQuery) => {
    singleExecutes.push(compiled);
    return Promise.resolve();
  },
  typedExecuteBatch: (statements: CompiledQuery[]) => {
    batches.push(statements);
    return Promise.resolve();
  },
}));

import { syncWorkTrackerLineItems, type DraftWorkTrackerLineItem } from "./workTrackerLineItems";

const item = (id: string): DraftWorkTrackerLineItem => ({
  id,
  type: "custom",
  qtyDecimal: 1,
  unitAmtCents: 500,
  description: null,
  isAutomaticallyManaged: false,
});

beforeEach(() => {
  singleExecutes.length = 0;
  batches.length = 0;
});

describe("syncWorkTrackerLineItems", () => {
  it("replaces the stored items in a single transaction", async () => {
    await syncWorkTrackerLineItems("wt-1", [item("li-1"), item("li-2")]);

    // This is the one write the user actually waits for on save: it was a
    // delete plus N inserts as separate IndexedDB transactions.
    expect(batches).toHaveLength(1);
    expect(singleExecutes).toHaveLength(0);
  });

  it("deletes the old items before inserting the new ones", async () => {
    await syncWorkTrackerLineItems("wt-1", [item("li-1"), item("li-2")]);

    const kinds = batches[0].map((s) => (s.sql.startsWith("delete") ? "delete" : "insert"));
    expect(kinds).toEqual(["delete", "insert", "insert"]);
  });

  it("still clears the stored items when the draft list is empty", async () => {
    await syncWorkTrackerLineItems("wt-1", []);

    expect(batches).toHaveLength(1);
    expect(batches[0]).toHaveLength(1);
    expect(batches[0][0].sql).toContain("delete");
  });
});
