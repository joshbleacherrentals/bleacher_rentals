import { beforeEach, describe, expect, it, vi } from "vitest";
import { DatabaseSync, type SQLInputValue } from "node:sqlite";
import type { CompiledQuery } from "kysely";

// docs/specs/repairs-08-status.md §2.3, §3 and §7 (D112 to D117, D119). `buildStatusStatements`
// compiles the writes with the app's Kysely; the second half of this file runs the compiled text on
// an in-memory SQLite shaped like the local PowerSync database. `changeRepairStatus` is the one
// writer: it sends the statements in one batch, and only an error shows a toast.

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

import { buildStatusStatements, changeRepairStatus, type StatusChange } from "./repairStatusWrite";

const REPAIR = "r0000000-0000-4000-8000-000000000001";
const OTHER_REPAIR = "r0000000-0000-4000-8000-000000000002";
const NOW = "2026-11-20T15:30:00.000Z";
const report = (id: string) => ({ id, day: "2026-11-01", createdAt: "2026-11-01T12:00:00Z" });

const change = (over: Partial<StatusChange> = {}): StatusChange => ({
  repairId: REPAIR,
  from: "in_repair",
  to: "completed",
  reported: [report("rep-1"), report("rep-2")],
  now: NOW,
  ...over,
});

describe("buildStatusStatements (what is written)", () => {
  it("writes nothing when the status does not change", () => {
    expect(buildStatusStatements(change({ from: "completed", to: "completed" }))).toEqual([]);
  });

  it("moving into Completed writes the repair and then the reports", () => {
    const [repair, reports, ...rest] = buildStatusStatements(change());
    expect(rest).toEqual([]);
    expect(repair.sql).toMatch(/^update "MaintenanceEvents" set/i);
    expect(repair.sql).toMatch(/"status" = \?/);
    expect(repair.sql).toMatch(/"completed_at" = \?/);
    expect(repair.parameters).toEqual(["completed", NOW, REPAIR]);
    expect(reports.sql).toMatch(/^update "DamageReports" set/i);
    expect(reports.sql).toMatch(/"resolved_at" is null/i);
    expect(reports.parameters).toEqual([NOW, REPAIR, "rep-1", "rep-2"]);
  });

  it("moving out of Completed writes one statement that clears completed_at, and no reports", () => {
    const statements = buildStatusStatements(change({ from: "completed", to: "in_repair" }));
    expect(statements).toHaveLength(1);
    expect(statements[0].sql).toMatch(/^update "MaintenanceEvents" set/i);
    expect(statements[0].sql).toMatch(/"completed_at" = \?/);
    expect(statements[0].parameters).toEqual(["in_repair", null, REPAIR]);
  });

  it("moving between two statuses that are not Completed leaves completed_at out", () => {
    const statements = buildStatusStatements(change({ from: "inbound", to: "triaged" }));
    expect(statements).toHaveLength(1);
    expect(statements[0].sql).not.toMatch(/completed_at/);
    expect(statements[0].parameters).toEqual(["triaged", REPAIR]);
  });

  it("writes only the repair statement when it has no reports", () => {
    const statements = buildStatusStatements(change({ reported: [] }));
    expect(statements).toHaveLength(1);
    expect(statements[0].sql).toMatch(/^update "MaintenanceEvents"/i);
  });
});

describe("buildStatusStatements (run on SQLite)", () => {
  let sqlite: DatabaseSync;

  const run = (statements: CompiledQuery[]) => {
    for (const s of statements) sqlite.prepare(s.sql).run(...(s.parameters as SQLInputValue[]));
  };
  const repairRow = (id = REPAIR) =>
    sqlite.prepare(`select * from "MaintenanceEvents" where id = ?`).get(id) as any;
  const reportRow = (id: string) =>
    sqlite.prepare(`select * from "DamageReports" where id = ?`).get(id) as any;

  beforeEach(() => {
    sqlite = new DatabaseSync(":memory:");
    sqlite.exec(`
      create table "MaintenanceEvents" (
        id text primary key, status text, completed_at text, event_start text, event_end text,
        cost_cents integer, notes text, deleted integer
      );
      create table "DamageReports" (
        id text primary key, resolved_at text, maintenance_event_uuid text, bleacher_uuid text
      );
      insert into "MaintenanceEvents" values
        ('${REPAIR}', 'in_repair', null, '2026-11-01', '2026-11-05', 12300, 'notes', 0),
        ('${OTHER_REPAIR}', 'in_repair', null, '2026-11-02', '2026-11-06', 500, null, 0);
      insert into "DamageReports" values
        ('rep-1', null, null, 'b1'),
        ('rep-2', null, null, 'b1'),
        ('rep-closed', '2026-10-01T10:00:00.000Z', 'older-repair', 'b1'),
        ('rep-outside', null, null, 'b2');
    `);
  });

  it("moving into Completed sets status and completed_at on that repair only", () => {
    run(buildStatusStatements(change({ reported: [] })));
    expect(repairRow()).toMatchObject({
      status: "completed",
      completed_at: NOW,
      event_start: "2026-11-01",
      event_end: "2026-11-05",
      cost_cents: 12300,
      notes: "notes",
      deleted: 0,
    });
    expect(repairRow(OTHER_REPAIR)).toMatchObject({ status: "in_repair", completed_at: null });
  });

  it("closes the listed reports that are open: resolved_at is the same moment, linked to the repair", () => {
    run(buildStatusStatements(change()));
    expect(reportRow("rep-1")).toMatchObject({ resolved_at: NOW, maintenance_event_uuid: REPAIR });
    expect(reportRow("rep-2")).toMatchObject({ resolved_at: NOW, maintenance_event_uuid: REPAIR });
  });

  it("never changes a report that is already closed, even when it is listed (D116)", () => {
    run(buildStatusStatements(change({ reported: [report("rep-1"), report("rep-closed")] })));
    expect(reportRow("rep-closed")).toMatchObject({
      resolved_at: "2026-10-01T10:00:00.000Z",
      maintenance_event_uuid: "older-repair",
    });
    expect(reportRow("rep-1").resolved_at).toBe(NOW);
  });

  it("does not touch a report that is not in the list", () => {
    run(buildStatusStatements(change()));
    expect(reportRow("rep-outside")).toMatchObject({
      resolved_at: null,
      maintenance_event_uuid: null,
    });
  });

  it("moving out of Completed clears completed_at and leaves a closed report closed (D113, D117)", () => {
    sqlite
      .prepare(`update "MaintenanceEvents" set status = 'completed', completed_at = ? where id = ?`)
      .run(NOW, REPAIR);
    sqlite
      .prepare(
        `update "DamageReports" set resolved_at = ?, maintenance_event_uuid = ? where id = ?`,
      )
      .run(NOW, REPAIR, "rep-1");

    run(buildStatusStatements(change({ from: "completed", to: "in_repair" })));

    expect(repairRow()).toMatchObject({ status: "in_repair", completed_at: null });
    expect(reportRow("rep-1")).toMatchObject({ resolved_at: NOW, maintenance_event_uuid: REPAIR });
  });

  it("moving between two statuses that are not Completed keeps completed_at as it is", () => {
    sqlite.prepare(`update "MaintenanceEvents" set completed_at = 'kept' where id = ?`).run(REPAIR);
    run(buildStatusStatements(change({ from: "in_repair", to: "confirm_repair" })));
    expect(repairRow()).toMatchObject({ status: "confirm_repair", completed_at: "kept" });
  });
});

describe("changeRepairStatus (the one writer)", () => {
  beforeEach(() => {
    typedExecuteBatch.mockReset();
    toastCustom.mockReset();
    typedExecuteBatch.mockResolvedValue(undefined);
  });

  it("sends the statements in one batch and shows no toast on success (D114)", async () => {
    await changeRepairStatus(change());
    expect(typedExecuteBatch).toHaveBeenCalledTimes(1);
    const statements = typedExecuteBatch.mock.calls[0][0] as CompiledQuery[];
    expect(statements).toHaveLength(2);
    expect(toastCustom).not.toHaveBeenCalled();
  });

  it("sends nothing when the status does not change", async () => {
    await changeRepairStatus(change({ from: "completed", to: "completed" }));
    expect(typedExecuteBatch).not.toHaveBeenCalled();
    expect(toastCustom).not.toHaveBeenCalled();
  });

  it("shows a red error toast and rejects when the write fails (D119)", async () => {
    typedExecuteBatch.mockRejectedValue(new Error("disk is full"));
    await expect(changeRepairStatus(change())).rejects.toThrow("disk is full");

    expect(toastCustom).toHaveBeenCalledTimes(1);
    const render = toastCustom.mock.calls[0][0] as (id: string) => { props: { lines: string[] } };
    const lines = render("t1").props.lines;
    expect(lines[0]).toBe("Failed to change the status.");
    expect(lines.join(" ")).toContain("disk is full");
  });
});
