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

const reads: CompiledQuery[] = [];
let bleacherRows: any[] = [];

vi.mock("@/components/providers/SystemProvider", () => ({
  get db() {
    return testDb;
  },
}));

vi.mock("@/lib/powersync/typedQuery", () => ({
  expect: () => undefined,
  typedGetAll: (compiled: CompiledQuery) => {
    reads.push(compiled);
    return Promise.resolve(bleacherRows);
  },
}));

import { readBleacherOptions } from "./readBleacherOptions";

beforeEach(() => {
  reads.length = 0;
  bleacherRows = [
    {
      id: "b-1",
      bleacher_number: 7,
      summer_account_manager_uuid: "am-1",
      winter_account_manager_uuid: null,
    },
    {
      id: "b-2",
      bleacher_number: 12,
      summer_account_manager_uuid: null,
      winter_account_manager_uuid: "am-2",
    },
  ];
});

describe("readBleacherOptions", () => {
  it("labels each option by its bleacher number", async () => {
    const options = await readBleacherOptions();

    expect(options).toEqual([
      { uuid: "b-1", label: "7" },
      { uuid: "b-2", label: "12" },
    ]);
  });

  it("excludes deleted bleachers in the query itself", async () => {
    await readBleacherOptions();

    // Local booleans are 0/1, so filtering on `false` would match nothing.
    expect(reads[0].sql).toContain('"deleted"');
    expect(reads[0].parameters).toContain(0);
  });

  it("keeps only the bleachers an account manager owns in either season", async () => {
    expect(await readBleacherOptions("am-2")).toEqual([{ uuid: "b-2", label: "12" }]);
    expect(await readBleacherOptions("am-1")).toEqual([{ uuid: "b-1", label: "7" }]);
  });
});
