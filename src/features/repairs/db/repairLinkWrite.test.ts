import { beforeEach, describe, expect, it, vi } from "vitest";
import { DatabaseSync, type SQLInputValue } from "node:sqlite";
import type { CompiledQuery } from "kysely";
import {
  createFakePowerSyncDb,
  type FakePowerSyncDb,
} from "@/lib/powersync/testing/fakePowerSyncDb";

// docs/specs/repairs-09b2-bleachers-zone-reports.md §2.1, §3 and §7 (D169 to D186). The builders
// compile the reads and the writes with the app's Kysely; the rest of this file runs the compiled
// text on an in-memory SQLite shaped like the local PowerSync database, through the real
// `typedQuery` helpers over `createFakePowerSyncDb`.

const { holder, toastCustom } = vi.hoisted(() => ({
  holder: { current: null as unknown },
  toastCustom: vi.fn(),
}));

vi.mock("sonner", () => ({ toast: { custom: toastCustom } }));
vi.mock("@/components/providers/SystemProvider", async () => {
  const { Kysely, SqliteDialect } = await import("kysely");
  const fake = () => holder.current as FakePowerSyncDb;
  return {
    // A dialect that is never connected: `.compile()` needs a query builder, not a database.
    db: new Kysely<any>({ dialect: new SqliteDialect({ database: {} as any }) }),
    powerSyncDb: {
      getAll: (...args: Parameters<FakePowerSyncDb["getAll"]>) => fake().getAll(...args),
      execute: (...args: Parameters<FakePowerSyncDb["execute"]>) => fake().execute(...args),
      writeTransaction: (...args: Parameters<FakePowerSyncDb["writeTransaction"]>) =>
        fake().writeTransaction(...args),
    },
  };
});

import { db } from "@/components/providers/SystemProvider";
import {
  buildBleacherZonesQuery,
  buildCoveringSubrentalsQuery,
  buildJunctionRowsQuery,
  buildLinkStatements,
  buildLiveServiceBleachersQuery,
  buildOpenReportsQuery,
  buildRepairFactsQuery,
  buildZoneNamesQuery,
  findServiceZoneConflict,
  writeRepairChanges,
} from "./repairLinkWrite";
import type { LinkPlan } from "../utils/repairLinks";

const R1 = "r0000000-0000-4000-8000-000000000001";
const R2 = "r0000000-0000-4000-8000-000000000002";
const R3 = "r0000000-0000-4000-8000-000000000003";
const NOW = "2026-11-23T15:30:00.000Z";
const TZ = "America/Toronto";

let sqlite: DatabaseSync;
let fake: FakePowerSyncDb;

const SCHEMA = `
  create table "MaintenanceEvents" (
    id text primary key, status text, event_start text, event_end text, zone_uuid text,
    cost_cents integer, deleted integer, vendor_uuid text, invoice_number text, currency text,
    notes text, completed_at text, event_name text, created_at text
  );
  create table "MaintenanceLineItems" (
    id text primary key, maintenance_event_uuid text, bleacher_uuid text, damage_category_uuid text,
    severity text, description text, labor_cents integer, parts_cents integer, tax_cents integer,
    freight_cents integer, created_at text, deleted integer
  );
  create table "BleacherMaintEvents" (
    id text primary key, bleacher_uuid text, maintenance_event_uuid text, created_at text
  );
  create table "Bleachers" (id text primary key, bleacher_number integer, zone_uuid text);
  create table "SubrentalEvents" (
    id text primary key, bleacher_uuid text, status text, requested_zone_uuid text,
    event_start text, event_end text
  );
  create table "DamageReports" (
    id text primary key, bleacher_uuid text, created_at text, resolved_at text,
    maintenance_event_uuid text, deleted integer
  );
  create table "Zones" (id text primary key, display_name text);
`;

const run = (...statements: CompiledQuery[]) => {
  for (const s of statements) sqlite.prepare(s.sql).run(...(s.parameters as SQLInputValue[]));
};
const all = (sql: string, ...params: SQLInputValue[]) =>
  sqlite.prepare(sql).all(...params) as any[];
const one = (sql: string, ...params: SQLInputValue[]) => sqlite.prepare(sql).get(...params) as any;

const serviceInsert = (id: string, repairId: string, bleacherUuid: string, createdAt = NOW) =>
  db
    .insertInto("MaintenanceLineItems")
    .values({
      id,
      maintenance_event_uuid: repairId,
      bleacher_uuid: bleacherUuid,
      severity: "minor",
      labor_cents: 0,
      parts_cents: 0,
      tax_cents: 0,
      freight_cents: 0,
      created_at: createdAt,
      deleted: 0,
    } as any)
    .compile();

const input = (statements: CompiledQuery[], over: Record<string, unknown> = {}) => ({
  repairId: R1,
  statements,
  servicesAffected: true,
  checkedBleacherUuids: [] as string[],
  now: NOW,
  timezone: TZ,
  failedMessage: "Failed to save the repair.",
  ...over,
});

function toastLines(call = 0): string[] {
  const render = toastCustom.mock.calls[call][0] as (id: string) => { props: { lines: string[] } };
  return render("t1").props.lines;
}

beforeEach(() => {
  toastCustom.mockReset();
  sqlite = new DatabaseSync(":memory:");
  sqlite.exec(SCHEMA);
  fake = createFakePowerSyncDb(sqlite);
  holder.current = fake;
  sqlite.exec(`
    insert into "Zones" values ('z1', 'Zone 1'), ('z2', 'Zone 2');
    insert into "Bleachers" values
      ('b1', 52, 'z1'), ('b2', 53, 'z1'), ('b3', 60, 'z2'), ('b4', 70, null);
    insert into "MaintenanceEvents" (id, status, event_start, event_end, zone_uuid, deleted) values
      ('${R1}', 'inbound', '2026-11-01', '2026-11-05', null, 0),
      ('${R2}', 'inbound', '2026-10-01', '2026-10-05', null, 0);
  `);
});

describe("the reads (what they return)", () => {
  it("live services: the bleachers of the repair's services that are not deleted, oldest first", () => {
    sqlite.exec(`
      insert into "MaintenanceLineItems" (id, maintenance_event_uuid, bleacher_uuid, created_at, deleted) values
        ('s2', '${R1}', 'b2', '2026-11-02T10:00:00Z', 0),
        ('s1', '${R1}', 'b1', '2026-11-01T10:00:00Z', 0),
        ('s3', '${R1}', 'b3', '2026-11-03T10:00:00Z', 1),
        ('s4', '${R2}', 'b4', '2026-11-01T10:00:00Z', 0);
    `);
    const q = buildLiveServiceBleachersQuery(R1);
    expect(all(q.sql, ...(q.parameters as SQLInputValue[]))).toEqual([
      { bleacherUuid: "b1" },
      { bleacherUuid: "b2" },
    ]);
  });

  it("the repair facts and the junction rows of one repair", () => {
    sqlite.exec(`
      update "MaintenanceEvents" set zone_uuid = 'z2', status = 'completed' where id = '${R1}';
      insert into "BleacherMaintEvents" values ('j1', 'b1', '${R1}', 'x'), ('j2', 'b2', '${R2}', 'x');
    `);
    const facts = buildRepairFactsQuery(R1);
    expect(all(facts.sql, ...(facts.parameters as SQLInputValue[]))).toEqual([
      { status: "completed", eventStart: "2026-11-01", eventEnd: "2026-11-05", zoneUuid: "z2" },
    ]);
    const rows = buildJunctionRowsQuery(R1);
    expect(all(rows.sql, ...(rows.parameters as SQLInputValue[]))).toEqual([
      { id: "j1", bleacherUuid: "b1" },
    ]);
  });

  it("the own zones and the numbers of the bleachers asked for", () => {
    const q = buildBleacherZonesQuery(["b1", "b4"]);
    expect(all(q.sql, ...(q.parameters as SQLInputValue[]))).toEqual([
      { bleacherUuid: "b1", bleacherNumber: 52, zoneUuid: "z1" },
      { bleacherUuid: "b4", bleacherNumber: 70, zoneUuid: null },
    ]);
  });

  it("covering sub-rentals: accepted only, the days inclusive, only the bleachers asked for", () => {
    sqlite.exec(`
      insert into "SubrentalEvents" values
        ('a', 'b1', 'accepted', 'z2', '2026-11-01', '2026-11-10'),
        ('edge-end', 'b1', 'accepted', 'z2', '2026-10-20', '2026-11-01'),
        ('pending', 'b1', 'pending', 'z2', '2026-11-01', '2026-11-10'),
        ('denied', 'b1', 'denied', 'z2', '2026-11-01', '2026-11-10'),
        ('later', 'b1', 'accepted', 'z2', '2026-11-02', '2026-11-10'),
        ('other', 'b2', 'accepted', 'z2', '2026-11-01', '2026-11-10');
    `);
    const q = buildCoveringSubrentalsQuery(["b1"], "2026-11-01");
    const rows = all(q.sql, ...(q.parameters as SQLInputValue[]));
    expect(rows).toEqual([
      { bleacherUuid: "b1", zoneUuid: "z2" },
      { bleacherUuid: "b1", zoneUuid: "z2" },
    ]);
  });

  it("open reports: not closed and not deleted, only the bleachers asked for", () => {
    sqlite.exec(`
      insert into "DamageReports" values
        ('open', 'b1', '2026-11-03T10:00:00Z', null, null, 0),
        ('linked', 'b1', '2026-11-03T11:00:00Z', null, '${R2}', 0),
        ('closed', 'b1', '2026-11-03T12:00:00Z', '2026-11-04T10:00:00Z', '${R2}', 0),
        ('deleted', 'b1', '2026-11-03T13:00:00Z', null, null, 1),
        ('other', 'b2', '2026-11-03T14:00:00Z', null, null, 0);
    `);
    const q = buildOpenReportsQuery(["b1"]);
    const rows = all(q.sql, ...(q.parameters as SQLInputValue[])).sort((a, b) =>
      a.id.localeCompare(b.id),
    );
    expect(rows).toEqual([
      { id: "linked", bleacherUuid: "b1", createdAt: "2026-11-03T11:00:00Z", repairId: R2 },
      { id: "open", bleacherUuid: "b1", createdAt: "2026-11-03T10:00:00Z", repairId: null },
    ]);
  });

  it("zone names", () => {
    const q = buildZoneNamesQuery(["z1", "z2"]);
    expect(all(q.sql, ...(q.parameters as SQLInputValue[]))).toEqual([
      { id: "z1", name: "Zone 1" },
      { id: "z2", name: "Zone 2" },
    ]);
  });
});

describe("buildLinkStatements (D184)", () => {
  const plan = (over: Partial<LinkPlan> = {}): LinkPlan => ({
    junctionDeleteBleachers: [],
    junctionInsertBleachers: [],
    zoneToWrite: null,
    unlinkBleachers: [],
    linkReportIds: [],
    closeReportIds: [],
    ...over,
  });

  it("is empty for an empty plan", () => {
    expect(buildLinkStatements(plan(), { repairId: R1, now: NOW })).toEqual([]);
  });

  it("is in the order: rows removed, rows inserted, zone, links removed, links, closings", () => {
    const statements = buildLinkStatements(
      plan({
        junctionDeleteBleachers: ["b1"],
        junctionInsertBleachers: ["b2", "b3"],
        zoneToWrite: "z1",
        unlinkBleachers: ["b1"],
        linkReportIds: ["rep-a"],
        closeReportIds: ["rep-b"],
      }),
      { repairId: R1, now: NOW },
    );
    expect(
      statements.map(
        (s) => s.sql.match(/^(delete from "\w+"|insert into "\w+"|update "\w+")/)?.[1],
      ),
    ).toEqual([
      'delete from "BleacherMaintEvents"',
      'insert into "BleacherMaintEvents"',
      'insert into "BleacherMaintEvents"',
      'update "MaintenanceEvents"',
      'update "DamageReports"',
      'update "DamageReports"',
      'update "DamageReports"',
    ]);
  });

  it("inserts a row with a new uuid and created_at = now, and writes the zone only while it is empty", () => {
    const statements = buildLinkStatements(
      plan({ junctionInsertBleachers: ["b2"], zoneToWrite: "z1" }),
      { repairId: R1, now: NOW },
    );
    expect(statements[0].parameters).toEqual(expect.arrayContaining(["b2", R1, NOW]));
    expect(statements[0].parameters[0]).toMatch(/^[0-9a-f-]{36}$/);
    expect(statements[1].sql).toMatch(/"zone_uuid" is null/i);
    expect(statements[1].parameters).toEqual(["z1", R1]);
  });

  it("links with the guards 'open' and 'linked to no repair', closes with the same time as now", () => {
    const [link, close] = buildLinkStatements(
      plan({ linkReportIds: ["rep-a"], closeReportIds: ["rep-b"] }),
      { repairId: R1, now: NOW },
    );
    expect(link.sql).toMatch(/"resolved_at" is null/i);
    expect(link.sql).toMatch(/"maintenance_event_uuid" is null/i);
    expect(link.sql).not.toMatch(/resolved_at" = \?/i);
    expect(link.parameters).toEqual([R1, "rep-a"]);
    expect(close.sql).toMatch(/"resolved_at" is null/i);
    expect(close.sql).toMatch(/"maintenance_event_uuid" is null/i);
    expect(close.parameters).toEqual([R1, NOW, "rep-b"]);
  });

  it("unlinks only the open reports of the lost bleachers that are linked to this repair", () => {
    const [unlink] = buildLinkStatements(plan({ unlinkBleachers: ["b1", "b2"] }), {
      repairId: R1,
      now: NOW,
    });
    expect(unlink.sql).toMatch(/^update "DamageReports" set "maintenance_event_uuid" = \?/i);
    expect(unlink.sql).toMatch(/"resolved_at" is null/i);
    expect(unlink.parameters).toEqual([null, R1, "b1", "b2"]);
  });
});

describe("writeRepairChanges (run on SQLite)", () => {
  const junction = (repairId = R1) =>
    all(
      `select bleacher_uuid, created_at from "BleacherMaintEvents" where maintenance_event_uuid = ? order by bleacher_uuid`,
      repairId,
    );
  const zoneOf = (repairId = R1) =>
    one(`select zone_uuid from "MaintenanceEvents" where id = ?`, repairId).zone_uuid;
  const report = (id: string) => one(`select * from "DamageReports" where id = ?`, id);

  const seedReports = () =>
    sqlite.exec(`
      insert into "DamageReports" values
        ('rep-free', 'b1', '2026-11-10T15:00:00Z', null, null, 0),
        ('rep-elsewhere', 'b1', '2026-11-10T16:00:00Z', null, '${R2}', 0),
        ('rep-closed', 'b1', '2026-10-01T10:00:00Z', '2026-10-02T10:00:00Z', '${R2}', 0),
        ('rep-deleted', 'b1', '2026-11-10T17:00:00Z', null, null, 1),
        ('rep-b2', 'b2', '2026-11-10T18:00:00Z', null, null, 0);
    `);

  it("the first service on an old repair: no second row, the zone is written, a free report is linked and one linked elsewhere is not", async () => {
    sqlite.exec(
      `insert into "BleacherMaintEvents" values ('j1', 'b1', '${R1}', '2026-01-01T00:00:00Z');`,
    );
    seedReports();
    const refusal = await writeRepairChanges(
      input([serviceInsert("s1", R1, "b1")], { checkedBleacherUuids: ["b1"] }),
    );
    expect(refusal).toBeNull();
    expect(junction()).toEqual([{ bleacher_uuid: "b1", created_at: "2026-01-01T00:00:00Z" }]);
    expect(zoneOf()).toBe("z1");
    expect(report("rep-free")).toMatchObject({ maintenance_event_uuid: R1, resolved_at: null });
    expect(report("rep-elsewhere")).toMatchObject({
      maintenance_event_uuid: R2,
      resolved_at: null,
    });
    expect(report("rep-closed")).toMatchObject({
      maintenance_event_uuid: R2,
      resolved_at: "2026-10-02T10:00:00Z",
    });
    expect(report("rep-deleted")).toMatchObject({ maintenance_event_uuid: null });
    expect(report("rep-b2")).toMatchObject({ maintenance_event_uuid: null });
    expect(one(`select count(*) as n from "MaintenanceLineItems"`).n).toBe(1);
    expect(fake.stats.writeTransactions).toBe(1);
  });

  it("a New repair's statements: a row for each bleacher, the zone and the links", async () => {
    seedReports();
    const insertRepair = db
      .insertInto("MaintenanceEvents")
      .values({
        id: R3,
        status: "inbound",
        event_start: "2026-11-01",
        event_end: "2026-11-05",
        deleted: 0,
      } as any)
      .compile();
    const refusal = await writeRepairChanges(
      input([insertRepair, serviceInsert("s1", R3, "b1"), serviceInsert("s2", R3, "b2")], {
        repairId: R3,
        checkedBleacherUuids: ["b1", "b2"],
      }),
    );
    expect(refusal).toBeNull();
    expect(junction(R3)).toEqual([
      { bleacher_uuid: "b1", created_at: NOW },
      { bleacher_uuid: "b2", created_at: NOW },
    ]);
    expect(zoneOf(R3)).toBe("z1");
    expect(report("rep-free").maintenance_event_uuid).toBe(R3);
    expect(report("rep-b2").maintenance_event_uuid).toBe(R3);
    expect(report("rep-elsewhere").maintenance_event_uuid).toBe(R2);
  });

  it("a second service on a bleacher that already has one changes nothing around it (D182)", async () => {
    sqlite.exec(`
      insert into "MaintenanceLineItems" (id, maintenance_event_uuid, bleacher_uuid, created_at, deleted)
        values ('s1', '${R1}', 'b1', '2026-11-01T10:00:00Z', 0);
      insert into "BleacherMaintEvents" values ('j1', 'b1', '${R1}', 'x');
      update "MaintenanceEvents" set zone_uuid = 'z1' where id = '${R1}';
    `);
    seedReports();
    await writeRepairChanges(
      input([serviceInsert("s2", R1, "b1")], { checkedBleacherUuids: ["b1"] }),
    );
    expect(junction()).toHaveLength(1);
    expect(zoneOf()).toBe("z1");
    expect(report("rep-free").maintenance_event_uuid).toBeNull();
  });

  it("a move: the new bleacher is gained (row, links), the old one lost (row removed, its links removed); the zone stays", async () => {
    sqlite.exec(`
      insert into "MaintenanceLineItems" (id, maintenance_event_uuid, bleacher_uuid, created_at, deleted)
        values ('s1', '${R1}', 'b1', '2026-11-01T10:00:00Z', 0);
      insert into "BleacherMaintEvents" values ('j1', 'b1', '${R1}', 'x');
      update "MaintenanceEvents" set zone_uuid = 'z1' where id = '${R1}';
    `);
    seedReports();
    sqlite.exec(
      `update "DamageReports" set maintenance_event_uuid = '${R1}' where id = 'rep-free';`,
    );
    const move = db
      .updateTable("MaintenanceLineItems")
      .set({ bleacher_uuid: "b2" } as any)
      .where("id", "=", "s1")
      .compile();
    const refusal = await writeRepairChanges(input([move], { checkedBleacherUuids: ["b2"] }));
    expect(refusal).toBeNull();
    expect(junction()).toEqual([{ bleacher_uuid: "b2", created_at: NOW }]);
    expect(zoneOf()).toBe("z1");
    expect(report("rep-free").maintenance_event_uuid).toBeNull();
    expect(report("rep-b2").maintenance_event_uuid).toBe(R1);
    // A closed report linked elsewhere is never touched.
    expect(report("rep-closed")).toMatchObject({ maintenance_event_uuid: R2 });
  });

  it("deleting the last service: the row is removed, the links are removed, the zone stays, closed reports are untouched", async () => {
    sqlite.exec(`
      insert into "MaintenanceLineItems" (id, maintenance_event_uuid, bleacher_uuid, created_at, deleted)
        values ('s1', '${R1}', 'b1', '2026-11-01T10:00:00Z', 0);
      insert into "BleacherMaintEvents" values ('j1', 'b1', '${R1}', 'x');
      update "MaintenanceEvents" set zone_uuid = 'z1' where id = '${R1}';
    `);
    seedReports();
    sqlite.exec(`
      update "DamageReports" set maintenance_event_uuid = '${R1}' where id in ('rep-free', 'rep-closed');
    `);
    const del = db
      .updateTable("MaintenanceLineItems")
      .set({ deleted: 1 } as any)
      .where("id", "=", "s1")
      .compile();
    expect(await writeRepairChanges(input([del]))).toBeNull();
    expect(junction()).toEqual([]);
    expect(zoneOf()).toBe("z1");
    expect(report("rep-free").maintenance_event_uuid).toBeNull();
    expect(report("rep-closed")).toMatchObject({
      maintenance_event_uuid: R1,
      resolved_at: "2026-10-02T10:00:00Z",
    });
  });

  it("deleting one of two services on a bleacher changes nothing around it", async () => {
    sqlite.exec(`
      insert into "MaintenanceLineItems" (id, maintenance_event_uuid, bleacher_uuid, created_at, deleted) values
        ('s1', '${R1}', 'b1', '2026-11-01T10:00:00Z', 0),
        ('s2', '${R1}', 'b1', '2026-11-02T10:00:00Z', 0);
      insert into "BleacherMaintEvents" values ('j1', 'b1', '${R1}', 'x');
    `);
    const del = db
      .updateTable("MaintenanceLineItems")
      .set({ deleted: 1 } as any)
      .where("id", "=", "s1")
      .compile();
    await writeRepairChanges(input([del]));
    expect(junction()).toHaveLength(1);
  });

  it("a Completed repair: only the report created no later than event_end is linked and closed, with now as resolved_at (D181, D185)", async () => {
    sqlite.exec(`
      update "MaintenanceEvents" set status = 'completed', event_end = '2026-11-05' where id = '${R1}';
      insert into "BleacherMaintEvents" values ('j1', 'b1', '${R1}', 'x');
      insert into "DamageReports" values
        ('rep-before', 'b1', '2026-11-03T15:00:00Z', null, null, 0),
        ('rep-after', 'b1', '2026-11-10T15:00:00Z', null, null, 0);
    `);
    await writeRepairChanges(
      input([serviceInsert("s1", R1, "b1")], { checkedBleacherUuids: ["b1"] }),
    );
    expect(report("rep-before")).toMatchObject({ maintenance_event_uuid: R1, resolved_at: NOW });
    expect(report("rep-after")).toMatchObject({ maintenance_event_uuid: null, resolved_at: null });
  });

  it("a bleacher with no zone is allowed and sets no zone; a later bleacher with a zone sets it (D175)", async () => {
    await writeRepairChanges(
      input([serviceInsert("s1", R1, "b4")], { checkedBleacherUuids: ["b4"] }),
    );
    expect(zoneOf()).toBeNull();
    expect(junction()).toEqual([{ bleacher_uuid: "b4", created_at: NOW }]);
    await writeRepairChanges(
      input([serviceInsert("s2", R1, "b3")], { checkedBleacherUuids: ["b3"] }),
    );
    expect(zoneOf()).toBe("z2");
  });

  it("takes the zone a covering accepted sub-rental borrows (D171)", async () => {
    sqlite.exec(
      `insert into "SubrentalEvents" values ('sr', 'b1', 'accepted', 'z2', '2026-10-25', '2026-11-03');`,
    );
    await writeRepairChanges(
      input([serviceInsert("s1", R1, "b1")], { checkedBleacherUuids: ["b1"] }),
    );
    expect(zoneOf()).toBe("z2");
  });

  it("refuses a service in another zone than the stored one: the message comes back and nothing is written, the service included (D176)", async () => {
    sqlite.exec(`
      insert into "MaintenanceLineItems" (id, maintenance_event_uuid, bleacher_uuid, created_at, deleted)
        values ('s1', '${R1}', 'b1', '2026-11-01T10:00:00Z', 0);
      insert into "BleacherMaintEvents" values ('j1', 'b1', '${R1}', 'x');
      update "MaintenanceEvents" set zone_uuid = 'z1' where id = '${R1}';
    `);
    seedReports();
    const refusal = await writeRepairChanges(
      input([serviceInsert("s2", R1, "b3")], { checkedBleacherUuids: ["b3"] }),
    );
    expect(refusal).toEqual({
      message: "Bleacher #60 is in Zone 2 on 2026-11-01, but this repair is in Zone 1.",
    });
    expect(one(`select count(*) as n from "MaintenanceLineItems"`).n).toBe(1);
    expect(junction()).toEqual([{ bleacher_uuid: "b1", created_at: "x" }]);
    expect(report("rep-free").maintenance_event_uuid).toBeNull();
    expect(toastCustom).not.toHaveBeenCalled();
  });

  it("refuses two added services in two zones when nothing is stored, and writes nothing", async () => {
    const refusal = await writeRepairChanges(
      input([serviceInsert("s1", R1, "b1"), serviceInsert("s2", R1, "b3")], {
        checkedBleacherUuids: ["b1", "b3"],
      }),
    );
    expect(refusal?.message).toMatch(/^Bleacher #60 is in Zone 2/);
    expect(one(`select count(*) as n from "MaintenanceLineItems"`).n).toBe(0);
    expect(junction()).toEqual([]);
    expect(zoneOf()).toBeNull();
  });

  it("runs the statements as one batch with no read when no service is affected", async () => {
    const note = db
      .updateTable("MaintenanceEvents")
      .set({ notes: "x" } as any)
      .where("id", "=", R1)
      .compile();
    expect(await writeRepairChanges(input([note], { servicesAffected: false }))).toBeNull();
    expect(fake.stats.reads).toBe(0);
    expect(fake.stats.statements).toBe(1);
    expect(fake.stats.writeTransactions).toBe(1);
    expect(one(`select notes from "MaintenanceEvents" where id = ?`, R1).notes).toBe("x");
  });

  it("shows the red toast with the message and the error text, and rejects, when a write fails; nothing is kept", async () => {
    const broken = db
      .insertInto("NoSuchTable" as any)
      .values({ id: "x" } as any)
      .compile();
    await expect(
      writeRepairChanges(input([serviceInsert("s1", R1, "b1"), broken])),
    ).rejects.toThrow();
    expect(toastCustom).toHaveBeenCalledTimes(1);
    const lines = toastLines();
    expect(lines[0]).toBe("Failed to save the repair.");
    expect(lines.join(" ")).toMatch(/NoSuchTable/);
    expect(one(`select count(*) as n from "MaintenanceLineItems"`).n).toBe(0);
  });
});

describe("findServiceZoneConflict (the check of a draft's service window, D176)", () => {
  it("a new repair: the other live bleachers of the draft are the context", async () => {
    const message = await findServiceZoneConflict({
      repairId: null,
      bleacherUuid: "b3",
      eventStart: null,
      otherLiveBleacherUuids: ["b1"],
    });
    expect(message).toBe("Bleacher #60 is in Zone 2, but this repair is in Zone 1.");
  });

  it("compatible bleachers give null", async () => {
    expect(
      await findServiceZoneConflict({
        repairId: null,
        bleacherUuid: "b2",
        eventStart: null,
        otherLiveBleacherUuids: ["b1"],
      }),
    ).toBeNull();
    expect(
      await findServiceZoneConflict({
        repairId: null,
        bleacherUuid: "b3",
        eventStart: null,
        otherLiveBleacherUuids: [],
      }),
    ).toBeNull();
  });

  it("a stored zone that differs", async () => {
    sqlite.exec(`update "MaintenanceEvents" set zone_uuid = 'z1' where id = '${R1}';`);
    const message = await findServiceZoneConflict({
      repairId: R1,
      bleacherUuid: "b3",
      eventStart: "2026-11-01",
      otherLiveBleacherUuids: [],
    });
    expect(message).toBe("Bleacher #60 is in Zone 2 on 2026-11-01, but this repair is in Zone 1.");
  });

  it("with no day only the own zones count, with a day a covering sub-rental counts", async () => {
    sqlite.exec(
      `insert into "SubrentalEvents" values ('sr', 'b2', 'accepted', 'z2', '2026-10-25', '2026-11-03');`,
    );
    const base = { repairId: null, bleacherUuid: "b2", otherLiveBleacherUuids: ["b1"] };
    expect(await findServiceZoneConflict({ ...base, eventStart: null })).toBeNull();
    expect(await findServiceZoneConflict({ ...base, eventStart: "2026-11-01" })).toMatch(
      /^Bleacher #53 is in Zone 2 on 2026-11-01, but this repair is in Zone 1\.$/,
    );
  });
});
