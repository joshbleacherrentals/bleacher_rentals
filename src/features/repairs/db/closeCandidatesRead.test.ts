import { beforeEach, describe, expect, it, vi } from "vitest";
import { DatabaseSync, type SQLInputValue } from "node:sqlite";
import {
  createFakePowerSyncDb,
  type FakePowerSyncDb,
} from "@/lib/powersync/testing/fakePowerSyncDb";

// docs/specs/repairs-08a-choose-reports-to-close.md §2.1, §2.3, §3 and §7 (D240 to D249). The two
// reads compile with the app's Kysely and run on an in-memory SQLite shaped like the local PowerSync
// database, through the real `typedQuery` helpers over `createFakePowerSyncDb`.

const { holder } = vi.hoisted(() => ({ holder: { current: null as unknown } }));

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

import {
  buildBleacherOpenReportsQuery,
  buildLinkedOpenReportsQuery,
  readCloseCandidates,
  type CloseCandidatesInput,
} from "./closeCandidatesRead";

const R1 = "r0000000-0000-4000-8000-000000000001";
const R2 = "r0000000-0000-4000-8000-000000000002";
const TZ = "America/Toronto";

let sqlite: DatabaseSync;
let fake: FakePowerSyncDb;

const all = (sql: string, ...params: SQLInputValue[]) =>
  sqlite.prepare(sql).all(...params) as any[];

beforeEach(() => {
  sqlite = new DatabaseSync(":memory:");
  sqlite.exec(`
    create table "DamageReports" (
      id text primary key, bleacher_uuid text, created_at text, resolved_at text,
      maintenance_event_uuid text, deleted integer, seat_damage text, haul_damage text,
      is_safe_to_sit integer, is_safe_to_haul integer, note text, created_by_user_uuid text
    );
    create table "Bleachers" (id text primary key, bleacher_number integer);
    create table "Users" (id text primary key, first_name text, last_name text);
    insert into "Bleachers" values ('b1', 52), ('b2', 53), ('b3', 60);
    insert into "Users" values ('u1', 'Pat', 'Driver'), ('u2', null, null);
    insert into "DamageReports"
      (id, bleacher_uuid, created_at, resolved_at, maintenance_event_uuid, deleted, seat_damage,
       haul_damage, is_safe_to_sit, is_safe_to_haul, note, created_by_user_uuid) values
      ('linked-b', 'b1', '2026-11-04T15:00:00Z', null, '${R1}', 0, 'minor', 'none', 1, 1, 'Bent rail', 'u1'),
      ('linked-a', 'b1', '2026-11-02T15:00:00Z', null, '${R1}', 0, 'none', 'major', 1, 1, null, 'u2'),
      ('linked-closed', 'b1', '2026-11-01T15:00:00Z', '2026-11-03T10:00:00Z', '${R1}', 0, 'minor', 'none', 1, 1, null, 'u1'),
      ('linked-deleted', 'b1', '2026-11-03T15:00:00Z', null, '${R1}', 1, 'minor', 'none', 1, 1, null, 'u1'),
      ('linked-elsewhere', 'b1', '2026-11-03T16:00:00Z', null, '${R2}', 0, 'minor', 'none', 1, 1, null, 'u1'),
      ('free-early', 'b2', '2026-11-03T15:00:00Z', null, null, 0, 'none', 'none', 0, 1, 'Legacy flag', 'u1'),
      ('free-late', 'b2', '2026-11-20T15:00:00Z', null, null, 0, 'minor', 'none', 1, 1, null, 'u1'),
      ('free-b3', 'b3', '2026-11-03T15:00:00Z', null, null, 0, 'minor', 'none', 1, 1, null, 'u1'),
      ('free-deleted', 'b2', '2026-11-03T16:00:00Z', null, null, 1, 'minor', 'none', 1, 1, null, 'u1'),
      ('free-closed', 'b2', '2026-11-03T17:00:00Z', '2026-11-04T10:00:00Z', null, 0, 'minor', 'none', 1, 1, null, 'u1'),
      ('b2-here', 'b2', '2026-11-03T18:00:00Z', null, '${R1}', 0, 'minor', 'none', 1, 1, null, 'u1');
  `);
  fake = createFakePowerSyncDb(sqlite);
  holder.current = fake;
});

describe("the reads (what they return)", () => {
  it("linked: the open, not deleted reports linked to that repair, earliest first, with the names and the bleacher number", () => {
    const q = buildLinkedOpenReportsQuery(R1);
    const rows = all(q.sql, ...(q.parameters as SQLInputValue[]));
    expect(rows.map((r) => r.id)).toEqual(["linked-a", "b2-here", "linked-b"]);
    expect(rows[2]).toMatchObject({
      id: "linked-b",
      bleacherUuid: "b1",
      bleacherNumber: 52,
      createdAt: "2026-11-04T15:00:00Z",
      repairId: R1,
      seatDamage: "minor",
      haulDamage: "none",
      note: "Bent rail",
      creatorFirstName: "Pat",
      creatorLastName: "Driver",
    });
    expect(rows[0]).toMatchObject({ creatorFirstName: null, creatorLastName: null, note: null });
  });

  it("bleacher: the open, not deleted reports of those bleachers, linked or not", () => {
    const q = buildBleacherOpenReportsQuery(["b2"]);
    const rows = all(q.sql, ...(q.parameters as SQLInputValue[]));
    expect(rows.map((r) => r.id).sort()).toEqual(["b2-here", "free-early", "free-late"]);
  });
});

describe("readCloseCandidates", () => {
  const input = (over: Partial<CloseCandidatesInput> = {}): CloseCandidatesInput => ({
    repairId: R1,
    fromStatus: "in_repair",
    toStatus: "completed",
    eventEnd: "2026-11-10",
    bleachersBefore: [],
    bleachersAfter: [],
    timezone: TZ,
    ...over,
  });
  const ids = (list: { id: string }[]) => list.map((c) => c.id);

  it("a move into Completed asks about the linked reports only, earliest first, with the mapped fields (D240, D241)", async () => {
    const list = await readCloseCandidates(input());
    expect(ids(list)).toEqual(["linked-a", "b2-here", "linked-b"]);
    expect(list.every((c) => c.group === "linked")).toBe(true);
    expect(list[2]).toEqual({
      id: "linked-b",
      group: "linked",
      bleacherNumber: 52,
      day: "2026-11-04",
      createdBy: "Pat Driver",
      seat: "minor",
      haul: "none",
      note: "Bent rail",
    });
    expect(list[0]).toMatchObject({ createdBy: null, seat: "none", haul: "major", note: null });
  });

  it("reads the Reported day in the app time zone", async () => {
    sqlite.exec(
      `update "DamageReports" set created_at = '2026-11-05T03:30:00Z' where id = 'linked-b'`,
    );
    const toronto = await readCloseCandidates(input());
    expect(toronto.find((c) => c.id === "linked-b")?.day).toBe("2026-11-04");
    const utc = await readCloseCandidates(input({ timezone: "UTC" }));
    expect(utc.find((c) => c.id === "linked-b")?.day).toBe("2026-11-05");
  });

  it("a move out of Completed, between two other statuses or to the same status asks nothing (D249)", async () => {
    expect(
      await readCloseCandidates(input({ fromStatus: "completed", toStatus: "in_repair" })),
    ).toEqual([]);
    expect(
      await readCloseCandidates(input({ fromStatus: "inbound", toStatus: "triaged" })),
    ).toEqual([]);
    expect(
      await readCloseCandidates(input({ fromStatus: "completed", toStatus: "completed" })),
    ).toEqual([]);
  });

  it("a repair with no open linked report asks nothing (D249)", async () => {
    sqlite.exec(
      `update "DamageReports" set maintenance_event_uuid = null where maintenance_event_uuid = '${R1}'`,
    );
    expect(await readCloseCandidates(input())).toEqual([]);
  });

  it("a New repair as Completed asks about the free reports of the draft's bleachers, no later than Repair to (D245)", async () => {
    const list = await readCloseCandidates(
      input({ repairId: null, fromStatus: null, bleachersAfter: ["b2", "b3"] }),
    );
    expect(ids(list)).toEqual(["free-b3", "free-early"]);
    expect(list.every((c) => c.group === "free")).toBe(true);
    expect(ids(list)).not.toContain("free-late"); // created after Repair to
    expect(ids(list)).not.toContain("b2-here"); // linked to a repair
    // The legacy flag `is_safe_to_sit` = 0 counts as major when the column says none.
    expect(list.find((c) => c.id === "free-early")).toMatchObject({
      seat: "major",
      haul: "none",
      note: "Legacy flag",
      bleacherNumber: 53,
    });
  });

  it("a New repair that is not Completed asks nothing, whatever its services (09b2 links as before)", async () => {
    expect(
      await readCloseCandidates(
        input({ repairId: null, fromStatus: null, toStatus: "inbound", bleachersAfter: ["b2"] }),
      ),
    ).toEqual([]);
  });

  it("a Completed repair that gains a bleacher asks about its free reports only (D246)", async () => {
    const list = await readCloseCandidates(
      input({
        fromStatus: "completed",
        toStatus: "completed",
        bleachersBefore: ["b1"],
        bleachersAfter: ["b1", "b2"],
      }),
    );
    expect(ids(list)).toEqual(["free-early"]);
    expect(list[0].group).toBe("free");
  });

  it("a second service on a bleacher, or a service that is removed, is no gain: nothing is asked", async () => {
    expect(
      await readCloseCandidates(
        input({
          fromStatus: "completed",
          toStatus: "completed",
          bleachersBefore: ["b2"],
          bleachersAfter: ["b2", "b2"],
        }),
      ),
    ).toEqual([]);
    expect(
      await readCloseCandidates(
        input({
          fromStatus: "completed",
          toStatus: "completed",
          bleachersBefore: ["b2"],
          bleachersAfter: [],
        }),
      ),
    ).toEqual([]);
  });

  it("a Save into Completed that also gains a bleacher asks both groups; a free report linked to this repair stays in the linked group only (D248)", async () => {
    const list = await readCloseCandidates(input({ bleachersBefore: [], bleachersAfter: ["b2"] }));
    expect(list.filter((c) => c.group === "linked").map((c) => c.id)).toEqual([
      "linked-a",
      "b2-here",
      "linked-b",
    ]);
    expect(list.filter((c) => c.group === "free").map((c) => c.id)).toEqual(["free-early"]);
  });

  it("a gain on a repair that is not Completed after the write asks nothing", async () => {
    expect(
      await readCloseCandidates(
        input({ fromStatus: "inbound", toStatus: "in_repair", bleachersAfter: ["b2"] }),
      ),
    ).toEqual([]);
  });

  it("asks nothing, and reads nothing, when there is no Repair to for the free group", async () => {
    const list = await readCloseCandidates(
      input({ repairId: null, fromStatus: null, eventEnd: null, bleachersAfter: ["b2"] }),
    );
    expect(list).toEqual([]);
  });
});
