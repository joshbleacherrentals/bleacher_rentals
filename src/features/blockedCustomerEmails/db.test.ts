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

vi.mock("@/components/providers/SystemProvider", () => ({
  get db() {
    return testDb;
  },
}));

const executed: CompiledQuery[] = [];

vi.mock("@/lib/powersync/typedQuery", () => ({
  expect: () => undefined,
  typedExecute: async (statement: CompiledQuery) => {
    executed.push(statement);
  },
}));

import { addBlockedEmail, deleteBlockedEmail, updateBlockedEmail } from "./db";

beforeEach(() => {
  executed.length = 0;
});

describe("addBlockedEmail", () => {
  it("inserts the address with the signed-in user as its creator", async () => {
    await addBlockedEmail("mike@bleacherrentals.com", "user-1");

    const [insert] = executed;
    expect(insert.sql).toMatch(/^insert into "BlockedCustomerEmails"/);
    expect(insert.parameters).toContain("mike@bleacherrentals.com");
    expect(insert.parameters).toContain("user-1");
  });

  it("gives each row its own id and stamps both dates", async () => {
    await addBlockedEmail("a@x.com", "user-1");
    await addBlockedEmail("b@x.com", "user-1");

    const idOf = (q: CompiledQuery) =>
      q.parameters.find((p) => typeof p === "string" && /^[0-9a-f-]{36}$/.test(p));
    expect(idOf(executed[0])).toBeDefined();
    expect(idOf(executed[0])).not.toBe(idOf(executed[1]));
    expect(
      executed[0].parameters.filter((p) => typeof p === "string" && p.includes("T")),
    ).toHaveLength(2);
  });
});

describe("updateBlockedEmail", () => {
  it("changes the address and the updated time of that one row", async () => {
    await updateBlockedEmail("row-1", "new@x.com");

    const [update] = executed;
    expect(update.sql).toMatch(
      /^update "BlockedCustomerEmails" set "email" = \?, "updated_at" = \?/,
    );
    expect(update.sql).toMatch(/where "id" = \?$/);
    expect(update.parameters[0]).toBe("new@x.com");
    expect(update.parameters[update.parameters.length - 1]).toBe("row-1");
  });
});

describe("deleteBlockedEmail", () => {
  it("deletes that one row", async () => {
    await deleteBlockedEmail("row-1");

    expect(executed[0].sql).toBe('delete from "BlockedCustomerEmails" where "id" = ?');
    expect(executed[0].parameters).toEqual(["row-1"]);
  });
});
