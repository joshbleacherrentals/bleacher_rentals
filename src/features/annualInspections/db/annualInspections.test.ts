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

// The module builds its SQL with the app's Kysely instance; a DummyDriver
// compiles without a connection. The compiled SQL then runs against a real
// SQLite database below, so these tests check what the query actually returns
// rather than how its text happens to be spelled.
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
  typedExecute: (compiled: CompiledQuery) => Promise.resolve(compiled),
  typedGetAll: () => Promise.resolve([]),
  useTypedQuery: () => ({ data: [] }),
}));

const { buildInspectionQueueQuery, buildInspectionHistoryQuery } =
  await import("./annualInspections");

let sqlite: DatabaseSync;

function run<T>(compiled: CompiledQuery): T[] {
  return sqlite.prepare(compiled.sql).all(...(compiled.parameters as any[])) as T[];
}

/** Local PowerSync tables: dates are text, `deleted` is 0/1. */
beforeEach(() => {
  sqlite = new DatabaseSync(":memory:");
  sqlite.exec(`
    create table "Bleachers" (
      id text primary key,
      bleacher_number integer,
      deleted integer
    );
    create table "BleacherAnnualInspections" (
      id text primary key,
      created_at text,
      created_by text,
      bleacher_uuid text,
      inspected_on text,
      next_due_on text,
      document_path text,
      notes text
    );
  `);
});

function addBleacher(id: string, number: number, deleted: number | null = 0) {
  sqlite
    .prepare(`insert into "Bleachers" (id, bleacher_number, deleted) values (?, ?, ?)`)
    .run(id, number, deleted);
}

function addInspection(row: {
  id: string;
  bleacher: string;
  createdAt: string;
  inspectedOn?: string | null;
  nextDueOn: string;
  documentPath?: string | null;
  notes?: string | null;
}) {
  sqlite
    .prepare(
      `insert into "BleacherAnnualInspections"
         (id, created_at, created_by, bleacher_uuid, inspected_on, next_due_on, document_path, notes)
       values (?, ?, null, ?, ?, ?, ?, ?)`,
    )
    .run(
      row.id,
      row.createdAt,
      row.bleacher,
      row.inspectedOn ?? null,
      row.nextDueOn,
      row.documentPath ?? null,
      row.notes ?? null,
    );
}

describe("buildInspectionQueueQuery", () => {
  it("shows the most recently recorded inspection, not the oldest one", () => {
    addBleacher("b1", 101);
    addInspection({
      id: "i1",
      bleacher: "b1",
      createdAt: "2025-03-14T10:00:00Z",
      nextDueOn: "2026-03-14",
    });
    addInspection({
      id: "i2",
      bleacher: "b1",
      createdAt: "2026-03-20T10:00:00Z",
      nextDueOn: "2027-03-20",
    });

    const rows = run<any>(buildInspectionQueueQuery());

    expect(rows).toHaveLength(1);
    expect(rows[0].inspectionId).toBe("i2");
    expect(rows[0].nextDueOn).toBe("2027-03-20");
  });

  it("breaks a same-timestamp tie deterministically instead of picking at random", () => {
    addBleacher("b1", 101);
    addInspection({
      id: "aaa",
      bleacher: "b1",
      createdAt: "2026-03-20T10:00:00Z",
      nextDueOn: "2027-01-01",
    });
    addInspection({
      id: "zzz",
      bleacher: "b1",
      createdAt: "2026-03-20T10:00:00Z",
      nextDueOn: "2027-02-02",
    });

    const rows = run<any>(buildInspectionQueueQuery());

    expect(rows[0].inspectionId).toBe("zzz");
  });

  it("lists a bleacher that has never been inspected, so it cannot be forgotten", () => {
    addBleacher("b1", 101);

    const rows = run<any>(buildInspectionQueueQuery());

    expect(rows).toHaveLength(1);
    expect(rows[0].bleacherNumber).toBe(101);
    expect(rows[0].inspectionId).toBe(null);
    expect(rows[0].nextDueOn).toBe(null);
  });

  it("leaves deleted bleachers out of the queue", () => {
    addBleacher("b1", 101, 1);
    addBleacher("b2", 102, 0);
    addBleacher("b3", 103, null);

    const rows = run<any>(buildInspectionQueueQuery());

    expect(rows.map((r) => r.bleacherNumber)).toEqual([102, 103]);
  });

  it("puts the bleachers with no date at the top, then the soonest due first", () => {
    addBleacher("b1", 101);
    addInspection({
      id: "i1",
      bleacher: "b1",
      createdAt: "2026-01-01T00:00:00Z",
      nextDueOn: "2027-06-01",
    });
    addBleacher("b2", 102);
    addInspection({
      id: "i2",
      bleacher: "b2",
      createdAt: "2026-01-01T00:00:00Z",
      nextDueOn: "2026-08-01",
    });
    addBleacher("b3", 103); // never scheduled
    addBleacher("b4", 104);
    addInspection({
      id: "i4",
      bleacher: "b4",
      createdAt: "2026-01-01T00:00:00Z",
      nextDueOn: "2026-09-15",
    });

    const rows = run<any>(buildInspectionQueueQuery());

    // Unscheduled first; then ascending due date, which puts overdue ahead of
    // red, red ahead of yellow and yellow ahead of ok without needing today.
    expect(rows.map((r) => r.bleacherNumber)).toEqual([103, 102, 104, 101]);
  });

  it("carries the certificate and the note through to the list", () => {
    addBleacher("b1", 101);
    addInspection({
      id: "i1",
      bleacher: "b1",
      createdAt: "2026-01-01T00:00:00Z",
      inspectedOn: "2026-01-01",
      nextDueOn: "2027-01-01",
      documentPath: "bleacher-101/inspection-1.pdf",
      notes: "hairline crack on the rear axle",
    });

    const rows = run<any>(buildInspectionQueueQuery());

    expect(rows[0]).toMatchObject({
      inspectedOn: "2026-01-01",
      documentPath: "bleacher-101/inspection-1.pdf",
      notes: "hairline crack on the rear axle",
    });
  });
});

describe("buildInspectionHistoryQuery", () => {
  it("returns every inspection for one bleacher, newest first", () => {
    addBleacher("b1", 101);
    addBleacher("b2", 102);
    addInspection({
      id: "i1",
      bleacher: "b1",
      createdAt: "2024-03-14T10:00:00Z",
      nextDueOn: "2025-03-14",
    });
    addInspection({
      id: "i3",
      bleacher: "b1",
      createdAt: "2026-03-14T10:00:00Z",
      nextDueOn: "2027-03-14",
    });
    addInspection({
      id: "i2",
      bleacher: "b1",
      createdAt: "2025-03-14T10:00:00Z",
      nextDueOn: "2026-03-14",
    });
    addInspection({
      id: "other",
      bleacher: "b2",
      createdAt: "2026-03-14T10:00:00Z",
      nextDueOn: "2027-03-14",
    });

    const rows = run<any>(buildInspectionHistoryQuery("b1"));

    expect(rows.map((r) => r.id)).toEqual(["i3", "i2", "i1"]);
  });

  it("returns nothing for a bleacher that has never been inspected", () => {
    addBleacher("b1", 101);

    expect(run<any>(buildInspectionHistoryQuery("b1"))).toEqual([]);
  });
});
