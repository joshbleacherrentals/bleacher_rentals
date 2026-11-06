import { beforeEach, describe, expect, it, vi } from "vitest";
import { DatabaseSync } from "node:sqlite";
import {
  DummyDriver,
  Kysely,
  SqliteAdapter,
  SqliteIntrospector,
  SqliteQueryCompiler,
} from "kysely";

// docs/specs/accountant-audit-02-driver-select.md §3 and §5 (R9).

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

import { buildAuditDriverInfoQuery, toAuditDriverInfo } from "./auditDriverInfo";

let sqlite: DatabaseSync;
const run = (id: string | null) => {
  const c = buildAuditDriverInfoQuery(id).compile();
  return sqlite.prepare(c.sql).all(...(c.parameters as any[])) as any[];
};

beforeEach(() => {
  sqlite = new DatabaseSync(":memory:");
  sqlite.exec(`
    create table Users (id text primary key, email text, phone text);
    create table Addresses (id text primary key, street text, city text, state_province text, zip_postal text);
    create table Drivers (id text primary key, user_uuid text, address_uuid text, phone_number text);
    insert into Users values ('u1','a@x.com','111'), ('u2','b@x.com','222');
    insert into Addresses values ('a1','1 Main St','Springfield','IL','62701');
    insert into Drivers values ('d1','u1','a1','999'), ('d2','u2',null,null);
  `);
});

describe("buildAuditDriverInfoQuery", () => {
  it("reads the driver's phone, email and address", () => {
    const [r] = run("d1");
    expect(r).toMatchObject({
      phone_number: "999",
      phone: "111",
      email: "a@x.com",
      street: "1 Main St",
      city: "Springfield",
      state_province: "IL",
      zip_postal: "62701",
    });
  });
  it("returns a driver with no address row, with null address parts", () => {
    const [r] = run("d2");
    expect(r.street).toBeNull();
    expect(r.phone_number).toBeNull();
    expect(r.phone).toBe("222");
  });
  it("returns no row for an unknown id and for null", () => {
    expect(run("nope")).toEqual([]);
    expect(run(null)).toEqual([]);
  });
});

describe("toAuditDriverInfo", () => {
  const row = (o = {}) => ({
    phone_number: null,
    phone: null,
    email: null,
    street: null,
    city: null,
    state_province: null,
    zip_postal: null,
    ...o,
  });
  it("builds the address line leaving out missing parts", () => {
    expect(
      toAuditDriverInfo(
        row({
          street: "1 Main St",
          city: "Springfield",
          state_province: "IL",
          zip_postal: "62701",
        }),
      ).address,
    ).toBe("1 Main St, Springfield, IL 62701");
    expect(toAuditDriverInfo(row({ street: "1 Main St", state_province: "IL" })).address).toBe(
      "1 Main St, IL",
    );
  });
  it("falls back from the driver's phone to the user's phone", () => {
    expect(toAuditDriverInfo(row({ phone_number: "999", phone: "111" })).phone).toBe("999");
    expect(toAuditDriverInfo(row({ phone_number: "  ", phone: "111" })).phone).toBe("111");
  });
  it("counts empty strings as missing", () => {
    expect(toAuditDriverInfo(row({ email: "", street: "", phone: "" }))).toEqual({
      address: null,
      phone: null,
      email: null,
    });
  });
  it("is all null for no row", () => {
    expect(toAuditDriverInfo(undefined)).toEqual({ address: null, phone: null, email: null });
  });
});
