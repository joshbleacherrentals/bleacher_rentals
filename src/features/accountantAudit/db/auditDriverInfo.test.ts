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

import { STATUSES } from "@/features/manageTeam/constants";
import { buildAuditDriverInfoQuery, toAuditDriverInfo } from "./auditDriverInfo";

let sqlite: DatabaseSync;
const run = (id: string | null) => {
  const c = buildAuditDriverInfoQuery(id).compile();
  return sqlite.prepare(c.sql).all(...(c.parameters as any[])) as any[];
};

beforeEach(() => {
  sqlite = new DatabaseSync(":memory:");
  sqlite.exec(`
    create table Users (id text primary key, email text, phone text, first_name text, last_name text, status_uuid text);
    create table Addresses (id text primary key, street text, city text, state_province text, zip_postal text);
    create table Drivers (id text primary key, user_uuid text, address_uuid text, phone_number text, is_active integer);
    insert into Users values ('u1','a@x.com','111','Ann','Lee','active'), ('u2','b@x.com','222','Bob','Stone','inactive-status');
    insert into Addresses values ('a1','1 Main St','Springfield','IL','62701');
    insert into Drivers values ('d1','u1','a1','999',1), ('d2','u2',null,null,0);
  `);
});

describe("buildAuditDriverInfoQuery", () => {
  it("reads the driver's phone, email and address", () => {
    const [r] = run("d1");
    expect(r).toMatchObject({
      id: "d1",
      first_name: "Ann",
      last_name: "Lee",
      is_active: 1,
      phone_number: "999",
      phone: "111",
      email: "a@x.com",
      street: "1 Main St",
      city: "Springfield",
      state_province: "IL",
      zip_postal: "62701",
    });
  });
  it("reads the name and the active flag of a deactivated driver", () => {
    const [r] = run("d2");
    expect(r).toMatchObject({ first_name: "Bob", last_name: "Stone", is_active: 0 });
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
    id: "d1",
    first_name: null,
    last_name: null,
    is_active: 1,
    status_uuid: null,
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
    expect(toAuditDriverInfo(row({ email: "", street: "", phone: "" }))).toMatchObject({
      address: null,
      phone: null,
      email: null,
    });
  });
  it("is all null and empty for no row", () => {
    expect(toAuditDriverInfo(undefined)).toEqual({
      address: null,
      phone: null,
      email: null,
      firstName: "",
      lastName: "",
      isInactive: false,
    });
  });
  it("carries the name, trimmed, empty when missing (spec 05 R13)", () => {
    expect(toAuditDriverInfo(row({ first_name: " Ann ", last_name: "Lee" }))).toMatchObject({
      firstName: "Ann",
      lastName: "Lee",
    });
    expect(toAuditDriverInfo(row({ first_name: null, last_name: "" }))).toMatchObject({
      firstName: "",
      lastName: "",
    });
  });
  it("flags a deactivated driver: is_active 0 or null, or the inactive user status", () => {
    expect(toAuditDriverInfo(row({ is_active: 1 })).isInactive).toBe(false);
    expect(toAuditDriverInfo(row({ is_active: 0 })).isInactive).toBe(true);
    expect(toAuditDriverInfo(row({ is_active: null })).isInactive).toBe(true);
    expect(
      toAuditDriverInfo(row({ is_active: 1, status_uuid: STATUSES.inactive })).isInactive,
    ).toBe(true);
  });
});
