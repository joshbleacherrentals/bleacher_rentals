import { beforeEach, describe, expect, it, vi } from "vitest";
import { DatabaseSync, type SQLInputValue } from "node:sqlite";
import type { CompiledQuery } from "kysely";

// docs/specs/repairs-09a-repair-writes.md §2.4 to §2.6, §3 and §7 (D125 to D145). The builders
// compile the writes with the app's Kysely; the SQLite halves of this file run the compiled text on
// an in-memory SQLite shaped like the local PowerSync database. The four writers validate, send one
// batch, and show a toast only for an error.

const { typedExecuteBatch, typedGetAll, toastCustom, writeRepairChanges } = vi.hoisted(() => ({
  typedExecuteBatch: vi.fn(),
  typedGetAll: vi.fn(),
  toastCustom: vi.fn(),
  writeRepairChanges: vi.fn(),
}));

vi.mock("@/lib/powersync/typedQuery", () => ({
  typedExecuteBatch,
  typedGetAll,
  expect: () => undefined,
}));
vi.mock("sonner", () => ({ toast: { custom: toastCustom } }));
// 09b2: a repair whose services change is written through the runner of `repairLinkWrite.ts`, which
// has its own tests; here only what the writers hand it is looked at.
vi.mock("./repairLinkWrite", () => ({ writeRepairChanges }));
vi.mock("@/components/providers/SystemProvider", async () => {
  const { Kysely, SqliteDialect } = await import("kysely");
  // A dialect that is never connected: `.compile()` needs a query builder, not a database.
  return {
    db: new Kysely<any>({ dialect: new SqliteDialect({ database: {} as any }) }),
  };
});

import {
  buildCreateRepairStatement,
  buildInvoiceDuplicateQuery,
  buildSetDeletedStatement,
  buildUpdateRepairStatements,
  createRepair,
  deleteRepair,
  findInvoiceDuplicate,
  readVendorCountry,
  restoreRepair,
  updateRepair,
  type CreateRepairInput,
  type UpdateRepairInput,
} from "./repairWrite";
import { REPAIR_FORM_MESSAGES, type RepairFormValues } from "../utils/repairForm";
import { repairRow, repairService } from "../utils/repairRowFixture";
import {
  addDraftService,
  removeDraftService,
  servicesDraftFromRepair,
  updateDraftService,
  type ServiceFormValues,
  type ServicesDraft,
} from "../utils/serviceForm";

const REPAIR = "r0000000-0000-4000-8000-000000000001";
const OTHER_REPAIR = "r0000000-0000-4000-8000-000000000002";
const VENDOR = "v0000000-0000-4000-8000-000000000001";
const OTHER_VENDOR = "v0000000-0000-4000-8000-000000000002";
const NOW = "2026-11-20T15:30:00.000Z";
const report = (id: string) => ({ id, day: "2026-11-01", createdAt: "2026-11-01T12:00:00Z" });

const values = (over: Partial<RepairFormValues> = {}): RepairFormValues => ({
  vendorUuid: VENDOR,
  invoiceNumber: "JJ-5",
  status: "inbound",
  currency: "CAD",
  eventStart: "2026-11-01",
  eventEnd: "2026-11-05",
  notes: "Welded the spindle",
  ...over,
});

const createInput = (over: Partial<CreateRepairInput> = {}): CreateRepairInput => ({
  id: REPAIR,
  values: values(),
  createdByUserUuid: "user-1",
  now: NOW,
  timezone: "America/Toronto",
  ...over,
});

const updateInput = (over: Partial<UpdateRepairInput> = {}): UpdateRepairInput => ({
  repairId: REPAIR,
  initial: values(),
  values: values(),
  liveStatus: "inbound",
  reported: [report("rep-1"), report("rep-2")],
  now: NOW,
  timezone: "America/Toronto",
  ...over,
});

/** The red toast the writers show: the lines of the `ErrorToast` they render. */
function toastLines(call = 0): string[] {
  const render = toastCustom.mock.calls[call][0] as (id: string) => { props: { lines: string[] } };
  return render("t1").props.lines;
}

describe("buildCreateRepairStatement (what Add repair writes)", () => {
  it("is one insert into MaintenanceEvents with every column of the spec and its parameter", () => {
    const statement = buildCreateRepairStatement(createInput());
    expect(statement.sql).toMatch(/^insert into "MaintenanceEvents"/i);
    const columns = [
      "id",
      "event_name",
      "event_start",
      "event_end",
      "vendor_uuid",
      "invoice_number",
      "status",
      "currency",
      "notes",
      "completed_at",
      "created_by_user_uuid",
      "created_at",
      "deleted",
    ];
    for (const column of columns) expect(statement.sql).toContain(`"${column}"`);
    expect(statement.parameters).toContain(REPAIR);
    expect(statement.parameters).toContain("Maintenance / Repair");
    expect(statement.parameters).toContain("2026-11-01");
    expect(statement.parameters).toContain("2026-11-05");
    expect(statement.parameters).toContain(VENDOR);
    expect(statement.parameters).toContain("JJ-5");
    expect(statement.parameters).toContain("inbound");
    expect(statement.parameters).toContain("CAD");
    expect(statement.parameters).toContain("Welded the spindle");
    expect(statement.parameters).toContain("user-1");
    expect(statement.parameters).toContain(NOW);
  });

  it("does not write the total, the zone or the address (D125, D132)", () => {
    const sql = buildCreateRepairStatement(createInput()).sql;
    expect(sql).not.toContain("cost_cents");
    expect(sql).not.toContain("zone_uuid");
    expect(sql).not.toContain("address_uuid");
  });

  it("writes completed_at only for a Completed repair, as the moment of Save (D135)", () => {
    const open = buildCreateRepairStatement(createInput());
    expect(open.parameters.filter((p) => p === NOW)).toHaveLength(1); // created_at only
    const done = buildCreateRepairStatement(
      createInput({ values: values({ status: "completed" }) }),
    );
    expect(done.parameters.filter((p) => p === NOW)).toHaveLength(2); // created_at and completed_at
  });

  it("writes an empty vendor, number and notes as NULL and trims the number (D137)", () => {
    const empty = buildCreateRepairStatement(
      createInput({ values: values({ vendorUuid: null, invoiceNumber: "   ", notes: "  " }) }),
    );
    expect(empty.parameters).not.toContain("   ");
    expect(empty.parameters).not.toContain("  ");
    const trimmed = buildCreateRepairStatement(
      createInput({ values: values({ invoiceNumber: "  JJ-5 " }) }),
    );
    expect(trimmed.parameters).toContain("JJ-5");
    expect(trimmed.parameters).not.toContain("  JJ-5 ");
  });

  it("leaves the owner column out when the user's id is not known yet", () => {
    const statement = buildCreateRepairStatement(createInput({ createdByUserUuid: null }));
    expect(statement.sql).not.toContain("created_by_user_uuid");
  });
});

describe("the builders (run on SQLite)", () => {
  let sqlite: DatabaseSync;

  const run = (statements: CompiledQuery[]) => {
    for (const s of statements) sqlite.prepare(s.sql).run(...(s.parameters as SQLInputValue[]));
  };
  const repairRowOf = (id = REPAIR) =>
    sqlite.prepare(`select * from "MaintenanceEvents" where id = ?`).get(id) as any;
  const reportRowOf = (id: string) =>
    sqlite.prepare(`select * from "DamageReports" where id = ?`).get(id) as any;

  beforeEach(() => {
    sqlite = new DatabaseSync(":memory:");
    sqlite.exec(`
      create table "MaintenanceEvents" (
        id text primary key, event_name text, event_start text, event_end text,
        vendor_uuid text, invoice_number text, status text, currency text, notes text,
        completed_at text, cost_cents integer, zone_uuid text, address_uuid text,
        created_by_user_uuid text, created_at text, deleted integer
      );
      create table "DamageReports" (
        id text primary key, resolved_at text, maintenance_event_uuid text, bleacher_uuid text
      );
      insert into "MaintenanceEvents" values
        ('${REPAIR}', 'Maintenance / Repair', '2026-11-01', '2026-11-05', '${VENDOR}', 'JJ-5',
         'inbound', 'CAD', 'Welded the spindle', null, 12300, 'z1', 'a1', 'owner-1',
         '2026-10-30T10:00:00.000Z', 0),
        ('${OTHER_REPAIR}', 'Maintenance / Repair', '2026-11-02', '2026-11-06', '${VENDOR}', 'JJ-6',
         'inbound', 'USD', null, null, 500, null, null, 'owner-2', '2026-10-31T10:00:00.000Z', 0);
      insert into "DamageReports" values
        ('rep-1', null, null, 'b1'),
        ('rep-2', null, null, 'b1'),
        ('rep-closed', '2026-10-01T10:00:00.000Z', 'older-repair', 'b1'),
        ('rep-outside', null, null, 'b2');
    `);
  });

  it("an insert makes the row, with deleted 0, and touches nothing else", () => {
    const id = "r0000000-0000-4000-8000-0000000000aa";
    run([
      buildCreateRepairStatement(
        createInput({ id, values: values({ invoiceNumber: " JJ-9 ", notes: " " }) }),
      ),
    ]);
    expect(repairRowOf(id)).toMatchObject({
      event_name: "Maintenance / Repair",
      event_start: "2026-11-01",
      event_end: "2026-11-05",
      vendor_uuid: VENDOR,
      invoice_number: "JJ-9",
      status: "inbound",
      currency: "CAD",
      notes: null,
      completed_at: null,
      cost_cents: null,
      zone_uuid: null,
      address_uuid: null,
      created_by_user_uuid: "user-1",
      created_at: NOW,
      deleted: 0,
    });
    expect(repairRowOf(REPAIR)).toMatchObject({ invoice_number: "JJ-5", cost_cents: 12300 });
    expect(sqlite.prepare(`select count(*) as n from "MaintenanceEvents"`).get()).toMatchObject({
      n: 3,
    });
  });

  it("an insert of a Completed repair writes completed_at as the moment", () => {
    const id = "r0000000-0000-4000-8000-0000000000bb";
    run([buildCreateRepairStatement(createInput({ id, values: values({ status: "completed" }) }))]);
    expect(repairRowOf(id)).toMatchObject({ status: "completed", completed_at: NOW });
  });

  describe("buildUpdateRepairStatements", () => {
    it("writes nothing when no field changed", () => {
      expect(buildUpdateRepairStatements(updateInput())).toEqual([]);
    });

    it("writes only the changed columns, and never the status, in the first statement", () => {
      const [statement, ...rest] = buildUpdateRepairStatements(
        updateInput({ values: values({ notes: "New note", currency: "USD" }) }),
      );
      expect(rest).toEqual([]);
      expect(statement.sql).toMatch(/^update "MaintenanceEvents" set/i);
      expect(statement.sql).toContain('"notes"');
      expect(statement.sql).toContain('"currency"');
      for (const other of ["vendor_uuid", "invoice_number", "event_start", "event_end", "status"]) {
        expect(statement.sql).not.toContain(`"${other}"`);
      }
      expect(statement.parameters).toEqual(["USD", "New note", REPAIR]);
    });

    it("writes the invoice number trimmed, and an emptied vendor, number and notes as NULL", () => {
      const [statement] = buildUpdateRepairStatements(
        updateInput({ values: values({ vendorUuid: null, invoiceNumber: "", notes: "" }) }),
      );
      expect(statement.parameters).toEqual([null, null, null, REPAIR]);
      const [trimmed] = buildUpdateRepairStatements(
        updateInput({ values: values({ invoiceNumber: " JJ-7 " }) }),
      );
      expect(trimmed.parameters).toEqual(["JJ-7", REPAIR]);
    });

    it("never writes the name, the total, the zone, the address, the owner or deleted", () => {
      const statements = buildUpdateRepairStatements(
        updateInput({
          values: values({ vendorUuid: OTHER_VENDOR, notes: "x", status: "completed" }),
        }),
      );
      for (const s of statements) {
        for (const column of [
          "event_name",
          "cost_cents",
          "zone_uuid",
          "address_uuid",
          "created_by_user_uuid",
          "created_at",
          "deleted",
        ]) {
          expect(s.sql, column).not.toContain(`"${column}"`);
        }
      }
    });

    it("adds the statements of spec 08 when the person picked another status (into Completed)", () => {
      const statements = buildUpdateRepairStatements(
        updateInput({ values: values({ status: "completed", notes: "Done" }) }),
      );
      expect(statements).toHaveLength(3);
      expect(statements[0].sql).toContain('"notes"');
      expect(statements[0].sql).not.toContain('"status"');
      expect(statements[1].sql).toMatch(/^update "MaintenanceEvents" set/i);
      expect(statements[1].sql).toMatch(/"status" = \?/);
      expect(statements[1].parameters).toEqual(["completed", NOW, REPAIR]);
      expect(statements[2].sql).toMatch(/^update "DamageReports" set/i);
      expect(statements[2].sql).toMatch(/"resolved_at" is null/i);
      expect(statements[2].parameters).toEqual([NOW, REPAIR, "rep-1", "rep-2"]);
    });

    it("clears completed_at and closes no report when the status leaves Completed", () => {
      const statements = buildUpdateRepairStatements(
        updateInput({
          initial: values({ status: "completed" }),
          values: values({ status: "in_repair" }),
          liveStatus: "completed",
        }),
      );
      expect(statements).toHaveLength(1);
      expect(statements[0].parameters).toEqual(["in_repair", null, REPAIR]);
    });

    it("adds nothing for the status when the list already shows the chosen status", () => {
      const statements = buildUpdateRepairStatements(
        updateInput({ values: values({ status: "triaged" }), liveStatus: "triaged" }),
      );
      expect(statements).toEqual([]);
    });

    it("run on SQLite: only the changed columns of that repair change", () => {
      run(
        buildUpdateRepairStatements(
          updateInput({ values: values({ notes: "New note", eventEnd: "2026-11-09" }) }),
        ),
      );
      expect(repairRowOf()).toMatchObject({
        notes: "New note",
        event_end: "2026-11-09",
        event_start: "2026-11-01",
        invoice_number: "JJ-5",
        vendor_uuid: VENDOR,
        currency: "CAD",
        status: "inbound",
        cost_cents: 12300,
        zone_uuid: "z1",
        address_uuid: "a1",
        created_by_user_uuid: "owner-1",
        deleted: 0,
      });
      expect(repairRowOf(OTHER_REPAIR)).toMatchObject({ notes: null, event_end: "2026-11-06" });
    });

    it("run on SQLite: a status change closes only the open listed reports", () => {
      run(
        buildUpdateRepairStatements(
          updateInput({
            values: values({ status: "completed" }),
            reported: [report("rep-1"), report("rep-closed")],
          }),
        ),
      );
      expect(repairRowOf()).toMatchObject({ status: "completed", completed_at: NOW });
      expect(reportRowOf("rep-1")).toMatchObject({
        resolved_at: NOW,
        maintenance_event_uuid: REPAIR,
      });
      expect(reportRowOf("rep-closed")).toMatchObject({
        resolved_at: "2026-10-01T10:00:00.000Z",
        maintenance_event_uuid: "older-repair",
      });
      expect(reportRowOf("rep-2")).toMatchObject({ resolved_at: null });
      expect(reportRowOf("rep-outside")).toMatchObject({ resolved_at: null });
    });
  });

  describe("buildSetDeletedStatement", () => {
    it("sets deleted to 1 or 0 on one repair", () => {
      const del = buildSetDeletedStatement(REPAIR, true);
      expect(del.sql).toMatch(/^update "MaintenanceEvents" set "deleted" = \?/i);
      expect(del.parameters).toEqual([1, REPAIR]);
      expect(buildSetDeletedStatement(REPAIR, false).parameters).toEqual([0, REPAIR]);
    });

    it("run on SQLite: changes that repair only and no other column", () => {
      run([buildSetDeletedStatement(REPAIR, true)]);
      expect(repairRowOf()).toMatchObject({ deleted: 1, status: "inbound", cost_cents: 12300 });
      expect(repairRowOf(OTHER_REPAIR)).toMatchObject({ deleted: 0 });
      run([buildSetDeletedStatement(REPAIR, false)]);
      expect(repairRowOf()).toMatchObject({ deleted: 0 });
    });
  });

  describe("buildInvoiceDuplicateQuery and findInvoiceDuplicate (D137)", () => {
    beforeEach(() => {
      typedGetAll.mockReset();
      typedGetAll.mockImplementation((compiled: CompiledQuery) =>
        Promise.resolve(
          sqlite.prepare(compiled.sql).all(...(compiled.parameters as SQLInputValue[])),
        ),
      );
    });

    it("has nothing to compare without a vendor or without a number", () => {
      expect(
        buildInvoiceDuplicateQuery({
          vendorUuid: null,
          invoiceNumber: "JJ-5",
          excludeRepairId: null,
        }),
      ).toBeNull();
      expect(
        buildInvoiceDuplicateQuery({
          vendorUuid: VENDOR,
          invoiceNumber: "  ",
          excludeRepairId: null,
        }),
      ).toBeNull();
      expect(
        buildInvoiceDuplicateQuery({
          vendorUuid: VENDOR,
          invoiceNumber: null,
          excludeRepairId: null,
        }),
      ).toBeNull();
    });

    it("finds a live repair with the same vendor and number", async () => {
      expect(
        await findInvoiceDuplicate({
          vendorUuid: VENDOR,
          invoiceNumber: "JJ-5",
          excludeRepairId: null,
        }),
      ).toBe(true);
    });

    it("ignores the case and the spaces at the ends", async () => {
      expect(
        await findInvoiceDuplicate({
          vendorUuid: VENDOR,
          invoiceNumber: "  jj-5 ",
          excludeRepairId: null,
        }),
      ).toBe(true);
    });

    it("does not count a deleted repair", async () => {
      sqlite.prepare(`update "MaintenanceEvents" set deleted = 1 where id = ?`).run(REPAIR);
      expect(
        await findInvoiceDuplicate({
          vendorUuid: VENDOR,
          invoiceNumber: "JJ-5",
          excludeRepairId: null,
        }),
      ).toBe(false);
    });

    it("does not count the repair itself", async () => {
      expect(
        await findInvoiceDuplicate({
          vendorUuid: VENDOR,
          invoiceNumber: "JJ-5",
          excludeRepairId: REPAIR,
        }),
      ).toBe(false);
    });

    it("does not count the same number of another vendor, nor another number", async () => {
      expect(
        await findInvoiceDuplicate({
          vendorUuid: OTHER_VENDOR,
          invoiceNumber: "JJ-5",
          excludeRepairId: null,
        }),
      ).toBe(false);
      expect(
        await findInvoiceDuplicate({
          vendorUuid: VENDOR,
          invoiceNumber: "JJ-55",
          excludeRepairId: null,
        }),
      ).toBe(false);
    });

    it("answers false without reading anything when there is nothing to compare", async () => {
      typedGetAll.mockClear();
      expect(
        await findInvoiceDuplicate({
          vendorUuid: null,
          invoiceNumber: "JJ-5",
          excludeRepairId: null,
        }),
      ).toBe(false);
      expect(typedGetAll).not.toHaveBeenCalled();
    });
  });

  describe("readVendorCountry (D133)", () => {
    beforeEach(() => {
      typedGetAll.mockReset();
      typedGetAll.mockImplementation((compiled: CompiledQuery) =>
        Promise.resolve(
          sqlite.prepare(compiled.sql).all(...(compiled.parameters as SQLInputValue[])),
        ),
      );
      sqlite.exec(`
        create table "Vendors" (id text primary key, address_uuid text);
        create table "Addresses" (id text primary key, city text, state_province text, country text);
        insert into "Addresses" values ('a-ca', 'Calgary', 'AB', 'CA');
        insert into "Vendors" values ('v-ca', 'a-ca'), ('v-none', null);
      `);
    });

    it("gives the country of the vendor's address, or null", async () => {
      expect(await readVendorCountry("v-ca")).toBe("CA");
      expect(await readVendorCountry("v-none")).toBeNull();
      expect(await readVendorCountry("v-missing")).toBeNull();
    });
  });
});

describe("the writers", () => {
  beforeEach(() => {
    typedExecuteBatch.mockReset();
    typedGetAll.mockReset();
    toastCustom.mockReset();
    typedExecuteBatch.mockResolvedValue(undefined);
    typedGetAll.mockResolvedValue([]);
  });

  describe("createRepair", () => {
    const input = (over: Partial<CreateRepairInput> = {}) => {
      const { id: _id, ...rest } = createInput(over);
      return rest;
    };

    it("returns the date errors and writes nothing (D138)", async () => {
      const errors = await createRepair(
        input({ values: values({ eventStart: "", eventEnd: "" }) }),
      );
      expect(errors).toEqual({
        eventStart: REPAIR_FORM_MESSAGES.eventStartRequired,
        eventEnd: REPAIR_FORM_MESSAGES.eventEndRequired,
      });
      expect(typedExecuteBatch).not.toHaveBeenCalled();
      expect(toastCustom).not.toHaveBeenCalled();
    });

    it("returns the duplicate error and writes nothing", async () => {
      typedGetAll.mockResolvedValue([{ id: OTHER_REPAIR }]);
      const errors = await createRepair(input());
      expect(errors).toEqual({ invoiceNumber: REPAIR_FORM_MESSAGES.invoiceDuplicate });
      expect(typedExecuteBatch).not.toHaveBeenCalled();
    });

    it("sends one insert in one batch and shows no toast on success (D140)", async () => {
      expect(await createRepair(input())).toBeNull();
      expect(typedExecuteBatch).toHaveBeenCalledTimes(1);
      const statements = typedExecuteBatch.mock.calls[0][0] as CompiledQuery[];
      expect(statements).toHaveLength(1);
      expect(statements[0].sql).toMatch(/^insert into "MaintenanceEvents"/i);
      expect(toastCustom).not.toHaveBeenCalled();
    });

    // docs/specs/repairs-09b3-files.md §3: the page makes the id of a New repair, so the files can be
    // written for it after the repair is saved.
    it("uses the id it is given for the repair row, and makes one when it is given none (09b3)", async () => {
      await createRepair({ ...input(), id: "given-id" });
      const given = typedExecuteBatch.mock.calls[0][0] as CompiledQuery[];
      expect(given[0].parameters[0]).toBe("given-id");

      await createRepair(input());
      const made = typedExecuteBatch.mock.calls[1][0] as CompiledQuery[];
      expect(made[0].parameters[0]).toMatch(/^[0-9a-f-]{36}$/);
      expect(made[0].parameters[0]).not.toBe("given-id");
    });

    it("does not look for a duplicate when there is no vendor or no number", async () => {
      await createRepair(input({ values: values({ vendorUuid: null }) }));
      await createRepair(input({ values: values({ invoiceNumber: "" }) }));
      expect(typedGetAll).not.toHaveBeenCalled();
      expect(typedExecuteBatch).toHaveBeenCalledTimes(2);
    });

    it("shows a red toast with the message and the error text, and rejects, when the write fails (D139)", async () => {
      typedExecuteBatch.mockRejectedValue(new Error("disk is full"));
      await expect(createRepair(input())).rejects.toThrow("disk is full");
      expect(toastCustom).toHaveBeenCalledTimes(1);
      const lines = toastLines();
      expect(lines[0]).toBe("Failed to save the repair.");
      expect(lines.join(" ")).toContain("disk is full");
    });
  });

  describe("updateRepair", () => {
    it("writes nothing and checks nothing when no field changed", async () => {
      expect(await updateRepair(updateInput())).toBeNull();
      expect(typedExecuteBatch).not.toHaveBeenCalled();
      expect(typedGetAll).not.toHaveBeenCalled();
    });

    it("does not look for a duplicate when neither the vendor nor the number changed", async () => {
      expect(await updateRepair(updateInput({ values: values({ notes: "New note" }) }))).toBeNull();
      expect(typedGetAll).not.toHaveBeenCalled();
      expect(typedExecuteBatch).toHaveBeenCalledTimes(1);
    });

    it("looks for a duplicate, leaving the repair itself out, when the number changed", async () => {
      await updateRepair(updateInput({ values: values({ invoiceNumber: "JJ-9" }) }));
      expect(typedGetAll).toHaveBeenCalledTimes(1);
      const compiled = typedGetAll.mock.calls[0][0] as CompiledQuery;
      expect(compiled.parameters).toContain(REPAIR);
      expect(compiled.parameters).toContain("jj-9");
    });

    it("looks for a duplicate when the vendor changed", async () => {
      await updateRepair(updateInput({ values: values({ vendorUuid: OTHER_VENDOR }) }));
      expect(typedGetAll).toHaveBeenCalledTimes(1);
    });

    it("returns the duplicate error and writes nothing", async () => {
      typedGetAll.mockResolvedValue([{ id: OTHER_REPAIR }]);
      const errors = await updateRepair(updateInput({ values: values({ invoiceNumber: "JJ-6" }) }));
      expect(errors).toEqual({ invoiceNumber: REPAIR_FORM_MESSAGES.invoiceDuplicate });
      expect(typedExecuteBatch).not.toHaveBeenCalled();
    });

    it("returns the order error and writes nothing", async () => {
      const errors = await updateRepair(
        updateInput({ values: values({ eventStart: "2026-11-09", eventEnd: "2026-11-05" }) }),
      );
      expect(errors).toEqual({ eventEnd: REPAIR_FORM_MESSAGES.eventEndBeforeStart });
      expect(typedExecuteBatch).not.toHaveBeenCalled();
    });

    it("sends the statements in one batch and shows no toast on success", async () => {
      expect(
        await updateRepair(updateInput({ values: values({ notes: "x", status: "completed" }) })),
      ).toBeNull();
      expect(typedExecuteBatch).toHaveBeenCalledTimes(1);
      expect((typedExecuteBatch.mock.calls[0][0] as CompiledQuery[]).length).toBe(3);
      expect(toastCustom).not.toHaveBeenCalled();
    });

    it("shows the red toast and rejects when the write fails", async () => {
      typedExecuteBatch.mockRejectedValue(new Error("disk is full"));
      await expect(updateRepair(updateInput({ values: values({ notes: "x" }) }))).rejects.toThrow(
        "disk is full",
      );
      expect(toastLines()[0]).toBe("Failed to save the repair.");
    });
  });

  describe("deleteRepair", () => {
    it("sends one update in one batch and shows no toast on success", async () => {
      await deleteRepair(REPAIR);
      expect(typedExecuteBatch).toHaveBeenCalledTimes(1);
      const statements = typedExecuteBatch.mock.calls[0][0] as CompiledQuery[];
      expect(statements).toHaveLength(1);
      expect(statements[0].parameters).toEqual([1, REPAIR]);
      expect(toastCustom).not.toHaveBeenCalled();
    });

    it("shows the delete message with the error text, and rejects, when the write fails", async () => {
      typedExecuteBatch.mockRejectedValue(new Error("disk is full"));
      await expect(deleteRepair(REPAIR)).rejects.toThrow("disk is full");
      expect(toastLines()[0]).toBe("Failed to delete the repair.");
      expect(toastLines().join(" ")).toContain("disk is full");
    });
  });

  describe("restoreRepair", () => {
    const repair = { repairId: REPAIR, vendorUuid: VENDOR, invoiceNumber: "JJ-5" };

    it("restores when there is no duplicate", async () => {
      expect(await restoreRepair(repair)).toBe("restored");
      const statements = typedExecuteBatch.mock.calls[0][0] as CompiledQuery[];
      expect(statements[0].parameters).toEqual([0, REPAIR]);
      expect(toastCustom).not.toHaveBeenCalled();
    });

    it("looks for a live duplicate of the repair's own vendor and number, leaving itself out", async () => {
      await restoreRepair(repair);
      const compiled = typedGetAll.mock.calls[0][0] as CompiledQuery;
      expect(compiled.parameters).toContain(VENDOR);
      expect(compiled.parameters).toContain("jj-5");
      expect(compiled.parameters).toContain(REPAIR);
    });

    it("refuses with a red toast, writes nothing and says duplicate when a live repair has the pair (D145)", async () => {
      typedGetAll.mockResolvedValue([{ id: OTHER_REPAIR }]);
      expect(await restoreRepair(repair)).toBe("duplicate");
      expect(typedExecuteBatch).not.toHaveBeenCalled();
      expect(toastCustom).toHaveBeenCalledTimes(1);
      expect(toastLines()).toEqual([REPAIR_FORM_MESSAGES.restoreDuplicate]);
    });

    it("restores a repair that has no vendor or no number without looking for a duplicate", async () => {
      expect(
        await restoreRepair({ repairId: REPAIR, vendorUuid: null, invoiceNumber: "JJ-5" }),
      ).toBe("restored");
      expect(typedGetAll).not.toHaveBeenCalled();
    });

    it("shows the restore message with the error text, and rejects, when the write fails", async () => {
      typedExecuteBatch.mockRejectedValue(new Error("disk is full"));
      await expect(restoreRepair(repair)).rejects.toThrow("disk is full");
      expect(toastLines()[0]).toBe("Failed to restore the repair.");
    });
  });
});

// docs/specs/repairs-09b1-services.md §2.6 and §3 (D149, D161): the services draft rides in the same
// write as the repair, after the statements of the fields and the status. docs/specs/repairs-09b2-
// bleachers-zone-reports.md §2.3 and §3 (D176, D184, D186): when the draft changes services, the write
// goes through `writeRepairChanges`; a repair with no change in services is one plain batch as before.
describe("the services draft (09b1, 09b2)", () => {
  const serviceValues = (over: Partial<ServiceFormValues> = {}): ServiceFormValues => ({
    bleacherUuid: "b1",
    categoryUuid: "c1",
    severity: "minor",
    description: "Weld",
    laborText: "10.00",
    partsText: "",
    taxText: "",
    freightText: "",
    ...over,
  });
  const stored = repairRow({
    id: REPAIR,
    services: [repairService({ id: "s1", description: "Weld", laborCents: 1000 })],
  });
  const added = (): ServicesDraft =>
    addDraftService(servicesDraftFromRepair(stored), "n1", serviceValues({ bleacherUuid: "b2" }));
  const removed = (): ServicesDraft => removeDraftService(servicesDraftFromRepair(stored), "s1");

  beforeEach(() => {
    typedExecuteBatch.mockReset();
    typedGetAll.mockReset();
    toastCustom.mockReset();
    writeRepairChanges.mockReset();
    typedExecuteBatch.mockResolvedValue(undefined);
    typedGetAll.mockResolvedValue([]);
    writeRepairChanges.mockResolvedValue(null);
  });

  // A New repair's draft holds added services only.
  const newDraft = (): ServicesDraft =>
    addDraftService(
      addDraftService([], "n1", serviceValues({ bleacherUuid: "b1" })),
      "n2",
      serviceValues({ bleacherUuid: "b2" }),
    );

  it("createRepair with services hands the repair first and then the services to the runner, with the added bleachers checked", async () => {
    const { id: _id, ...rest } = createInput({ services: newDraft() });
    expect(await createRepair(rest)).toBeNull();
    expect(typedExecuteBatch).not.toHaveBeenCalled();
    expect(writeRepairChanges).toHaveBeenCalledTimes(1);
    const call = writeRepairChanges.mock.calls[0][0];
    const statements = call.statements as CompiledQuery[];
    expect(statements.map((s) => s.sql.match(/"(\w+)"/)?.[1])).toEqual([
      "MaintenanceEvents",
      "MaintenanceLineItems",
      "MaintenanceLineItems",
    ]);
    expect(statements[0].sql).toMatch(/^insert into "MaintenanceEvents"/i);
    // The services point at the new repair: the id the repair insert was given, which is also the id
    // the runner is told about.
    expect(call.repairId).toBe(statements[0].parameters[0]);
    expect(statements[1].parameters).toContain(call.repairId);
    expect(call.servicesAffected).toBe(true);
    expect(call.checkedBleacherUuids).toEqual(["b1", "b2"]);
    expect(call.now).toBe(NOW);
    expect(call.timezone).toBe("America/Toronto");
    expect(call.failedMessage).toBe("Failed to save the repair.");
  });

  it("createRepair hands the id it was given to the runner and to the repair row (09b3)", async () => {
    const { id: _id, ...rest } = createInput({ services: newDraft() });
    await createRepair({ ...rest, id: "given-id" });
    const call = writeRepairChanges.mock.calls[0][0];
    expect(call.repairId).toBe("given-id");
    expect((call.statements as CompiledQuery[])[0].parameters[0]).toBe("given-id");
  });

  it("createRepair returns { services } for a zone refusal and shows no toast", async () => {
    writeRepairChanges.mockResolvedValue({ message: "refused" });
    const { id: _id, ...rest } = createInput({ services: newDraft() });
    expect(await createRepair(rest)).toEqual({ services: "refused" });
    expect(toastCustom).not.toHaveBeenCalled();
  });

  it("createRepair without services, or with a draft that nets out to nothing, is the plain batch it always was", async () => {
    const { id: _id, ...rest } = createInput();
    await createRepair(rest);
    expect(writeRepairChanges).not.toHaveBeenCalled();
    expect((typedExecuteBatch.mock.calls[0][0] as CompiledQuery[]).length).toBe(1);

    const cancelled = removeDraftService(addDraftService([], "n1", serviceValues()), "n1");
    await createRepair({ ...rest, services: cancelled });
    expect(writeRepairChanges).not.toHaveBeenCalled();
    expect(typedExecuteBatch).toHaveBeenCalledTimes(2);
  });

  it("buildUpdateRepairStatements appends the services after the fields and the status", () => {
    const statements = buildUpdateRepairStatements(
      updateInput({
        values: values({ notes: "x", status: "completed" }),
        services: added(),
      }),
    );
    expect(statements.map((s) => s.sql.match(/^(update "\w+"|insert into "\w+")/)?.[1])).toEqual([
      'update "MaintenanceEvents"',
      'update "MaintenanceEvents"',
      'update "DamageReports"',
      'insert into "MaintenanceLineItems"',
    ]);
  });

  it("updateRepair with only a services change goes through the runner, runs no duplicate check and returns null", async () => {
    expect(await updateRepair(updateInput({ services: removed() }))).toBeNull();
    expect(typedGetAll).not.toHaveBeenCalled();
    expect(typedExecuteBatch).not.toHaveBeenCalled();
    const call = writeRepairChanges.mock.calls[0][0];
    const statements = call.statements as CompiledQuery[];
    expect(statements).toHaveLength(1);
    expect(statements[0].sql).toMatch(/^update "MaintenanceLineItems"/i);
    expect(statements[0].parameters).toEqual([1, "s1"]);
    expect(call.repairId).toBe(REPAIR);
    expect(call.servicesAffected).toBe(true);
    expect(call.checkedBleacherUuids).toEqual([]);
  });

  it("updateRepair checks the added services and the stored ones whose bleacher changed", async () => {
    const base = servicesDraftFromRepair(stored);
    const moved = updateDraftService(base, "s1", { ...base[0].values, bleacherUuid: "b9" });
    await updateRepair(updateInput({ services: moved }));
    expect(writeRepairChanges.mock.calls[0][0].checkedBleacherUuids).toEqual(["b9"]);
  });

  it("updateRepair writes nothing when neither a field nor the services changed", async () => {
    expect(
      await updateRepair(updateInput({ services: servicesDraftFromRepair(stored) })),
    ).toBeNull();
    expect(typedExecuteBatch).not.toHaveBeenCalled();
    expect(writeRepairChanges).not.toHaveBeenCalled();
  });

  it("updateRepair with only fields changed is the plain batch, with no runner", async () => {
    await updateRepair(
      updateInput({ values: values({ notes: "x" }), services: servicesDraftFromRepair(stored) }),
    );
    expect(writeRepairChanges).not.toHaveBeenCalled();
    expect(typedExecuteBatch).toHaveBeenCalledTimes(1);
  });

  it("updateRepair with both hands the repair's statement first and the services after it to the runner", async () => {
    await updateRepair(updateInput({ values: values({ notes: "x" }), services: added() }));
    const call = writeRepairChanges.mock.calls[0][0];
    const statements = call.statements as CompiledQuery[];
    expect(statements).toHaveLength(2);
    expect(statements[0].sql).toMatch(/^update "MaintenanceEvents"/i);
    expect(statements[1].sql).toMatch(/^insert into "MaintenanceLineItems"/i);
    expect(call.failedMessage).toBe("Failed to save the repair.");
    expect(call.timezone).toBe("America/Toronto");
  });

  it("updateRepair returns { services } for a zone refusal", async () => {
    writeRepairChanges.mockResolvedValue({ message: "refused" });
    expect(await updateRepair(updateInput({ services: added() }))).toEqual({ services: "refused" });
  });

  it("the duplicate check still runs first, and a duplicate stops the runner", async () => {
    typedGetAll.mockResolvedValue([{ id: OTHER_REPAIR }]);
    const errors = await updateRepair(
      updateInput({ values: values({ invoiceNumber: "JJ-6" }), services: added() }),
    );
    expect(errors).toEqual({ invoiceNumber: REPAIR_FORM_MESSAGES.invoiceDuplicate });
    expect(writeRepairChanges).not.toHaveBeenCalled();
  });
});
