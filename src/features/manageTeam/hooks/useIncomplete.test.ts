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

// Same harness as annualInspections.test.ts: the module compiles its SQL with
// the app's Kysely instance, and the compiled text then runs against a real
// SQLite database — so this checks who the query actually returns rather than
// how it happens to be spelled.
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

const { buildIncompleteQuery } = await import("./useIncomplete");

let sqlite: DatabaseSync;

function run<T>(compiled: CompiledQuery): T[] {
  return sqlite.prepare(compiled.sql).all(...(compiled.parameters as any[])) as T[];
}

/** Local PowerSync tables: booleans are 0/1. */
beforeEach(() => {
  sqlite = new DatabaseSync(":memory:");
  sqlite.exec(`
    create table "Users" (
      id text primary key,
      first_name text,
      last_name text,
      email text,
      clerk_user_id text,
      created_at text,
      status_uuid text,
      is_admin integer,
      is_viewer integer
    );
    create table "AccountManagers" (id text primary key, user_uuid text, is_active integer);
    create table "Drivers"         (id text primary key, user_uuid text, is_active integer);
    create table "Developers"      (id text primary key, user_uuid text, is_active integer);
    create table "Maintainers"     (id text primary key, user_uuid text, is_active integer);
  `);
});

function addUser(id: string, opts: { isAdmin?: number; isViewer?: number } = {}) {
  sqlite
    .prepare(
      `insert into "Users"
         (id, first_name, last_name, email, clerk_user_id, created_at, status_uuid, is_admin, is_viewer)
       values (?, ?, 'Tester', ?, 'clerk_1', '2026-01-01T00:00:00Z', 'active', ?, ?)`,
    )
    .run(id, id, `${id}@example.com`, opts.isAdmin ?? 0, opts.isViewer ?? 0);
}

function grant(table: string, userUuid: string, isActive = 1) {
  sqlite
    .prepare(`insert into "${table}" (id, user_uuid, is_active) values (?, ?, ?)`)
    .run(`${table}_${userUuid}`, userUuid, isActive);
}

describe("buildIncompleteQuery", () => {
  it("lists a user who really has no role at all", () => {
    addUser("nobody");

    const rows = run<any>(buildIncompleteQuery());

    expect(rows.map((r) => r.userUuid)).toEqual(["nobody"]);
  });

  it("does not call a maintainer incomplete — the role is what they were hired for", () => {
    addUser("maint");
    grant("Maintainers", "maint");

    const rows = run<any>(buildIncompleteQuery());

    expect(rows).toHaveLength(0);
  });

  it("still lists a user whose maintainer row was deactivated", () => {
    addUser("expired");
    grant("Maintainers", "expired", 0);

    const rows = run<any>(buildIncompleteQuery());

    expect(rows.map((r) => r.userUuid)).toEqual(["expired"]);
  });

  it("leaves the roles it already knew about alone", () => {
    addUser("admin", { isAdmin: 1 });
    addUser("viewer", { isViewer: 1 });
    addUser("am");
    grant("AccountManagers", "am");
    addUser("driver");
    grant("Drivers", "driver");
    addUser("dev");
    grant("Developers", "dev");

    const rows = run<any>(buildIncompleteQuery());

    expect(rows).toHaveLength(0);
  });
});
