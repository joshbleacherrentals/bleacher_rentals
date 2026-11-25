import React from "react";
import type { CompiledQuery } from "kysely";
import type { Transaction } from "@powersync/web";
import { toast } from "sonner";
import { ErrorToast } from "@/components/toasts/ErrorToast";
import { db } from "@/components/providers/SystemProvider";
import {
  typedExecuteBatch,
  typedGetAll,
  typedWriteTransaction,
  expect,
} from "@/lib/powersync/typedQuery";
import {
  gainsAndLosses,
  judgeZones,
  planRepairLinks,
  zoneConflictMessage,
  zoneOnDay,
  type LinkPlan,
  type OpenReportForLink,
  type ServiceZoneCheck,
} from "../utils/repairLinks";

/**
 * What a write of services does to the repair around it: the reads, the statements and the runner.
 * The junction `BleacherMaintEvents`, the repair's zone and the link of the open damage reports are
 * written in the same local transaction as the services, in the order of D184. The rules are in
 * `../utils/repairLinks.ts`. docs/specs/repairs-09b2-bleachers-zone-reports.md §2.1 and §3 (D169 to
 * D186; the signatures here are locked by that spec).
 *
 * No read uses `db.fn`: the app's `db` is a bound proxy that strips its helper methods.
 */

// ── The reads ────────────────────────────────────────────────────────────────────────────────

export type RawLiveServiceRow = { bleacherUuid: string | null };
/** The bleachers of the repair's services that are not deleted, oldest service first. */
export function buildLiveServiceBleachersQuery(repairId: string): CompiledQuery<RawLiveServiceRow> {
  return db
    .selectFrom("MaintenanceLineItems as li")
    .select(["li.bleacher_uuid as bleacherUuid"])
    .where("li.maintenance_event_uuid", "=", repairId)
    .where("li.deleted", "=", 0)
    .orderBy("li.created_at")
    .orderBy("li.id")
    .compile();
}

export type RawRepairFactsRow = {
  status: string | null;
  eventStart: string | null;
  eventEnd: string | null;
  zoneUuid: string | null;
};
export function buildRepairFactsQuery(repairId: string): CompiledQuery<RawRepairFactsRow> {
  return db
    .selectFrom("MaintenanceEvents as me")
    .select([
      "me.status as status",
      "me.event_start as eventStart",
      "me.event_end as eventEnd",
      "me.zone_uuid as zoneUuid",
    ])
    .where("me.id", "=", repairId)
    .compile();
}

export type RawJunctionRow = { id: string; bleacherUuid: string | null };
export function buildJunctionRowsQuery(repairId: string): CompiledQuery<RawJunctionRow> {
  return db
    .selectFrom("BleacherMaintEvents as bme")
    .select(["bme.id as id", "bme.bleacher_uuid as bleacherUuid"])
    .where("bme.maintenance_event_uuid", "=", repairId)
    .compile();
}

export type RawBleacherZoneRow = {
  bleacherUuid: string;
  bleacherNumber: number | null;
  zoneUuid: string | null;
};
export function buildBleacherZonesQuery(
  bleacherUuids: readonly string[],
): CompiledQuery<RawBleacherZoneRow> {
  return db
    .selectFrom("Bleachers as b")
    .select([
      "b.id as bleacherUuid",
      "b.bleacher_number as bleacherNumber",
      "b.zone_uuid as zoneUuid",
    ])
    .where("b.id", "in", [...bleacherUuids])
    .orderBy("b.id")
    .compile();
}

export type RawCoveringSubrentalRow = { bleacherUuid: string | null; zoneUuid: string | null };
/** Accepted sub-rentals of these bleachers whose days include `day`. */
export function buildCoveringSubrentalsQuery(
  bleacherUuids: readonly string[],
  day: string,
): CompiledQuery<RawCoveringSubrentalRow> {
  return db
    .selectFrom("SubrentalEvents as sr")
    .select(["sr.bleacher_uuid as bleacherUuid", "sr.requested_zone_uuid as zoneUuid"])
    .where("sr.status", "=", "accepted")
    .where("sr.bleacher_uuid", "in", [...bleacherUuids])
    .where("sr.event_start", "<=", day)
    .where("sr.event_end", ">=", day)
    .orderBy("sr.id")
    .compile();
}

export type RawOpenReportRow = {
  id: string;
  bleacherUuid: string | null;
  createdAt: string | null;
  repairId: string | null;
};
/** The open reports (not closed, not deleted) of these bleachers. */
export function buildOpenReportsQuery(
  bleacherUuids: readonly string[],
): CompiledQuery<RawOpenReportRow> {
  return db
    .selectFrom("DamageReports as dr")
    .select([
      "dr.id as id",
      "dr.bleacher_uuid as bleacherUuid",
      "dr.created_at as createdAt",
      "dr.maintenance_event_uuid as repairId",
    ])
    .where("dr.bleacher_uuid", "in", [...bleacherUuids])
    .where("dr.deleted", "=", 0)
    .where("dr.resolved_at", "is", null)
    .orderBy("dr.created_at")
    .orderBy("dr.id")
    .compile();
}

export type RawZoneNameRow = { id: string; name: string | null };
export function buildZoneNamesQuery(zoneUuids: readonly string[]): CompiledQuery<RawZoneNameRow> {
  return db
    .selectFrom("Zones as z")
    .select(["z.id as id", "z.display_name as name"])
    .where("z.id", "in", [...zoneUuids])
    .compile();
}

// ── The statements of a plan ─────────────────────────────────────────────────────────────────

/**
 * The statements of a plan, in the order of D184: the junction rows removed, the junction rows
 * inserted (a new uuid, `created_at` = `now`), the zone, the links removed, the links, the closings
 * (`resolved_at` = `now`, guard `resolved_at IS NULL`). Empty for an empty plan.
 */
export function buildLinkStatements(
  plan: LinkPlan,
  input: { repairId: string; now: string },
): CompiledQuery[] {
  const { repairId, now } = input;
  const statements: CompiledQuery[] = [];

  if (plan.junctionDeleteBleachers.length > 0) {
    statements.push(
      db
        .deleteFrom("BleacherMaintEvents")
        .where("maintenance_event_uuid", "=", repairId)
        .where("bleacher_uuid", "in", plan.junctionDeleteBleachers)
        .compile(),
    );
  }

  for (const bleacherUuid of plan.junctionInsertBleachers) {
    statements.push(
      db
        .insertInto("BleacherMaintEvents")
        .values({
          id: crypto.randomUUID(),
          bleacher_uuid: bleacherUuid,
          maintenance_event_uuid: repairId,
          created_at: now,
        })
        .compile(),
    );
  }

  // The zone is written only while it is empty (D172); the guard keeps that true on the device too.
  if (plan.zoneToWrite) {
    statements.push(
      db
        .updateTable("MaintenanceEvents")
        .set({ zone_uuid: plan.zoneToWrite })
        .where("id", "=", repairId)
        .where("zone_uuid", "is", null)
        .compile(),
    );
  }

  if (plan.unlinkBleachers.length > 0) {
    statements.push(
      db
        .updateTable("DamageReports")
        .set({ maintenance_event_uuid: null })
        .where("maintenance_event_uuid", "=", repairId)
        .where("bleacher_uuid", "in", plan.unlinkBleachers)
        .where("resolved_at", "is", null)
        .compile(),
    );
  }

  if (plan.linkReportIds.length > 0) {
    statements.push(
      db
        .updateTable("DamageReports")
        .set({ maintenance_event_uuid: repairId })
        .where("id", "in", plan.linkReportIds)
        .where("resolved_at", "is", null)
        .where("maintenance_event_uuid", "is", null)
        .compile(),
    );
  }

  if (plan.closeReportIds.length > 0) {
    statements.push(
      db
        .updateTable("DamageReports")
        .set({ maintenance_event_uuid: repairId, resolved_at: now })
        .where("id", "in", plan.closeReportIds)
        .where("resolved_at", "is", null)
        .where("maintenance_event_uuid", "is", null)
        .compile(),
    );
  }

  return statements;
}

// ── The runner ───────────────────────────────────────────────────────────────────────────────

/** Runs a read inside a transaction (`tx.getAll`) or on the local database (`typedGetAll`). */
type Reader = <T>(query: CompiledQuery<T>) => Promise<T[]>;

const inTransaction =
  (tx: Transaction): Reader =>
  (query) =>
    tx.getAll(query.sql, query.parameters as any[]);

const onDatabase: Reader = (query) =>
  typedGetAll(query as CompiledQuery<any>, expect<any>()) as Promise<any[]>;

function nonEmpty(values: readonly (string | null)[]): string[] {
  return values.filter((value): value is string => !!value);
}

function distinct(values: readonly string[]): string[] {
  return [...new Set(values)];
}

/** The zone of each bleacher on `day` (own zones only when `day` is null), and its number. */
async function readZoneFacts(
  read: Reader,
  bleacherUuids: readonly string[],
  day: string | null,
): Promise<{ zones: Map<string, string | null>; numbers: Map<string, number | null> }> {
  const zones = new Map<string, string | null>();
  const numbers = new Map<string, number | null>();
  if (bleacherUuids.length === 0) return { zones, numbers };

  const bleachers = await read(buildBleacherZonesQuery(bleacherUuids));
  const covering = day ? await read(buildCoveringSubrentalsQuery(bleacherUuids, day)) : [];
  const coverBy = new Map<string, (string | null)[]>();
  for (const row of covering) {
    if (!row.bleacherUuid) continue;
    const list = coverBy.get(row.bleacherUuid) ?? [];
    list.push(row.zoneUuid);
    coverBy.set(row.bleacherUuid, list);
  }

  for (const row of bleachers) {
    numbers.set(row.bleacherUuid, row.bleacherNumber);
    zones.set(
      row.bleacherUuid,
      zoneOnDay({
        bleacherUuid: row.bleacherUuid,
        ownZoneUuid: row.zoneUuid,
        coveringZones: coverBy.get(row.bleacherUuid) ?? [],
      }),
    );
  }
  // A bleacher that is not in the table has no zone.
  for (const uuid of bleacherUuids) {
    if (!zones.has(uuid)) zones.set(uuid, null);
  }
  return { zones, numbers };
}

/** The text of a refusal, with the names of the two zones and the number of the bleacher. */
async function refusalMessage(
  read: Reader,
  verdict: { bleacherUuid: string; bleacherZoneUuid: string; repairZoneUuid: string },
  numbers: ReadonlyMap<string, number | null>,
  day: string | null,
): Promise<string> {
  const names = new Map<string, string | null>();
  for (const row of await read(
    buildZoneNamesQuery([verdict.bleacherZoneUuid, verdict.repairZoneUuid]),
  )) {
    names.set(row.id, row.name);
  }
  return zoneConflictMessage({
    bleacherNumber: numbers.get(verdict.bleacherUuid) ?? null,
    bleacherZoneName: names.get(verdict.bleacherZoneUuid) ?? null,
    repairZoneName: names.get(verdict.repairZoneUuid) ?? null,
    day,
  });
}

/** Thrown inside the transaction to roll it back; the runner turns it into a refusal. */
class ZoneRefusal extends Error {}

function showErrorToast(lines: string[]) {
  toast.custom(
    (t) =>
      React.createElement(ErrorToast, {
        id: t,
        lines,
      }),
    { duration: 10000 },
  );
}

export type WriteRepairChangesInput = {
  repairId: string;
  /** The action's own statements, already in the order of 09a and 09b1 (D184). */
  statements: readonly CompiledQuery[];
  /** False: the statements are run as one batch with no read (§0, "A write that changes no service"). */
  servicesAffected: boolean;
  checkedBleacherUuids: readonly string[];
  now: string; // one reading of the clock for the whole write
  timezone: string;
  failedMessage: string; // the red toast on a failed local write
  /**
   * The free reports of a Completed repair that the person chose to close (08a D245, D246); none when
   * nobody was asked. Only the ones the plan offers (D179, D185) are closed.
   */
  closeFreeIds?: readonly string[];
};

/**
 * §2.1. Null when written; `{ message }` when the zone check refused and nothing was written. A
 * failed write shows the red toast `failedMessage` with the error text and is thrown again.
 */
export async function writeRepairChanges(
  input: WriteRepairChangesInput,
): Promise<{ message: string } | null> {
  const { repairId, statements, servicesAffected, checkedBleacherUuids, now, timezone } = input;
  const closeFreeIds = input.closeFreeIds ?? [];

  try {
    if (!servicesAffected) {
      await typedExecuteBatch([...statements]);
      return null;
    }

    await typedWriteTransaction(async (tx) => {
      const read = inTransaction(tx);
      const run = async (statement: CompiledQuery) => {
        await tx.execute(statement.sql, statement.parameters as any[]);
      };

      // 1. Before: the bleachers of the live services.
      const before = nonEmpty(
        (await read(buildLiveServiceBleachersQuery(repairId))).map((r) => r.bleacherUuid),
      );

      // 2. The action's own statements, in their order.
      for (const statement of statements) await run(statement);

      // 3. After: the repair, its live services and its junction rows.
      const [facts] = await read(buildRepairFactsQuery(repairId));
      if (!facts) return;
      const after = nonEmpty(
        (await read(buildLiveServiceBleachersQuery(repairId))).map((r) => r.bleacherUuid),
      );
      const junction = (await read(buildJunctionRowsQuery(repairId)))
        .filter((row) => !!row.bleacherUuid)
        .map((row) => ({ id: row.id, bleacherUuid: row.bleacherUuid as string }));
      const day = facts.eventStart || null;
      const storedZoneUuid = facts.zoneUuid || null;

      // 4. The zone verdict: a refusal rolls the whole transaction back.
      const { zones, numbers } = await readZoneFacts(
        read,
        distinct([...after, ...checkedBleacherUuids]),
        day,
      );
      const verdict = judgeZones({
        storedZoneUuid,
        liveBleacherUuids: after,
        checkedBleacherUuids,
        zones,
      });
      if (!verdict.ok) throw new ZoneRefusal(await refusalMessage(read, verdict, numbers, day));

      // 5. Gains and losses, and the open reports of the bleachers that gained a service.
      const { gained, lost } = gainsAndLosses(before, after);
      const openReports: OpenReportForLink[] =
        gained.length === 0
          ? []
          : (await read(buildOpenReportsQuery(gained)))
              .filter((row) => !!row.bleacherUuid)
              .map((row) => ({
                id: row.id,
                bleacherUuid: row.bleacherUuid as string,
                createdAt: row.createdAt ?? "",
                repairId: row.repairId,
              }));

      // 6. The plan and its statements (D184).
      const plan = planRepairLinks({
        repair: {
          id: repairId,
          status: facts.status ?? "inbound",
          eventEnd: facts.eventEnd || null,
          zoneUuid: storedZoneUuid,
        },
        gained,
        lost,
        junction,
        openReports,
        zoneToStore: verdict.zoneToStore,
        timezone,
        closeFreeIds,
      });
      for (const statement of buildLinkStatements(plan, { repairId, now })) await run(statement);
    });
    return null;
  } catch (e) {
    if (e instanceof ZoneRefusal) return { message: e.message };
    showErrorToast([input.failedMessage, String(e)]);
    throw e;
  }
}

/**
 * The check of a draft's service window (§2.3): reads the repair's stored zone (none for a new
 * repair, `repairId` null), the zones on `eventStart`, and returns the refusal text or null.
 */
export async function findServiceZoneConflict(
  input: { repairId: string | null } & Parameters<ServiceZoneCheck>[0],
): Promise<string | null> {
  const { repairId, bleacherUuid, eventStart, otherLiveBleacherUuids } = input;
  const day = eventStart || null;

  let storedZoneUuid: string | null = null;
  if (repairId) {
    const [facts] = await onDatabase(buildRepairFactsQuery(repairId));
    storedZoneUuid = facts?.zoneUuid || null;
  }

  const live = [...otherLiveBleacherUuids, bleacherUuid];
  const { zones, numbers } = await readZoneFacts(onDatabase, distinct(live), day);
  const verdict = judgeZones({
    storedZoneUuid,
    liveBleacherUuids: live,
    checkedBleacherUuids: [bleacherUuid],
    zones,
  });
  if (verdict.ok) return null;
  return refusalMessage(onDatabase, verdict, numbers, day);
}
