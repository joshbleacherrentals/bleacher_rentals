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
  typedExecute: async (statement: CompiledQuery) => {
    executed.push(statement);
  },
}));

import { discardUnsentEmail, markEmailFailed } from "./unsentEmail";

beforeEach(() => {
  executed.length = 0;
});

describe("markEmailFailed", () => {
  it("marks the email as failed with the reason, but only while it is still being sent", async () => {
    await markEmailFailed("m-1", "You cannot send to external emails in development: a@b.com.");

    const [statement] = executed;
    expect(statement.sql).toMatch(/^update "EmailMessages" set "status" = \?, "error_text" = \?/);
    expect(statement.sql).toMatch(/"id" = \? and "status" = \?/);
    expect(statement.parameters).toEqual([
      "error",
      "You cannot send to external emails in development: a@b.com.",
      "m-1",
      "sending",
    ]);
  });

  it("keeps a very long reason to a sensible length", async () => {
    await markEmailFailed("m-1", "x".repeat(5000));

    expect((executed[0].parameters[1] as string).length).toBe(1000);
  });
});

describe("discardUnsentEmail", () => {
  it("deletes the email, and only while it was never sent", async () => {
    await discardUnsentEmail("m-1");

    const [statement] = executed;
    expect(statement.sql).toMatch(/^delete from "EmailMessages" where "id" = \? and "status" in/);
    expect(statement.parameters).toEqual(["m-1", "draft", "sending", "error"]);
  });
});
