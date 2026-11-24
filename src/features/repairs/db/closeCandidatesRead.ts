import type { CompiledQuery } from "kysely";
import { db } from "@/components/providers/SystemProvider";
import { effectiveColumnDamage } from "@/lib/damageReportSeverity";
import { expect, typedGetAll } from "@/lib/powersync/typedQuery";
import {
  asksOnStatusChange,
  offeredFreeReports,
  type CloseCandidate,
  type CloseGroup,
} from "../utils/closeReports";
import { dayInZone } from "../utils/dayInZone";
import { gainsAndLosses } from "../utils/repairLinks";

/**
 * The reads of the dialog that asks which damage reports to close: the open reports linked to the
 * repair (the status path, D240) and the open free reports of the bleachers a write gives their first
 * service (a Completed repair, D245 and D246). Both are local reads, made once when the person acts.
 * docs/specs/repairs-08a-choose-reports-to-close.md §2.3 and §3.
 *
 * No read uses `db.fn`: the app's `db` is a bound proxy that strips its helper methods.
 */

export type RawCloseCandidateRow = {
  id: string;
  bleacherUuid: string | null;
  bleacherNumber: number | null;
  createdAt: string | null;
  repairId: string | null;
  seatDamage: string | null;
  haulDamage: string | null;
  isSafeToSit: number | null;
  isSafeToHaul: number | null;
  note: string | null;
  creatorFirstName: string | null;
  creatorLastName: string | null;
};

function reportsQuery() {
  return db
    .selectFrom("DamageReports as dr")
    .leftJoin("Bleachers as b", "b.id", "dr.bleacher_uuid")
    .leftJoin("Users as u", "u.id", "dr.created_by_user_uuid")
    .select([
      "dr.id as id",
      "dr.bleacher_uuid as bleacherUuid",
      "b.bleacher_number as bleacherNumber",
      "dr.created_at as createdAt",
      "dr.maintenance_event_uuid as repairId",
      "dr.seat_damage as seatDamage",
      "dr.haul_damage as haulDamage",
      "dr.is_safe_to_sit as isSafeToSit",
      "dr.is_safe_to_haul as isSafeToHaul",
      "dr.note as note",
      "u.first_name as creatorFirstName",
      "u.last_name as creatorLastName",
    ])
    .where("dr.deleted", "=", 0)
    .where("dr.resolved_at", "is", null);
}

/** Open (`resolved_at` empty), not deleted reports with `maintenance_event_uuid` = the repair, earliest first. */
export function buildLinkedOpenReportsQuery(repairId: string): CompiledQuery<RawCloseCandidateRow> {
  return reportsQuery()
    .where("dr.maintenance_event_uuid", "=", repairId)
    .orderBy("dr.created_at")
    .orderBy("dr.id")
    .compile();
}

/** Open, not deleted reports of these bleachers, linked or not, earliest first. */
export function buildBleacherOpenReportsQuery(
  bleacherUuids: readonly string[],
): CompiledQuery<RawCloseCandidateRow> {
  return reportsQuery()
    .where("dr.bleacher_uuid", "in", [...bleacherUuids])
    .orderBy("dr.created_at")
    .orderBy("dr.id")
    .compile();
}

export type CloseCandidatesInput = {
  repairId: string | null; // null: a New repair
  fromStatus: string | null; // the status the list shows now; null for a New repair
  toStatus: string; // the status after the write
  eventEnd: string | null; // Repair to after the write
  bleachersBefore: readonly string[]; // one per live service now; empty for a New repair
  bleachersAfter: readonly string[]; // one per live service after the write; empty when no service is written
  timezone: string;
};

const fullName = (first: string | null, last: string | null) =>
  [first, last]
    .map((part) => part?.trim())
    .filter(Boolean)
    .join(" ");

function toCandidate(
  row: RawCloseCandidateRow,
  group: CloseGroup,
  timezone: string,
): CloseCandidate {
  return {
    id: row.id,
    group,
    bleacherNumber: row.bleacherNumber,
    day: dayInZone(row.createdAt, timezone) ?? "",
    createdBy: fullName(row.creatorFirstName, row.creatorLastName) || null,
    seat: effectiveColumnDamage(row.seatDamage, row.isSafeToSit),
    haul: effectiveColumnDamage(row.haulDamage, row.isSafeToHaul),
    note: row.note,
  };
}

/**
 * The reports the person is asked about (§2.1), linked group first. Two local reads at most
 * (`typedGetAll`); an empty list when nobody is asked: a move that is not into Completed, a repair
 * with no open linked report, a Completed write that gives no bleacher its first service.
 */
export async function readCloseCandidates(input: CloseCandidatesInput): Promise<CloseCandidate[]> {
  const { repairId, fromStatus, toStatus, eventEnd, bleachersBefore, bleachersAfter, timezone } =
    input;
  const candidates: CloseCandidate[] = [];

  if (repairId && fromStatus !== null && asksOnStatusChange(fromStatus, toStatus)) {
    const rows = await typedGetAll(
      buildLinkedOpenReportsQuery(repairId),
      expect<RawCloseCandidateRow>(),
    );
    candidates.push(...rows.map((row) => toCandidate(row, "linked", timezone)));
  }

  const { gained } = gainsAndLosses(bleachersBefore, bleachersAfter);
  if (toStatus === "completed" && eventEnd && gained.length > 0) {
    const rows = await typedGetAll(
      buildBleacherOpenReportsQuery(gained),
      expect<RawCloseCandidateRow>(),
    );
    const offered = new Set(
      offeredFreeReports({
        openReports: rows
          .filter((row) => !!row.bleacherUuid)
          .map((row) => ({
            id: row.id,
            bleacherUuid: row.bleacherUuid as string,
            createdAt: row.createdAt ?? "",
            repairId: row.repairId,
          })),
        gained,
        eventEnd,
        timezone,
      }).map((report) => report.id),
    );
    candidates.push(
      ...rows.filter((row) => offered.has(row.id)).map((row) => toCandidate(row, "free", timezone)),
    );
  }

  return candidates;
}
