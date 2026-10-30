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

const executed: CompiledQuery[] = [];

vi.mock("@/components/providers/SystemProvider", () => ({
  get db() {
    return testDb;
  },
}));

vi.mock("@/lib/powersync/typedQuery", () => ({
  typedExecute: (compiled: CompiledQuery) => {
    executed.push(compiled);
    return Promise.resolve();
  },
}));

import { updateContactName } from "./updateContactName";

beforeEach(() => {
  executed.length = 0;
});

describe("updateContactName", () => {
  it("writes the two name columns and nothing else", async () => {
    await updateContactName("contact-1", "Marie", "Tremblay");

    expect(executed).toHaveLength(1);
    expect(executed[0].sql).toBe(
      'update "Contacts" set "first_name" = ?, "last_name" = ? where "id" = ?',
    );
    expect(executed[0].parameters).toEqual(["Marie", "Tremblay", "contact-1"]);
  });

  it("trims both names and stores a blank last name as null", async () => {
    await updateContactName("contact-1", "  Marie ", "   ");

    expect(executed[0].parameters).toEqual(["Marie", null, "contact-1"]);
  });
});
