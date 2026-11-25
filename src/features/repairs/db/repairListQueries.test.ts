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

// docs/specs/repairs-03-list-query.md §3 and §7. Same harness as accountantAudit/db: the module
// compiles its SQL with the app's Kysely instance and the compiled text runs on an in-memory
// SQLite shaped like the local PowerSync database (booleans are 0/1).
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
  buildRepairsQuery,
  buildServicesQuery,
  buildRepairBleachersQuery,
  buildReportsQuery,
  buildReportCategoriesQuery,
} = await import("./repairListQueries");

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
      id text primary key, bleacher_uuid text, maintenance_event_uuid text
    );
    create table "Bleachers" (id text primary key, bleacher_number integer, zone_uuid text);
    create table "Zones" (id text primary key, display_name text);
    create table "Vendors" (id text primary key, display_name text);
    create table "DamageCategories" (id text primary key, name text);
    create table "DamageReports" (
      id text primary key, bleacher_uuid text, created_at text, resolved_at text,
      maintenance_event_uuid text, deleted integer, photos_uploaded integer
    );
    create table "DamageReportCategories" (
      id text primary key, damage_report_uuid text, damage_category_uuid text
    );
  `);
});

function addRepair(id: string, deleted: number, extra: Record<string, unknown> = {}) {
  const r = {
    event_name: "Maintenance / Repair",
    event_start: "2026-09-10",
    event_end: "2026-09-12",
    notes: null,
    created_at: "2026-09-01T12:00:00Z",
    status: "inbound",
    currency: "USD",
    invoice_number: null,
    completed_at: null,
    cost_cents: null,
    vendor_uuid: null,
    zone_uuid: null,
    ...extra,
  };
  sqlite
    .prepare(
      `insert into "MaintenanceEvents"
         (id, event_name, event_start, event_end, notes, created_at, deleted, status, currency,
          invoice_number, completed_at, cost_cents, vendor_uuid, zone_uuid)
       values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      id,
      r.event_name,
      r.event_start,
      r.event_end,
      r.notes,
      r.created_at,
      deleted,
      r.status,
      r.currency,
      r.invoice_number,
      r.completed_at,
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
    severity: "minor",
    description: null,
    labor_cents: 0,
    parts_cents: 0,
    tax_cents: 0,
    freight_cents: 0,
    created_at: "2026-09-01T12:00:00Z",
    ...extra,
  };
  sqlite
    .prepare(
      `insert into "MaintenanceLineItems"
         (id, maintenance_event_uuid, bleacher_uuid, damage_category_uuid, severity, description,
          labor_cents, parts_cents, tax_cents, freight_cents, deleted, created_at)
       values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      id,
      repairId,
      s.bleacher_uuid,
      s.damage_category_uuid,
      s.severity,
      s.description,
      s.labor_cents,
      s.parts_cents,
      s.tax_cents,
      s.freight_cents,
      deleted,
      s.created_at,
    );
}

describe("buildRepairsQuery", () => {
  it("returns live repairs in the normal view and deleted ones in Show Deleted", () => {
    addRepair("live", 0);
    addRepair("gone", 1);
    expect(run(buildRepairsQuery({ showDeleted: false })).map((r) => r.id)).toEqual(["live"]);
    expect(run(buildRepairsQuery({ showDeleted: true })).map((r) => r.id)).toEqual(["gone"]);
  });

  it("returns the vendor name and the name of the stored zone", () => {
    sqlite.prepare(`insert into "Vendors" (id, display_name) values ('v1', 'Kaypark')`).run();
    sqlite.prepare(`insert into "Zones" (id, display_name) values ('z1', 'Zone 2')`).run();
    addRepair("r1", 0, {
      vendor_uuid: "v1",
      zone_uuid: "z1",
      invoice_number: "KP-1",
      cost_cents: 1234,
    });
    const [row] = run(buildRepairsQuery({ showDeleted: false }));
    expect(row).toMatchObject({
      id: "r1",
      vendorUuid: "v1",
      vendorName: "Kaypark",
      zoneUuid: "z1",
      zoneName: "Zone 2",
      invoiceNumber: "KP-1",
      costCents: 1234,
      status: "inbound",
      currency: "USD",
      eventStart: "2026-09-10",
      eventEnd: "2026-09-12",
    });
  });

  it("still returns a repair with no vendor and no zone", () => {
    addRepair("r1", 0);
    const [row] = run(buildRepairsQuery({ showDeleted: false }));
    expect(row).toMatchObject({ id: "r1", vendorName: null, zoneName: null });
  });

  it("still returns a repair whose vendor row is not synced", () => {
    addRepair("r1", 0, { vendor_uuid: "missing" });
    const [row] = run(buildRepairsQuery({ showDeleted: false }));
    expect(row).toMatchObject({ id: "r1", vendorUuid: "missing", vendorName: null });
  });
});

describe("buildServicesQuery (D34)", () => {
  beforeEach(() => {
    addRepair("live", 0);
    addRepair("gone", 1);
    addService("liveOk", "live", 0);
    addService("liveDeleted", "live", 1);
    addService("goneOk", "gone", 0);
    addService("goneDeleted", "gone", 1);
  });

  it("normal view: the services of live repairs, without the deleted ones", () => {
    expect(run(buildServicesQuery({ showDeleted: false })).map((r) => r.id)).toEqual(["liveOk"]);
  });

  it("Show Deleted: every service of the deleted repairs, whatever its own flag", () => {
    expect(
      run(buildServicesQuery({ showDeleted: true }))
        .map((r) => r.id)
        .sort(),
    ).toEqual(["goneDeleted", "goneOk"]);
  });

  it("returns the bleacher number, the category name and the four amounts", () => {
    sqlite.prepare(`delete from "MaintenanceLineItems"`).run();
    sqlite.prepare(`insert into "Bleachers" (id, bleacher_number) values ('b7', 7)`).run();
    sqlite.prepare(`insert into "DamageCategories" (id, name) values ('c1', 'Tires')`).run();
    addService("s1", "live", 0, {
      bleacher_uuid: "b7",
      damage_category_uuid: "c1",
      severity: "major",
      description: "Flat",
      labor_cents: 1,
      parts_cents: 2,
      tax_cents: 3,
      freight_cents: 4,
    });
    const [row] = run(buildServicesQuery({ showDeleted: false }));
    expect(row).toMatchObject({
      id: "s1",
      repairId: "live",
      bleacherUuid: "b7",
      bleacherNumber: 7,
      categoryUuid: "c1",
      categoryName: "Tires",
      severity: "major",
      description: "Flat",
      laborCents: 1,
      partsCents: 2,
      taxCents: 3,
      freightCents: 4,
      deleted: 0,
    });
  });

  it("still returns a service whose bleacher and category rows are not synced", () => {
    sqlite.prepare(`delete from "MaintenanceLineItems"`).run();
    addService("s1", "live", 0, { bleacher_uuid: "missing", damage_category_uuid: "missing" });
    const [row] = run(buildServicesQuery({ showDeleted: false }));
    expect(row).toMatchObject({ id: "s1", bleacherNumber: null, categoryName: null });
  });
});

describe("buildRepairBleachersQuery", () => {
  it("returns the bleacher number and the zone of the bleacher", () => {
    addRepair("r1", 0);
    sqlite.prepare(`insert into "Zones" (id, display_name) values ('z1', 'Zone 1')`).run();
    sqlite
      .prepare(`insert into "Bleachers" (id, bleacher_number, zone_uuid) values ('b1', 12, 'z1')`)
      .run();
    sqlite
      .prepare(
        `insert into "BleacherMaintEvents" (id, bleacher_uuid, maintenance_event_uuid) values ('j1', 'b1', 'r1')`,
      )
      .run();
    const [row] = run(buildRepairBleachersQuery({ showDeleted: false }));
    expect(row).toEqual({
      repairId: "r1",
      bleacherUuid: "b1",
      bleacherNumber: 12,
      zoneUuid: "z1",
      zoneName: "Zone 1",
    });
  });

  it("does not return the rows of a repair outside the view", () => {
    addRepair("live", 0);
    addRepair("gone", 1);
    sqlite
      .prepare(
        `insert into "BleacherMaintEvents" (id, bleacher_uuid, maintenance_event_uuid) values ('j1', 'b1', 'live'), ('j2', 'b2', 'gone')`,
      )
      .run();
    expect(run(buildRepairBleachersQuery({ showDeleted: false })).map((r) => r.repairId)).toEqual([
      "live",
    ]);
    expect(run(buildRepairBleachersQuery({ showDeleted: true })).map((r) => r.repairId)).toEqual([
      "gone",
    ]);
  });

  it("still returns a junction row whose bleacher is not synced", () => {
    addRepair("r1", 0);
    sqlite
      .prepare(
        `insert into "BleacherMaintEvents" (id, bleacher_uuid, maintenance_event_uuid) values ('j1', 'missing', 'r1')`,
      )
      .run();
    const [row] = run(buildRepairBleachersQuery({ showDeleted: false }));
    expect(row).toMatchObject({ bleacherUuid: "missing", bleacherNumber: null, zoneUuid: null });
  });
});

describe("buildReportsQuery", () => {
  it("leaves deleted reports out and has no photo-upload condition", () => {
    const ins = sqlite.prepare(
      `insert into "DamageReports"
         (id, bleacher_uuid, created_at, resolved_at, maintenance_event_uuid, deleted, photos_uploaded)
       values (?, ?, ?, ?, ?, ?, ?)`,
    );
    ins.run("ok", "b1", "2026-09-05T15:00:00Z", null, null, 0, 1);
    ins.run("deleted", "b1", "2026-09-05T15:00:00Z", null, null, 1, 1);
    ins.run("uploading", "b1", "2026-09-06T15:00:00Z", "2026-09-07T15:00:00Z", "r1", 0, 0);
    const rows = run(buildReportsQuery());
    expect(rows.map((r) => r.id).sort()).toEqual(["ok", "uploading"]);
    expect(rows.find((r) => r.id === "uploading")).toEqual({
      id: "uploading",
      bleacherUuid: "b1",
      createdAt: "2026-09-06T15:00:00Z",
      resolvedAt: "2026-09-07T15:00:00Z",
      repairId: "r1",
    });
  });
});

describe("buildReportCategoriesQuery", () => {
  it("returns the report and the category of each row", () => {
    sqlite
      .prepare(
        `insert into "DamageReportCategories" (id, damage_report_uuid, damage_category_uuid) values ('x', 'r1', 'c1')`,
      )
      .run();
    expect(run(buildReportCategoriesQuery())).toEqual([{ reportId: "r1", categoryUuid: "c1" }]);
  });
});

describe("the app's bound db", () => {
  it("builds every query without touching db.fn", () => {
    // The bound proxy has no db.fn helpers; a builder that needed one would throw here.
    expect(() => {
      buildRepairsQuery({ showDeleted: false });
      buildServicesQuery({ showDeleted: true });
      buildRepairBleachersQuery({ showDeleted: false });
      buildReportsQuery();
      buildReportCategoriesQuery();
    }).not.toThrow();
  });
});
