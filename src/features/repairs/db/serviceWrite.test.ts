import { beforeEach, describe, expect, it, vi } from "vitest";
import { DatabaseSync, type SQLInputValue } from "node:sqlite";
import type { CompiledQuery } from "kysely";

// docs/specs/repairs-09b1-services.md §2.5, §2.6, §3 and §7 (D151 to D159). The builders compile
// the writes with the app's Kysely; the SQLite half of this file runs the compiled text on an
// in-memory SQLite shaped like the local PowerSync database. The three writers validate, send one
// batch, and show a toast only for an error.

const { typedExecuteBatch, toastCustom } = vi.hoisted(() => ({
  typedExecuteBatch: vi.fn(),
  toastCustom: vi.fn(),
}));

vi.mock("@/lib/powersync/typedQuery", () => ({ typedExecuteBatch }));
vi.mock("sonner", () => ({ toast: { custom: toastCustom } }));
vi.mock("@/components/providers/SystemProvider", async () => {
  const { Kysely, SqliteDialect } = await import("kysely");
  // A dialect that is never connected: `.compile()` needs a query builder, not a database.
  return {
    db: new Kysely<any>({ dialect: new SqliteDialect({ database: {} as any }) }),
  };
});

import {
  buildCreateServiceStatement,
  buildDeleteServiceStatement,
  buildServicesDraftStatements,
  buildUpdateServiceStatement,
  createService,
  deleteService,
  updateService,
  type CreateServiceInput,
} from "./serviceWrite";
import {
  SERVICE_FORM_MESSAGES,
  addDraftService,
  removeDraftService,
  servicesDraftFromRepair,
  updateDraftService,
  type ServiceFormValues,
} from "../utils/serviceForm";
import { repairRow, repairService } from "../utils/repairRowFixture";

const REPAIR = "r0000000-0000-4000-8000-000000000001";
const SERVICE = "s0000000-0000-4000-8000-000000000001";
const OTHER_SERVICE = "s0000000-0000-4000-8000-000000000002";
const NOW = "2026-11-21T15:30:00.000Z";

const values = (over: Partial<ServiceFormValues> = {}): ServiceFormValues => ({
  bleacherUuid: "b1",
  categoryUuid: "c1",
  severity: "minor",
  description: "Needed spindles rewelded",
  laborText: "1,260.00",
  partsText: "348.60",
  taxText: "34.55",
  freightText: "0.00",
  ...over,
});

const createInput = (over: Partial<CreateServiceInput> = {}): CreateServiceInput => ({
  id: SERVICE,
  repairId: REPAIR,
  values: values(),
  now: NOW,
  ...over,
});

/** The red toast the writers show: the lines of the `ErrorToast` they render. */
function toastLines(call = 0): string[] {
  const render = toastCustom.mock.calls[call][0] as (id: string) => { props: { lines: string[] } };
  return render("t1").props.lines;
}

describe("buildCreateServiceStatement (what Add service writes)", () => {
  it("is one insert into MaintenanceLineItems with every column of the spec and its parameter", () => {
    const statement = buildCreateServiceStatement(createInput());
    expect(statement.sql).toMatch(/^insert into "MaintenanceLineItems"/i);
    const columns = [
      "id",
      "maintenance_event_uuid",
      "bleacher_uuid",
      "damage_category_uuid",
      "severity",
      "description",
      "labor_cents",
      "parts_cents",
      "tax_cents",
      "freight_cents",
      "created_at",
      "deleted",
    ];
    for (const column of columns) expect(statement.sql).toContain(`"${column}"`);
    for (const param of [SERVICE, REPAIR, "b1", "c1", "minor", "Needed spindles rewelded", NOW]) {
      expect(statement.parameters).toContain(param);
    }
    expect(statement.parameters).toEqual(expect.arrayContaining([126000, 34860, 3455, 0]));
  });

  it("does not write the repair's total, its zone or its junction (D159)", () => {
    const sql = buildCreateServiceStatement(createInput()).sql;
    expect(sql).not.toContain("cost_cents");
    expect(sql).not.toContain("zone_uuid");
    expect(sql).not.toContain("BleacherMaintEvents");
  });

  it("writes an empty category as NULL, a spaces-only description as NULL and empty amounts as 0", () => {
    const statement = buildCreateServiceStatement(
      createInput({
        values: values({
          categoryUuid: null,
          description: "   ",
          laborText: "",
          partsText: "",
          taxText: "",
          freightText: "",
        }),
      }),
    );
    expect(statement.parameters).toEqual([
      SERVICE,
      REPAIR,
      "b1",
      null,
      "minor",
      null,
      0,
      0,
      0,
      0,
      NOW,
      0,
    ]);
  });

  it("refuses to build a service without a bleacher or a severity", () => {
    expect(() =>
      buildCreateServiceStatement(createInput({ values: values({ bleacherUuid: null }) })),
    ).toThrow();
    expect(() =>
      buildCreateServiceStatement(createInput({ values: values({ severity: null }) })),
    ).toThrow();
  });
});

describe("buildUpdateServiceStatement (what Save of an Edit writes)", () => {
  it("is null when nothing changed, also for another form of the same number", () => {
    const input = { serviceId: SERVICE, initial: values(), values: values({ laborText: "1260" }) };
    expect(buildUpdateServiceStatement(input)).toBeNull();
  });

  it("writes only the changed columns and then the id", () => {
    const statement = buildUpdateServiceStatement({
      serviceId: SERVICE,
      initial: values(),
      values: values({ severity: "major", laborText: "1,300.00" }),
    });
    expect(statement?.sql).toMatch(/^update "MaintenanceLineItems" set/i);
    expect(statement?.sql).toContain('"severity"');
    expect(statement?.sql).toContain('"labor_cents"');
    for (const other of [
      "bleacher_uuid",
      "damage_category_uuid",
      "description",
      "parts_cents",
      "tax_cents",
      "freight_cents",
    ]) {
      expect(statement?.sql).not.toContain(`"${other}"`);
    }
    expect(statement?.parameters).toEqual(["major", 130000, SERVICE]);
  });

  it("never writes the repair, the creation moment or deleted", () => {
    const statement = buildUpdateServiceStatement({
      serviceId: SERVICE,
      initial: values(),
      values: values({ bleacherUuid: "b2", categoryUuid: null, description: "", freightText: "5" }),
    });
    for (const never of ["maintenance_event_uuid", "created_at", "deleted", "cost_cents"]) {
      expect(statement?.sql).not.toContain(`"${never}"`);
    }
    expect(statement?.parameters).toEqual(["b2", null, null, 500, SERVICE]);
  });
});

describe("buildDeleteServiceStatement", () => {
  it("sets deleted to 1 on one service", () => {
    const statement = buildDeleteServiceStatement(SERVICE);
    expect(statement.sql).toMatch(/^update "MaintenanceLineItems" set "deleted" = \?/i);
    expect(statement.parameters).toEqual([1, SERVICE]);
  });
});

describe("buildServicesDraftStatements (a draft saved with its repair, D161)", () => {
  const stored = repairRow({
    id: REPAIR,
    services: [
      repairService({ id: SERVICE, laborCents: 1000, totalCents: 1000 }),
      repairService({ id: OTHER_SERVICE, bleacherUuid: "b2", bleacherNumber: 27 }),
    ],
  });

  it("is empty for a draft without changes, also for an empty one", () => {
    expect(buildServicesDraftStatements({ repairId: REPAIR, draft: [], now: NOW })).toEqual([]);
    expect(
      buildServicesDraftStatements({
        repairId: REPAIR,
        draft: servicesDraftFromRepair(stored),
        now: NOW,
      }),
    ).toEqual([]);
  });

  it("writes the inserts first, then the updates, then the removals", () => {
    let draft = servicesDraftFromRepair(stored);
    draft = addDraftService(draft, "n1", values());
    draft = updateDraftService(draft, SERVICE, {
      ...draft[0].values,
      severity: "major",
    });
    draft = removeDraftService(draft, OTHER_SERVICE);
    const statements = buildServicesDraftStatements({ repairId: REPAIR, draft, now: NOW });
    expect(statements.map((s) => s.sql.split(" ").slice(0, 3).join(" ").toLowerCase())).toEqual([
      'insert into "maintenancelineitems"',
      'update "maintenancelineitems" set',
      'update "maintenancelineitems" set',
    ]);
    expect(statements[1].parameters).toEqual(["major", SERVICE]);
    expect(statements[2].parameters).toEqual([1, OTHER_SERVICE]);
  });

  it("gives the added services created_at in the order added: the moment plus their index in ms", () => {
    let draft = addDraftService([], "n1", values());
    draft = addDraftService(draft, "n2", values({ bleacherUuid: "b2" }));
    draft = addDraftService(draft, "n3", values({ bleacherUuid: "b3" }));
    const statements = buildServicesDraftStatements({ repairId: REPAIR, draft, now: NOW });
    const createdAt = statements.map((s) =>
      s.parameters.find((p) => typeof p === "string" && p.startsWith("2026-11-21")),
    );
    expect(createdAt).toEqual([
      "2026-11-21T15:30:00.000Z",
      "2026-11-21T15:30:00.001Z",
      "2026-11-21T15:30:00.002Z",
    ]);
  });
});

describe("the builders (run on SQLite)", () => {
  let sqlite: DatabaseSync;

  const run = (statements: (CompiledQuery | null)[]) => {
    for (const s of statements) {
      if (s) sqlite.prepare(s.sql).run(...(s.parameters as SQLInputValue[]));
    }
  };
  const rowOf = (id: string) =>
    sqlite.prepare(`select * from "MaintenanceLineItems" where id = ?`).get(id) as any;

  beforeEach(() => {
    sqlite = new DatabaseSync(":memory:");
    sqlite.exec(`
      create table "MaintenanceEvents" (id text primary key, cost_cents integer);
      create table "MaintenanceLineItems" (
        id text primary key, created_at text, maintenance_event_uuid text, bleacher_uuid text,
        damage_category_uuid text, severity text, description text, labor_cents integer,
        parts_cents integer, tax_cents integer, freight_cents integer, deleted integer
      );
      insert into "MaintenanceEvents" values ('${REPAIR}', 12300);
      insert into "MaintenanceLineItems" values
        ('${SERVICE}', '2026-11-01T10:00:00.000Z', '${REPAIR}', 'b1', 'c1', 'minor', 'Weld',
         1000, 0, 0, 0, 0),
        ('${OTHER_SERVICE}', '2026-11-01T10:00:01.000Z', '${REPAIR}', 'b2', null, 'major', null,
         2000, 0, 0, 0, 0);
    `);
  });

  it("an insert makes the row with deleted 0 and touches nothing else", () => {
    const id = "s0000000-0000-4000-8000-0000000000aa";
    run([buildCreateServiceStatement(createInput({ id }))]);
    expect(rowOf(id)).toMatchObject({
      maintenance_event_uuid: REPAIR,
      bleacher_uuid: "b1",
      damage_category_uuid: "c1",
      severity: "minor",
      description: "Needed spindles rewelded",
      labor_cents: 126000,
      parts_cents: 34860,
      tax_cents: 3455,
      freight_cents: 0,
      created_at: NOW,
      deleted: 0,
    });
    expect(rowOf(SERVICE)).toMatchObject({ labor_cents: 1000 });
    expect(sqlite.prepare(`select cost_cents from "MaintenanceEvents"`).get()).toMatchObject({
      cost_cents: 12300,
    });
  });

  it("an update changes only the changed columns of that service", () => {
    run([
      buildUpdateServiceStatement({
        serviceId: SERVICE,
        initial: values({
          description: "Weld",
          laborText: "10.00",
          partsText: "",
          freightText: "",
        }),
        values: values({ description: "Weld", laborText: "11.00", partsText: "", freightText: "" }),
      }),
    ]);
    expect(rowOf(SERVICE)).toMatchObject({
      labor_cents: 1100,
      bleacher_uuid: "b1",
      damage_category_uuid: "c1",
      severity: "minor",
      description: "Weld",
      deleted: 0,
    });
    expect(rowOf(OTHER_SERVICE)).toMatchObject({ labor_cents: 2000, deleted: 0 });
  });

  it("a delete marks one service deleted and leaves the other one alone", () => {
    run([buildDeleteServiceStatement(SERVICE)]);
    expect(rowOf(SERVICE)).toMatchObject({ deleted: 1 });
    expect(rowOf(OTHER_SERVICE)).toMatchObject({ deleted: 0 });
  });

  it("a draft that adds, changes and removes changes exactly those rows", () => {
    const stored = repairRow({
      id: REPAIR,
      services: [
        repairService({
          id: SERVICE,
          bleacherUuid: "b1",
          damageCategoryUuid: "c1",
          severity: "minor",
          description: "Weld",
          laborCents: 1000,
        }),
        repairService({
          id: OTHER_SERVICE,
          bleacherUuid: "b2",
          damageCategoryUuid: null,
          severity: "major",
          description: null,
          laborCents: 2000,
        }),
      ],
    });
    let draft = servicesDraftFromRepair(stored);
    draft = addDraftService(draft, "s0000000-0000-4000-8000-0000000000cc", values());
    draft = updateDraftService(draft, SERVICE, { ...draft[0].values, severity: "major" });
    draft = removeDraftService(draft, OTHER_SERVICE);
    run(buildServicesDraftStatements({ repairId: REPAIR, draft, now: NOW }));
    expect(rowOf("s0000000-0000-4000-8000-0000000000cc")).toMatchObject({
      maintenance_event_uuid: REPAIR,
      deleted: 0,
    });
    expect(rowOf(SERVICE)).toMatchObject({ severity: "major", labor_cents: 1000, deleted: 0 });
    expect(rowOf(OTHER_SERVICE)).toMatchObject({ deleted: 1, labor_cents: 2000 });
  });
});

describe("the writers", () => {
  beforeEach(() => {
    typedExecuteBatch.mockReset();
    toastCustom.mockReset();
    typedExecuteBatch.mockResolvedValue(undefined);
  });

  describe("createService", () => {
    const input = (over: Partial<CreateServiceInput> = {}) => {
      const { id: _id, ...rest } = createInput(over);
      return rest;
    };

    it("returns the errors and writes nothing when the bleacher or the severity is missing", async () => {
      expect(await createService(input({ values: values({ bleacherUuid: null }) }))).toEqual({
        bleacherUuid: SERVICE_FORM_MESSAGES.bleacherRequired,
      });
      expect(await createService(input({ values: values({ severity: null }) }))).toEqual({
        severity: SERVICE_FORM_MESSAGES.severityRequired,
      });
      expect(typedExecuteBatch).not.toHaveBeenCalled();
      expect(toastCustom).not.toHaveBeenCalled();
    });

    it("sends one insert in one batch and shows no toast on success (D155)", async () => {
      expect(await createService(input())).toBeNull();
      expect(typedExecuteBatch).toHaveBeenCalledTimes(1);
      const statements = typedExecuteBatch.mock.calls[0][0] as CompiledQuery[];
      expect(statements).toHaveLength(1);
      expect(statements[0].sql).toMatch(/^insert into "MaintenanceLineItems"/i);
      expect(toastCustom).not.toHaveBeenCalled();
    });

    it("shows a red toast with the message and the error text, and rejects, when the write fails", async () => {
      typedExecuteBatch.mockRejectedValue(new Error("disk is full"));
      await expect(createService(input())).rejects.toThrow("disk is full");
      expect(toastCustom).toHaveBeenCalledTimes(1);
      const lines = toastLines();
      expect(lines[0]).toBe("Failed to save the service.");
      expect(lines.join(" ")).toContain("disk is full");
    });
  });

  describe("updateService", () => {
    it("writes nothing and checks nothing when nothing changed", async () => {
      expect(
        await updateService({ serviceId: SERVICE, initial: values(), values: values() }),
      ).toBeNull();
      expect(typedExecuteBatch).not.toHaveBeenCalled();
      // Not validated either: a service whose stored values are incomplete can still be left alone.
      expect(
        await updateService({
          serviceId: SERVICE,
          initial: values({ bleacherUuid: null }),
          values: values({ bleacherUuid: null }),
        }),
      ).toBeNull();
    });

    it("returns the errors and writes nothing when a change leaves no bleacher", async () => {
      expect(
        await updateService({
          serviceId: SERVICE,
          initial: values(),
          values: values({ bleacherUuid: null }),
        }),
      ).toEqual({ bleacherUuid: SERVICE_FORM_MESSAGES.bleacherRequired });
      expect(typedExecuteBatch).not.toHaveBeenCalled();
    });

    it("sends one update and shows no toast on success; a failure shows the red toast and rejects", async () => {
      const change = {
        serviceId: SERVICE,
        initial: values(),
        values: values({ severity: "major" as const }),
      };
      expect(await updateService(change)).toBeNull();
      expect(typedExecuteBatch).toHaveBeenCalledTimes(1);
      expect(toastCustom).not.toHaveBeenCalled();
      typedExecuteBatch.mockRejectedValue(new Error("nope"));
      await expect(updateService(change)).rejects.toThrow("nope");
      expect(toastLines()[0]).toBe("Failed to save the service.");
    });
  });

  describe("deleteService", () => {
    it("sends one update and shows no toast on success", async () => {
      await deleteService(SERVICE);
      const statements = typedExecuteBatch.mock.calls[0][0] as CompiledQuery[];
      expect(statements).toHaveLength(1);
      expect(statements[0].parameters).toEqual([1, SERVICE]);
      expect(toastCustom).not.toHaveBeenCalled();
    });

    it("shows the red toast and rejects when the write fails", async () => {
      typedExecuteBatch.mockRejectedValue(new Error("nope"));
      await expect(deleteService(SERVICE)).rejects.toThrow("nope");
      expect(toastLines()[0]).toBe("Failed to delete the service.");
    });
  });
});
