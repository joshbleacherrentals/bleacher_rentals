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

// docs/specs/repairs-07-repair-window.md §3 and §7 (D100). Same harness as
// serviceWindowQueries.test.ts: the module compiles its SQL with the app's Kysely instance (behind a
// bound proxy) and the compiled text runs on an in-memory SQLite shaped like the local database.
const testDb = new Kysely<any>({
  dialect: {
    createAdapter: () => new SqliteAdapter(),
    createDriver: () => new DummyDriver(),
    createIntrospector: (d) => new SqliteIntrospector(d),
    createQueryCompiler: () => new SqliteQueryCompiler(),
  },
});

const boundDb = new Proxy({} as Kysely<any>, {
  get(_target, prop) {
    const value = (testDb as any)[prop];
    return typeof value === "function" ? value.bind(testDb) : value;
  },
});

let sqlite: DatabaseSync;

function run(compiled: CompiledQuery) {
  return sqlite.prepare(compiled.sql).all(...(compiled.parameters as any[])) as any[];
}

vi.mock("@/components/providers/SystemProvider", () => ({
  get db() {
    return boundDb;
  },
}));

const { buildVendorAddressQuery } = await import("./repairWindowQueries");

beforeEach(() => {
  sqlite = new DatabaseSync(":memory:");
  sqlite.exec(`
    create table "Addresses" (
      id text primary key, street text, city text, state_province text,
      zip_postal text, country text
    );
    create table "Vendors" (id text primary key, display_name text, address_uuid text);
    insert into "Addresses" values ('a1', '1 Trailer Way', 'Dallas', 'TX', '75201', 'US');
    insert into "Vendors" values
      ('v1', 'Dallas Trailer Repair', 'a1'),
      ('v2', 'No Address Welding', null),
      ('v3', 'Lost Address Tire', 'gone');
  `);
});

describe("buildVendorAddressQuery", () => {
  it("returns the city, the state and the country of the vendor's address", () => {
    expect(run(buildVendorAddressQuery("v1"))).toEqual([
      { id: "v1", city: "Dallas", stateProvince: "TX", country: "US" },
    ]);
  });

  it("returns the vendor with nulls when it has no address", () => {
    expect(run(buildVendorAddressQuery("v2"))).toEqual([
      { id: "v2", city: null, stateProvince: null, country: null },
    ]);
  });

  it("returns nulls too when the address is not on the device", () => {
    expect(run(buildVendorAddressQuery("v3"))).toEqual([
      { id: "v3", city: null, stateProvince: null, country: null },
    ]);
  });

  it("returns nothing for a vendor that is not on the device", () => {
    expect(run(buildVendorAddressQuery("nope"))).toEqual([]);
  });

  it("never reads the street or the postal code, and does not use db.fn", () => {
    const compiled = buildVendorAddressQuery("v1");
    expect(compiled.sql).not.toMatch(/street|zip_postal/i);
    expect(Object.keys(run(compiled)[0])).toEqual(["id", "city", "stateProvince", "country"]);
  });
});
