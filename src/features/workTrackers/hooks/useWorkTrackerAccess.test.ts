import { describe, expect, it, beforeEach, vi } from "vitest";
import { DatabaseSync } from "node:sqlite";
import {
  Kysely,
  DummyDriver,
  SqliteAdapter,
  SqliteIntrospector,
  SqliteQueryCompiler,
  type CompiledQuery,
} from "kysely";

// Same harness as useIncomplete.test.ts: the module compiles its SQL with the app's Kysely
// instance and the compiled text runs against a real SQLite database, so this checks what the
// query returns for each role rather than how it is spelled.
const testDb = new Kysely<any>({
  dialect: {
    createAdapter: () => new SqliteAdapter(),
    createDriver: () => new DummyDriver(),
    createIntrospector: (d) => new SqliteIntrospector(d),
    createQueryCompiler: () => new SqliteQueryCompiler(),
  },
});

vi.mock("@/components/providers/SystemProvider", () => ({
  get db() {
    return testDb;
  },
}));

vi.mock("@/lib/powersync/typedQuery", () => ({
  expect: () => undefined,
  useTypedQuery: () => ({ data: [] }),
}));

const { buildWorkTrackerAccessQuery, toWorkTrackerAccess } = await import("./useDriversForWeek");

let sqlite: DatabaseSync;

function run<T>(compiled: CompiledQuery): T[] {
  return sqlite.prepare(compiled.sql).all(...(compiled.parameters as any[])) as T[];
}

/** Local PowerSync tables: booleans are 0/1. */
beforeEach(() => {
  sqlite = new DatabaseSync(":memory:");
  sqlite.exec(`
    create table "Users" (id text primary key, is_admin integer);
    create table "AccountManagers" (id text primary key, user_uuid text, is_active integer);
    create table "Accountants"     (id text primary key, user_uuid text, is_active integer);
  `);
});

function addUser(id: string, isAdmin = 0) {
  sqlite.prepare(`insert into "Users" (id, is_admin) values (?, ?)`).run(id, isAdmin);
}

function grant(table: "AccountManagers" | "Accountants", userUuid: string, isActive = 1) {
  sqlite
    .prepare(`insert into "${table}" (id, user_uuid, is_active) values (?, ?, ?)`)
    .run(`${table}_${userUuid}`, userUuid, isActive);
}

function accessOf(userUuid: string) {
  const rows = run<any>(buildWorkTrackerAccessQuery(userUuid));
  return toWorkTrackerAccess(userUuid, rows)!;
}

describe("work tracker access, as read from the local database", () => {
  it("knows an active accountant", () => {
    addUser("u1");
    grant("Accountants", "u1");

    expect(accessOf("u1")).toEqual({
      isAdmin: false,
      isAccountManager: false,
      isAccountant: true,
      accountManagerUuid: null,
    });
  });

  it("does not treat a deactivated accountant row as the role", () => {
    addUser("u1");
    grant("Accountants", "u1", 0);

    expect(accessOf("u1").isAccountant).toBe(false);
  });

  it("keeps an account manager an account manager, and not an accountant", () => {
    addUser("u1");
    grant("AccountManagers", "u1");

    expect(accessOf("u1")).toEqual({
      isAdmin: false,
      isAccountManager: true,
      isAccountant: false,
      accountManagerUuid: "AccountManagers_u1",
    });
  });

  it("holds both roles for a user who is an account manager and an accountant", () => {
    addUser("u1");
    grant("AccountManagers", "u1");
    grant("Accountants", "u1");

    const access = accessOf("u1");
    expect(access.isAccountManager).toBe(true);
    expect(access.isAccountant).toBe(true);
    expect(access.accountManagerUuid).toBe("AccountManagers_u1");
  });

  it("returns one row per user, however the roles combine", () => {
    addUser("u1", 1);
    grant("AccountManagers", "u1");
    grant("Accountants", "u1");

    expect(run(buildWorkTrackerAccessQuery("u1"))).toHaveLength(1);
    expect(accessOf("u1").isAdmin).toBe(true);
  });

  it("has no access to report until the current user is known", () => {
    expect(toWorkTrackerAccess(null, [])).toBeNull();
  });

  it("is a user with no roles at all when the row is not on the device yet", () => {
    expect(toWorkTrackerAccess("u1", [])).toEqual({
      isAdmin: false,
      isAccountManager: false,
      isAccountant: false,
      accountManagerUuid: null,
    });
  });
});
