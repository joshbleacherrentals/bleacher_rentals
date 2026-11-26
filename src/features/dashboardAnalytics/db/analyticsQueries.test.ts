import { describe, expect, it, beforeEach, vi } from "vitest";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import {
  Kysely,
  DummyDriver,
  SqliteAdapter,
  SqliteIntrospector,
  SqliteQueryCompiler,
  type CompiledQuery,
} from "kysely";

// docs/specs/dashboard-analytics-04-data-numbers.md §2.1 and §5. Same harness as
// repairs/db/repairListQueries.test.ts: the module compiles its SQL with the app's Kysely instance
// and the compiled text runs on an in-memory SQLite shaped like the local PowerSync database
// (booleans are 0/1).
const testDb = new Kysely<any>({
  dialect: {
    createAdapter: () => new SqliteAdapter(),
    createDriver: () => new DummyDriver(),
    createIntrospector: (d) => new SqliteIntrospector(d),
    createQueryCompiler: () => new SqliteQueryCompiler(),
  },
});

// The app's `db` is a bound lazy proxy (SystemProvider) that strips the helper methods off
// `db.fn`. The queries are tested through the same proxy, so one that only works on a bare Kysely
// throws here instead of in the browser.
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
  buildAnalyticsRepairsQuery,
  buildAnalyticsServicesQuery,
  buildAnalyticsRepairBleachersQuery,
  buildAnalyticsBleachersQuery,
  buildAnalyticsZonesQuery,
  buildAnalyticsVendorsQuery,
  buildAnalyticsCategoriesQuery,
  buildAnalyticsBudgetsQuery,
} = await import("./analyticsQueries");

beforeEach(() => {
  sqlite = new DatabaseSync(":memory:");
  sqlite.exec(`
    create table "MaintenanceEvents" (
      id text primary key, event_name text, event_start text, event_end text, notes text,
      created_at text, deleted integer, status text, currency text, invoice_number text,
      completed_at text, cost_cents integer, vendor_uuid text, zone_uuid text
    );
    create table "MaintenanceLineItems" (
      id text primary key, maintenance_event_uuid text, bleacher_uuid text,
      damage_category_uuid text, severity text, description text, labor_cents integer,
      parts_cents integer, tax_cents integer, freight_cents integer, deleted integer,
      created_at text
    );
    create table "BleacherMaintEvents" (
      id text primary key, bleacher_uuid text, maintenance_event_uuid text, created_at text
    );
    create table "Bleachers" (
      id text primary key, bleacher_number integer, zone_uuid text, model_number text, deleted integer
    );
    create table "Zones" (id text primary key, display_name text, description text);
    create table "Vendors" (id text primary key, display_name text, created_at text);
    create table "DamageCategories" (id text primary key, name text, is_active integer);
    create table "MaintenanceBudgets" (
      id text primary key, created_at text, year integer, currency text, amount_cents integer
    );
  `);
});

function addRepair(id: string, deleted: number, extra: Record<string, unknown> = {}) {
  const r = {
    event_start: "2026-09-10",
    status: "inbound",
    currency: "USD",
    cost_cents: null,
    vendor_uuid: null,
    zone_uuid: null,
    ...extra,
  };
  sqlite
    .prepare(
      `insert into "MaintenanceEvents"
         (id, event_name, event_start, deleted, status, currency, cost_cents, vendor_uuid, zone_uuid)
       values (?, 'Maintenance / Repair', ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      id,
      r.event_start,
      deleted,
      r.status,
      r.currency,
      r.cost_cents,
      r.vendor_uuid,
      r.zone_uuid,
    );
}

function addService(
  id: string,
  repairId: string,
  deleted: number,
  extra: Record<string, unknown> = {},
) {
  const s = {
    bleacher_uuid: "b1",
    damage_category_uuid: null,
    labor_cents: 0,
    parts_cents: 0,
    tax_cents: 0,
    freight_cents: 0,
    ...extra,
  };
  sqlite
    .prepare(
      `insert into "MaintenanceLineItems"
         (id, maintenance_event_uuid, bleacher_uuid, damage_category_uuid, labor_cents, parts_cents,
          tax_cents, freight_cents, deleted)
       values (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      id,
      repairId,
      s.bleacher_uuid,
      s.damage_category_uuid,
      s.labor_cents,
      s.parts_cents,
      s.tax_cents,
      s.freight_cents,
      deleted,
    );
}

describe("buildAnalyticsRepairsQuery", () => {
  it("returns the live repairs only, with the columns of its row type", () => {
    addRepair("live", 0, {
      event_start: "2026-01-02",
      status: "in_repair",
      currency: "CAD",
      cost_cents: 1234,
      vendor_uuid: "v1",
      zone_uuid: "z1",
    });
    addRepair("gone", 1);
    const rows = run(buildAnalyticsRepairsQuery());
    expect(rows).toEqual([
      {
        id: "live",
        eventStart: "2026-01-02",
        status: "in_repair",
        currency: "CAD",
        zoneUuid: "z1",
        vendorUuid: "v1",
        costCents: 1234,
      },
    ]);
  });

  it("still returns a repair with no vendor, no zone and no cost", () => {
    addRepair("r1", 0);
    expect(run(buildAnalyticsRepairsQuery())).toEqual([
      {
        id: "r1",
        eventStart: "2026-09-10",
        status: "inbound",
        currency: "USD",
        zoneUuid: null,
        vendorUuid: null,
        costCents: null,
      },
    ]);
  });
});

describe("buildAnalyticsServicesQuery", () => {
  it("returns the live services of live repairs, with the columns of its row type", () => {
    addRepair("live", 0);
    addRepair("gone", 1);
    addService("s1", "live", 0, {
      bleacher_uuid: "b9",
      damage_category_uuid: "c1",
      labor_cents: 100,
      parts_cents: 200,
      tax_cents: 30,
      freight_cents: 40,
    });
    addService("s2", "live", 1); // the service itself is deleted
    addService("s3", "gone", 0); // its repair is deleted
    addService("s4", "no-such-repair", 0); // its repair is not there
    expect(run(buildAnalyticsServicesQuery())).toEqual([
      {
        id: "s1",
        repairId: "live",
        bleacherUuid: "b9",
        categoryUuid: "c1",
        laborCents: 100,
        partsCents: 200,
        taxCents: 30,
        freightCents: 40,
      },
    ]);
  });
});

describe("buildAnalyticsRepairBleachersQuery", () => {
  it("returns the junction rows of live repairs only, with the columns of its row type", () => {
    addRepair("live", 0);
    addRepair("gone", 1);
    const insert = sqlite.prepare(
      `insert into "BleacherMaintEvents" (id, bleacher_uuid, maintenance_event_uuid) values (?, ?, ?)`,
    );
    insert.run("j1", "b1", "live");
    insert.run("j2", "b2", "gone");
    insert.run("j3", "b3", "no-such-repair");
    expect(run(buildAnalyticsRepairBleachersQuery())).toEqual([
      { bleacherUuid: "b1", repairId: "live" },
    ]);
  });
});

describe("buildAnalyticsBleachersQuery", () => {
  it("returns the live bleachers only, with the columns of its row type", () => {
    const insert = sqlite.prepare(
      `insert into "Bleachers" (id, bleacher_number, zone_uuid, model_number, deleted) values (?, ?, ?, ?, ?)`,
    );
    insert.run("b1", 1, "z1", "TSP15-450", 0);
    insert.run("b2", 2, null, null, 0);
    insert.run("b3", 3, "z1", "X", 1);
    expect(run(buildAnalyticsBleachersQuery())).toEqual([
      { id: "b1", zoneUuid: "z1", modelNumber: "TSP15-450" },
      { id: "b2", zoneUuid: null, modelNumber: null },
    ]);
  });
});

describe("the lists", () => {
  it("returns every zone with its name", () => {
    sqlite.prepare(`insert into "Zones" (id, display_name) values ('z1', 'Zone 2')`).run();
    expect(run(buildAnalyticsZonesQuery())).toEqual([{ id: "z1", name: "Zone 2" }]);
  });

  it("returns every vendor, active or not, with its name", () => {
    sqlite.prepare(`insert into "Vendors" (id, display_name) values ('v1', 'Kaypark')`).run();
    sqlite.prepare(`insert into "Vendors" (id, display_name) values ('v2', 'Acme')`).run();
    expect(run(buildAnalyticsVendorsQuery())).toEqual([
      { id: "v1", name: "Kaypark" },
      { id: "v2", name: "Acme" },
    ]);
  });

  it("returns every damage category with its flag, the inactive ones too", () => {
    const insert = sqlite.prepare(
      `insert into "DamageCategories" (id, name, is_active) values (?, ?, ?)`,
    );
    insert.run("c1", "Welding", 1);
    insert.run("c2", "Old", 0);
    expect(run(buildAnalyticsCategoriesQuery())).toEqual([
      { id: "c1", name: "Welding", isActive: 1 },
      { id: "c2", name: "Old", isActive: 0 },
    ]);
  });

  it("returns the budgets with their year, currency and amount", () => {
    sqlite
      .prepare(
        `insert into "MaintenanceBudgets" (id, year, currency, amount_cents) values ('m1', 2026, 'USD', 1000000)`,
      )
      .run();
    expect(run(buildAnalyticsBudgetsQuery())).toEqual([
      { year: 2026, currency: "USD", amountCents: 1000000 },
    ]);
  });
});

describe("the app's bound db", () => {
  it("builds every query without touching db.fn", () => {
    // The bound proxy has no db.fn helpers; a builder that needed one would throw here.
    expect(() => {
      buildAnalyticsRepairsQuery();
      buildAnalyticsServicesQuery();
      buildAnalyticsRepairBleachersQuery();
      buildAnalyticsBleachersQuery();
      buildAnalyticsZonesQuery();
      buildAnalyticsVendorsQuery();
      buildAnalyticsCategoriesQuery();
      buildAnalyticsBudgetsQuery();
    }).not.toThrow();
  });

  it("does not use db.fn anywhere in its source", () => {
    // The file's comment says that no query uses it, so the comments are left out of the check.
    const source = readFileSync(new URL("./analyticsQueries.ts", import.meta.url), "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/\/\/.*$/gm, "");
    expect(source).not.toMatch(/\bdb\.fn\b/);
    expect(source).not.toMatch(/\bfn\./);
  });

  it("filters on deleted = 0 in the four queries that read live rows", () => {
    const sqls = [
      buildAnalyticsRepairsQuery(),
      buildAnalyticsServicesQuery(),
      buildAnalyticsRepairBleachersQuery(),
      buildAnalyticsBleachersQuery(),
    ].map((q) => q.sql);
    for (const sql of sqls) expect(sql).toMatch(/"deleted" = \?|"deleted" = 0/);
    // The services query checks the service and its repair.
    expect(sqls[1].match(/"deleted" =/g)).toHaveLength(2);
  });
});
