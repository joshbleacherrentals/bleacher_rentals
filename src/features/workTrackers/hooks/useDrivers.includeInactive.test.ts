import { beforeEach, describe, expect, it, vi } from "vitest";
import { DatabaseSync } from "node:sqlite";
import {
  DummyDriver,
  Kysely,
  SqliteAdapter,
  SqliteIntrospector,
  SqliteQueryCompiler,
} from "kysely";

// docs/specs/accountant-audit-02-driver-select.md §3 and §5: `buildDriversQuery` run on a real
// SQLite database. `includeInactive` drops the two "active" conditions; the scope still applies.

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
vi.mock("@/lib/powersync/typedQuery", () => ({ expect: () => undefined, useTypedQuery: vi.fn() }));
vi.mock("@/hooks/db/useCurrentUser", () => ({ useCurrentUser: vi.fn() }));
vi.mock("@/features/userAccess/state/usePermissionsStore", () => ({
  usePermissionsStore: vi.fn(),
}));

import { buildDriversQuery } from "./useDrivers.db";
import { STATUSES } from "@/features/manageTeam/constants";

let sqlite: DatabaseSync;

function addDriver(id: string, isActive: number, statusUuid: string) {
  sqlite
    .prepare(`insert into Users (id, first_name, last_name, email, status_uuid) values (?,?,?,?,?)`)
    .run(`u-${id}`, id, "X", `${id}@x.com`, statusUuid);
  sqlite
    .prepare(`insert into Drivers (id, user_uuid, is_active) values (?,?,?)`)
    .run(id, `u-${id}`, isActive);
}

const run = (opts: Parameters<typeof buildDriversQuery>[0]) => {
  const compiled = buildDriversQuery(opts);
  return (sqlite.prepare(compiled.sql).all(...(compiled.parameters as any[])) as any[])
    .map((r) => r.driver_uuid as string)
    .sort();
};

beforeEach(() => {
  sqlite = new DatabaseSync(":memory:");
  sqlite.exec(`
    create table Users (id text primary key, first_name text, last_name text, email text, status_uuid text);
    create table Drivers (id text primary key, user_uuid text, is_active integer, tax_dec real,
      pay_rate_cents integer, setup_cents integer, teardown_cents integer, pay_currency text, pay_per_unit text);
    create table DriverZones (driver_uuid text, zone_uuid text);
    create table AccountManagerZones (account_manager_uuid text, zone_uuid text);
  `);
  addDriver("active", 1, STATUSES.active);
  addDriver("flag-off", 0, STATUSES.active);
  addDriver("status-inactive", 1, STATUSES.inactive);
  addDriver("invited", 1, STATUSES.invited);
});

const user = { id: "me", is_admin: 1 };

describe("buildDriversQuery includeInactive", () => {
  it("without the option lists the active and the invited driver only", () => {
    expect(run({ currentUser: user, scope: { kind: "all" }, includeInactive: false })).toEqual([
      "active",
      "invited",
    ]);
  });

  it("with the option lists all four", () => {
    expect(run({ currentUser: user, scope: { kind: "all" }, includeInactive: true })).toEqual([
      "active",
      "flag-off",
      "invited",
      "status-inactive",
    ]);
  });

  it("still applies the zones scope in both cases", () => {
    sqlite.exec(`
      insert into DriverZones values ('flag-off','z1'), ('active','z2');
      insert into AccountManagerZones values ('am1','z1');
    `);
    const scope = { kind: "zones", accountManagerUuid: "am1" } as const;
    expect(run({ currentUser: user, scope, includeInactive: false })).toEqual([]);
    expect(run({ currentUser: user, scope, includeInactive: true })).toEqual(["flag-off"]);
  });
});
