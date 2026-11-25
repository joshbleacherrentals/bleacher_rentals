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

// docs/specs/repairs-05-toolbar.md §3 and §7. Same harness as repairListQueries.test.ts: the module
// compiles its SQL with the app's Kysely instance (behind a bound proxy) and the compiled text runs
// on an in-memory SQLite shaped like the local PowerSync database (booleans are 0/1).
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

const {
  buildBleacherOptionsQuery,
  buildZoneOptionsQuery,
  buildVendorOptionsQuery,
  buildCategoryOptionsQuery,
} = await import("./repairFilterQueries");

beforeEach(() => {
  sqlite = new DatabaseSync(":memory:");
  sqlite.exec(`
    create table "Bleachers" (id text primary key, bleacher_number integer, deleted integer);
    create table "Zones" (id text primary key, display_name text);
    create table "Vendors" (id text primary key, display_name text, is_active integer);
    create table "DamageCategories" (id text primary key, name text, is_active integer);
  `);
});

describe("buildBleacherOptionsQuery", () => {
  it("returns every bleacher with its number and its deleted flag", () => {
    sqlite.exec(`
      insert into "Bleachers" values ('b1', 52, 0), ('b2', 7, 1), ('b3', null, null);
    `);
    const rows = run(buildBleacherOptionsQuery());
    expect(rows).toHaveLength(3);
    expect(rows).toContainEqual({ id: "b1", bleacherNumber: 52, deleted: 0 });
    expect(rows).toContainEqual({ id: "b2", bleacherNumber: 7, deleted: 1 });
    expect(rows).toContainEqual({ id: "b3", bleacherNumber: null, deleted: null });
  });
});

describe("buildZoneOptionsQuery", () => {
  it("returns every zone with its name", () => {
    sqlite.exec(`insert into "Zones" values ('z1', 'Zone 1'), ('z2', null);`);
    const rows = run(buildZoneOptionsQuery());
    expect(rows).toHaveLength(2);
    expect(rows).toContainEqual({ id: "z1", name: "Zone 1" });
    expect(rows).toContainEqual({ id: "z2", name: null });
  });
});

describe("buildVendorOptionsQuery", () => {
  it("returns every vendor with its name and its active flag, switched-off ones too", () => {
    sqlite.exec(`
      insert into "Vendors" values ('v1', 'Caprock Tire', 1), ('v2', 'Old Shop', 0), ('v3', 'CURA', null);
    `);
    const rows = run(buildVendorOptionsQuery());
    expect(rows).toHaveLength(3);
    expect(rows).toContainEqual({ id: "v1", name: "Caprock Tire", isActive: 1 });
    expect(rows).toContainEqual({ id: "v2", name: "Old Shop", isActive: 0 });
    expect(rows).toContainEqual({ id: "v3", name: "CURA", isActive: null });
  });
});

describe("buildCategoryOptionsQuery", () => {
  it("returns every category with its name and its active flag, switched-off ones too", () => {
    sqlite.exec(`
      insert into "DamageCategories" values ('c1', 'Tires', 1), ('c2', 'Seating', 0);
    `);
    const rows = run(buildCategoryOptionsQuery());
    expect(rows).toHaveLength(2);
    expect(rows).toContainEqual({ id: "c1", name: "Tires", isActive: 1 });
    expect(rows).toContainEqual({ id: "c2", name: "Seating", isActive: 0 });
  });
});

describe("the app's bound db", () => {
  it("builds every query without touching db.fn", () => {
    expect(() => {
      buildBleacherOptionsQuery();
      buildZoneOptionsQuery();
      buildVendorOptionsQuery();
      buildCategoryOptionsQuery();
    }).not.toThrow();
  });
});
