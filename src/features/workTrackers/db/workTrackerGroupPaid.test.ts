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

// Same harness as useWorkTrackerAccess.test.ts: the module compiles its SQL with the app's Kysely
// instance and the compiled text runs against a real SQLite database, so this checks what the
// queries do to a table shaped like the local PowerSync one (booleans are 0/1) rather than how
// they are spelled.
const testDb = new Kysely<any>({
  dialect: {
    createAdapter: () => new SqliteAdapter(),
    createDriver: () => new DummyDriver(),
    createIntrospector: (d) => new SqliteIntrospector(d),
    createQueryCompiler: () => new SqliteQueryCompiler(),
  },
});

let sqlite: DatabaseSync;

function run(compiled: CompiledQuery) {
  return sqlite.prepare(compiled.sql).all(...(compiled.parameters as any[])) as any[];
}

vi.mock("@/components/providers/SystemProvider", () => ({
  get db() {
    return testDb;
  },
}));

// The local write the app does, pointed at the in-memory database.
vi.mock("@/lib/powersync/typedQuery", () => ({
  expect: () => undefined,
  typedExecute: async (compiled: CompiledQuery) => {
    sqlite.prepare(compiled.sql).run(...(compiled.parameters as any[]));
  },
}));

const { buildWorkTrackerGroupPaidQuery, setWorkTrackerGroupPaid } =
  await import("./workTrackerGroupPaid");

beforeEach(() => {
  sqlite = new DatabaseSync(":memory:");
  sqlite.exec(`
    create table "WorkTrackerGroups" (
      id text primary key, driver_uuid text, week_start text, week_end text,
      status text, qbo_bill_id text, created_at text, is_paid integer
    );
  `);
});

function addGroup(id: string, driver: string, weekStart: string, isPaid: number | null) {
  sqlite
    .prepare(
      `insert into "WorkTrackerGroups" (id, driver_uuid, week_start, week_end, status, is_paid)
       values (?, ?, ?, '2026-09-27', 'draft', ?)`,
    )
    .run(id, driver, weekStart, isPaid);
}

function paidOf(id: string) {
  return (
    sqlite.prepare(`select is_paid from "WorkTrackerGroups" where id = ?`).get(id) as {
      is_paid: number | null;
    }
  ).is_paid;
}

describe("the group of a driver's week, as read from the local database", () => {
  it("finds the group and whether it is paid", () => {
    addGroup("g1", "d1", "2026-09-21", 1);

    expect(run(buildWorkTrackerGroupPaidQuery("d1", "2026-09-21"))).toEqual([
      { id: "g1", is_paid: 1 },
    ]);
  });

  it("keeps drivers and weeks apart", () => {
    addGroup("g1", "d1", "2026-09-21", 1);
    addGroup("g2", "d1", "2026-09-14", 0);
    addGroup("g3", "d2", "2026-09-21", 0);

    expect(run(buildWorkTrackerGroupPaidQuery("d1", "2026-09-14"))).toEqual([
      { id: "g2", is_paid: 0 },
    ]);
    expect(run(buildWorkTrackerGroupPaidQuery("d2", "2026-09-21"))).toEqual([
      { id: "g3", is_paid: 0 },
    ]);
  });

  it("finds nothing for a week without a group, and for no driver at all", () => {
    addGroup("g1", "d1", "2026-09-21", 1);

    expect(run(buildWorkTrackerGroupPaidQuery("d1", "2026-10-05"))).toEqual([]);
    expect(run(buildWorkTrackerGroupPaidQuery(null, "2026-09-21"))).toEqual([]);
  });
});

describe("setWorkTrackerGroupPaid", () => {
  it("marks an unpaid group paid", async () => {
    addGroup("g1", "d1", "2026-09-21", 0);

    await setWorkTrackerGroupPaid("g1", true);

    expect(paidOf("g1")).toBe(1);
  });

  it("marks a paid group unpaid again", async () => {
    addGroup("g1", "d1", "2026-09-21", 1);

    await setWorkTrackerGroupPaid("g1", false);

    expect(paidOf("g1")).toBe(0);
  });

  it("marks a group that was synced before the column existed (null) paid", async () => {
    addGroup("g1", "d1", "2026-09-21", null);

    await setWorkTrackerGroupPaid("g1", true);

    expect(paidOf("g1")).toBe(1);
  });

  it("touches only that group", async () => {
    addGroup("g1", "d1", "2026-09-21", 0);
    addGroup("g2", "d1", "2026-09-14", 0);
    addGroup("g3", "d2", "2026-09-21", 0);

    await setWorkTrackerGroupPaid("g1", true);

    expect([paidOf("g1"), paidOf("g2"), paidOf("g3")]).toEqual([1, 0, 0]);
  });

  it("leaves everything else on the group as it was", async () => {
    sqlite
      .prepare(
        `insert into "WorkTrackerGroups" (id, driver_uuid, week_start, week_end, status, qbo_bill_id, is_paid)
         values ('g1', 'd1', '2026-09-21', '2026-09-27', 'qbo_bill_created', 'B-9', 0)`,
      )
      .run();

    await setWorkTrackerGroupPaid("g1", true);

    expect(
      sqlite
        .prepare(`select status, qbo_bill_id, week_start from "WorkTrackerGroups" where id = 'g1'`)
        .get(),
    ).toEqual({ status: "qbo_bill_created", qbo_bill_id: "B-9", week_start: "2026-09-21" });
  });
});
