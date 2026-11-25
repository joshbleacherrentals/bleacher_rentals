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

// docs/specs/repairs-06-expanded-row.md §3 and §7. Same harness as repairFilterQueries.test.ts: the
// module compiles its SQL with the app's Kysely instance (behind a bound proxy) and the compiled
// text runs on an in-memory SQLite shaped like the local PowerSync database (booleans are 0/1).
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

const { buildServiceBleacherQuery, buildReportDetailsQuery, buildReportPhotosQuery } =
  await import("./serviceWindowQueries");

beforeEach(() => {
  sqlite = new DatabaseSync(":memory:");
  sqlite.exec(`
    create table "Bleachers" (
      id text primary key, bleacher_number integer, model_number text,
      bleacher_type_uuid text, zone_uuid text, asset_value_cents integer
    );
    create table "BleacherTypes" (id text primary key, name text);
    create table "Zones" (id text primary key, display_name text);
    create table "Users" (id text primary key, first_name text, last_name text);
    create table "DamageReports" (
      id text primary key, bleacher_uuid text, created_at text, resolved_at text,
      seat_damage text, haul_damage text, is_safe_to_sit integer, is_safe_to_haul integer,
      note text, created_by_user_uuid text, deleted integer, fixed_by_driver integer,
      fixed_at text, fixed_by_user_uuid text
    );
    create table "DamageReportPhotos" (
      id text primary key, damage_report_uuid text, photo_path text, created_at text
    );
  `);
});

describe("buildServiceBleacherQuery", () => {
  beforeEach(() => {
    sqlite.exec(`
      insert into "BleacherTypes" values ('t1', '4-Row, 20 Seat');
      insert into "Zones" values ('z3', 'Zone 3');
      insert into "Bleachers" values
        ('b26', 26, 'TSP15-450', 't1', 'z3', 987654),
        ('b9', 9, null, null, null, null);
    `);
  });

  it("returns the number, the model number, the type name and the zone name of one bleacher", () => {
    const rows = run(buildServiceBleacherQuery("b26"));
    expect(rows).toEqual([
      {
        id: "b26",
        bleacherNumber: 26,
        modelNumber: "TSP15-450",
        typeName: "4-Row, 20 Seat",
        zoneName: "Zone 3",
      },
    ]);
  });

  it("returns nulls for a bleacher with no type and no zone", () => {
    const rows = run(buildServiceBleacherQuery("b9"));
    expect(rows).toEqual([
      { id: "b9", bleacherNumber: 9, modelNumber: null, typeName: null, zoneName: null },
    ]);
  });

  it("returns nothing for a bleacher that is not on the device", () => {
    expect(run(buildServiceBleacherQuery("nope"))).toEqual([]);
  });

  it("never reads the asset value (maintenance-01: it is not shown anywhere)", () => {
    const compiled = buildServiceBleacherQuery("b26");
    expect(compiled.sql).not.toMatch(/asset_value/i);
    expect(Object.keys(run(compiled)[0])).not.toContain("assetValueCents");
  });
});

describe("buildReportDetailsQuery", () => {
  beforeEach(() => {
    sqlite.exec(`
      insert into "Bleachers" values ('b26', 26, null, null, null, null);
      insert into "Users" values ('u1', 'Jane', 'Doe'), ('u2', 'Sam', 'Roe');
      insert into "DamageReports" values
        ('r1', 'b26', '2026-09-17 16:00:00', null, 'minor', 'none', 1, 1, 'Cracked weld',
         'u1', 0, 1, '2026-09-18 10:00:00', 'u2'),
        ('r2', 'b26', '2026-09-18 16:00:00', '2026-09-19 16:00:00', 'none', 'major', 1, 0, null,
         null, 0, 0, null, null),
        ('r3', 'b26', '2026-09-19 16:00:00', null, 'none', 'none', 1, 1, 'deleted one',
         null, 1, 0, null, null),
        ('r4', 'b26', '2026-09-20 16:00:00', null, 'none', 'none', 1, 1, 'not asked for',
         null, 0, 0, null, null);
    `);
  });

  it("returns the report with the creator's and the fixer's names and the bleacher's number", () => {
    const rows = run(buildReportDetailsQuery(["r1"]));
    expect(rows).toEqual([
      {
        id: "r1",
        bleacherNumber: 26,
        createdAt: "2026-09-17 16:00:00",
        resolvedAt: null,
        seatDamage: "minor",
        haulDamage: "none",
        isSafeToSit: 1,
        isSafeToHaul: 1,
        note: "Cracked weld",
        creatorFirstName: "Jane",
        creatorLastName: "Doe",
        fixedByDriver: 1,
        fixedAt: "2026-09-18 10:00:00",
        fixerFirstName: "Sam",
        fixerLastName: "Roe",
      },
    ]);
  });

  it("returns nulls for the names of a report nobody is known for", () => {
    const [row] = run(buildReportDetailsQuery(["r2"]));
    expect(row.creatorFirstName).toBeNull();
    expect(row.fixerFirstName).toBeNull();
    expect(row.resolvedAt).toBe("2026-09-19 16:00:00");
  });

  it("returns only the reports asked for and leaves a deleted report out", () => {
    const rows = run(buildReportDetailsQuery(["r1", "r2", "r3"]));
    expect(rows.map((r) => r.id).sort()).toEqual(["r1", "r2"]);
  });

  it("matches nothing for an empty list of ids", () => {
    expect(run(buildReportDetailsQuery([]))).toEqual([]);
  });
});

describe("buildReportPhotosQuery", () => {
  beforeEach(() => {
    sqlite.exec(`
      insert into "DamageReportPhotos" values
        ('p2', 'r1', 'r1/two.jpg', '2026-09-17 16:02:00'),
        ('p1', 'r1', 'r1/one.jpg', '2026-09-17 16:01:00'),
        ('p3', 'r2', 'r2/three.jpg', '2026-09-18 16:00:00'),
        ('p4', 'r9', 'r9/other.jpg', '2026-09-18 16:00:00');
    `);
  });

  it("returns the photos of the given reports only, the earliest first", () => {
    const rows = run(buildReportPhotosQuery(["r1", "r2"]));
    expect(rows).toEqual([
      { id: "p1", reportId: "r1", path: "r1/one.jpg" },
      { id: "p2", reportId: "r1", path: "r1/two.jpg" },
      { id: "p3", reportId: "r2", path: "r2/three.jpg" },
    ]);
  });

  it("matches nothing for an empty list of ids", () => {
    expect(run(buildReportPhotosQuery([]))).toEqual([]);
  });
});
