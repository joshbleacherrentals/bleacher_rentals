"use client";

import { useMemo } from "react";
import type { CompiledQuery } from "kysely";
import { db } from "@/components/providers/SystemProvider";
import { expect, typedExecute, useTypedQuery } from "@/lib/powersync/typedQuery";
import { effectiveColumnDamage } from "@/lib/damageReportSeverity";

export type DamageSeverity = "none" | "minor" | "major";

export type DamageReport = {
  id: string;
  bleacher_uuid: string;
  inspection_uuid: string | null;
  is_safe_to_sit: boolean;
  is_safe_to_haul: boolean;
  seat_damage: DamageSeverity;
  haul_damage: DamageSeverity;
  note: string | null;
  created_at: string;
  resolved_at: string | null;
  maintenance_event_uuid: string | null;
  created_by_user_uuid: string | null;
  deleted: boolean;
  photos_uploaded: boolean;
  /** A driver reported this damage fixed — a claim, not a resolve. */
  fixed_by_driver: boolean;
  fixed_at: string | null;
  fixed_by_user_uuid: string | null;
  fixed_by_user: { first_name: string; last_name: string } | null;
  bleacher: { bleacher_number: number } | null;
  maintenance_event: { event_name: string } | null;
  created_by_user: { first_name: string; last_name: string } | null;
  photos: { id: string; photo_path: string }[];
};

type ReportRow = {
  id: string;
  bleacher_uuid: string | null;
  inspection_uuid: string | null;
  is_safe_to_sit: number | null;
  is_safe_to_haul: number | null;
  seat_damage: string | null;
  haul_damage: string | null;
  note: string | null;
  created_at: string | null;
  resolved_at: string | null;
  maintenance_event_uuid: string | null;
  created_by_user_uuid: string | null;
  deleted: number | null;
  photos_uploaded: number | null;
  fixed_by_driver: number | null;
  fixed_at: string | null;
  fixed_by_user_uuid: string | null;
  fixed_first_name: string | null;
  fixed_last_name: string | null;
  bleacher_number: number | null;
  event_name: string | null;
  first_name: string | null;
  last_name: string | null;
};

/**
 * Builds the compiled DamageReports list query. Pulled out of the
 * useDamageReports hook so it can be unit-tested directly (compiled SQL/
 * params) without needing a React hook-testing harness.
 *
 * hideNotUploaded (default true) adds `dr.photos_uploaded = 1`, hiding
 * reports whose photo evidence is still mid-upload. Admins can flip it off
 * to see in-flight reports.
 */
export function buildDamageReportsQuery(params: {
  bleacherUuid: string | null;
  showDeleted: boolean;
  hideNotUploaded?: boolean;
}): CompiledQuery<ReportRow> {
  const { bleacherUuid, showDeleted, hideNotUploaded = true } = params;

  let q = db
    .selectFrom("DamageReports as dr")
    .leftJoin("Bleachers as b", "b.id", "dr.bleacher_uuid")
    .leftJoin("MaintenanceEvents as me", "me.id", "dr.maintenance_event_uuid")
    .leftJoin("Users as u", "u.id", "dr.created_by_user_uuid")
    // Whoever pressed Fixed is rarely whoever filed the report — the driver on
    // site is the one who fixed it — so this is a second join, not `u` reused.
    .leftJoin("Users as fu", "fu.id", "dr.fixed_by_user_uuid")
    .select([
      "dr.id",
      "dr.bleacher_uuid",
      "dr.inspection_uuid",
      "dr.is_safe_to_sit",
      "dr.is_safe_to_haul",
      "dr.seat_damage",
      "dr.haul_damage",
      "dr.note",
      "dr.created_at",
      "dr.resolved_at",
      "dr.maintenance_event_uuid",
      "dr.created_by_user_uuid",
      "dr.deleted",
      "dr.photos_uploaded",
      "dr.fixed_by_driver",
      "dr.fixed_at",
      "dr.fixed_by_user_uuid",
      "b.bleacher_number as bleacher_number",
      "me.event_name as event_name",
      "u.first_name as first_name",
      "u.last_name as last_name",
      "fu.first_name as fixed_first_name",
      "fu.last_name as fixed_last_name",
    ])
    .where("dr.deleted", "=", showDeleted ? 1 : 0);

  if (bleacherUuid) q = q.where("dr.bleacher_uuid", "=", bleacherUuid);
  if (hideNotUploaded) q = q.where("dr.photos_uploaded", "=", 1);

  return q.orderBy("dr.created_at", "desc").compile() as unknown as CompiledQuery<ReportRow>;
}

type PhotoRow = { id: string; damage_report_uuid: string | null; photo_path: string | null };

/**
 * Reactive list of damage reports (PowerSync). Joins bleacher, maintenance
 * event and creator; photos are read separately and grouped in JS since
 * PowerSync/SQLite can't aggregate a one-to-many into the row.
 */
export function useDamageReports(params: {
  bleacherUuid: string | null;
  showDeleted: boolean;
  hideNotUploaded?: boolean;
}): {
  reports: DamageReport[];
  isLoading: boolean;
} {
  const { bleacherUuid, showDeleted, hideNotUploaded = true } = params;

  const compiled = useMemo(
    () => buildDamageReportsQuery({ bleacherUuid, showDeleted, hideNotUploaded }),
    [bleacherUuid, showDeleted, hideNotUploaded],
  );

  const { data: rows } = useTypedQuery(compiled, expect<ReportRow>());

  const photosCompiled = useMemo(
    () =>
      db
        .selectFrom("DamageReportPhotos as p")
        .select(["p.id", "p.damage_report_uuid", "p.photo_path"])
        .compile(),
    [],
  );
  const { data: photoRows } = useTypedQuery(photosCompiled, expect<PhotoRow>());

  const reports = useMemo(() => {
    const photosByReport = new Map<string, { id: string; photo_path: string }[]>();
    for (const p of photoRows ?? []) {
      if (!p.damage_report_uuid || !p.photo_path) continue;
      const list = photosByReport.get(p.damage_report_uuid) ?? [];
      list.push({ id: p.id, photo_path: p.photo_path });
      photosByReport.set(p.damage_report_uuid, list);
    }

    return (rows ?? []).map(
      (r): DamageReport => ({
        id: r.id,
        bleacher_uuid: r.bleacher_uuid ?? "",
        inspection_uuid: r.inspection_uuid,
        is_safe_to_sit: !!r.is_safe_to_sit,
        is_safe_to_haul: !!r.is_safe_to_haul,
        seat_damage: effectiveColumnDamage(r.seat_damage, r.is_safe_to_sit),
        haul_damage: effectiveColumnDamage(r.haul_damage, r.is_safe_to_haul),
        note: r.note,
        created_at: r.created_at ?? "",
        resolved_at: r.resolved_at,
        maintenance_event_uuid: r.maintenance_event_uuid,
        created_by_user_uuid: r.created_by_user_uuid,
        deleted: !!r.deleted,
        photos_uploaded: !!r.photos_uploaded,
        fixed_by_driver: !!r.fixed_by_driver,
        fixed_at: r.fixed_at,
        fixed_by_user_uuid: r.fixed_by_user_uuid,
        fixed_by_user:
          r.fixed_first_name || r.fixed_last_name
            ? {
                first_name: r.fixed_first_name ?? "",
                last_name: r.fixed_last_name ?? "",
              }
            : null,
        bleacher: r.bleacher_number != null ? { bleacher_number: r.bleacher_number } : null,
        maintenance_event: r.event_name ? { event_name: r.event_name } : null,
        created_by_user:
          r.first_name || r.last_name
            ? { first_name: r.first_name ?? "", last_name: r.last_name ?? "" }
            : null,
        photos: photosByReport.get(r.id) ?? [],
      }),
    );
  }, [rows, photoRows]);

  return { reports, isLoading: rows === undefined };
}

/** Reactive bleacher options for the filter dropdown (non-deleted). */
export function useBleacherFilterOptions(): { id: string; bleacher_number: number | null }[] {
  const compiled = useMemo(
    () =>
      db
        .selectFrom("Bleachers")
        .select(["id", "bleacher_number"])
        .where("deleted", "=", 0)
        .orderBy("bleacher_number", "asc")
        .compile(),
    [],
  );
  const { data } = useTypedQuery(
    compiled,
    expect<{ id: string; bleacher_number: number | null }>(),
  );
  return data ?? [];
}

/** Soft delete / restore a damage report (PowerSync local write). */
export async function setDamageReportDeleted(id: string, deleted: boolean): Promise<void> {
  await typedExecute(
    db
      .updateTable("DamageReports")
      .set({ deleted: deleted ? 1 : 0 } as any)
      .where("id", "=", id)
      .compile(),
  );
}
