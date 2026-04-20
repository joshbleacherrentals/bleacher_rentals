"use client";
import { db } from "@/components/providers/SystemProvider";
import { expect, useTypedQuery } from "@/lib/powersync/typedQuery";
import { jsonArrayFrom, jsonObjectFrom } from "kysely/helpers/postgres";
import { Bleacher } from "../../types";
import { Database } from "../../../../../database.types";
import { useMemo } from "react";

type BleacherFlatRow = {
  bleacher_number: number | null;
  bleacher_rows: number | null;
  bleacher_seats: number | null;
  linxup_device_id: string | null;
  summer_account_manager_uuid: string | null;
  winter_account_manager_uuid: string | null;
  booked: number | null;
  event_end: string | null;
  event_name: string | null;
  event_start: string | null;
  goodshuffle_url: string | null;
  hsl_hue: number | null;
  bleacher_uuid: string;
  summer_home_base_uuid: string | null;
  summer_home_base_name: string | null;
  winter_home_base_uuid: string | null;
  winter_home_base_name: string | null;
  bleacher_event_uuid: string | null;
  event_uuid: string | null;
  event_status: string | null;
  address_street: string | null;

  block_uuid: string | null;
  block_text: string | null;
  block_date: string | null;

  work_tracker_uuid: string | null;
  work_tracker_date: string | null;
  work_tracker_status: string | null;
  work_tracker_driver_uuid: string | null;

  maint_event_uuid: string | null;
  bme_uuid: string | null;
  maint_event_name: string | null;
  maint_event_start: string | null;
  maint_event_end: string | null;
  maint_cost_cents: number | null;
  maint_address_street: string | null;

  dr_uuid: string | null;
  dr_inspection_uuid: string | null;
  dr_is_safe_to_sit: number | null;
  dr_is_safe_to_haul: number | null;
  dr_note: string | null;
  dr_created_at: string | null;
  dr_resolved_at: string | null;
  dr_maintenance_event_uuid: string | null;
  dr_wt_pre_date: string | null;
  dr_wt_post_date: string | null;
};

function toBool(v: BleacherFlatRow["booked"]): boolean {
  if (typeof v === "boolean") return v;
  if (typeof v === "number") return v !== 0;
  return false;
}

function reshapeBleachers(rows: BleacherFlatRow[]): Bleacher[] {
  const byBleacher = new Map<string, Bleacher>();

  const seenEvents = new Map<string, Set<string>>();
  const seenBlocks = new Map<string, Set<string>>();
  const seenWts = new Map<string, Set<string>>();
  const seenMaint = new Map<string, Set<string>>();
  const seenDr = new Map<string, Set<string>>();

  for (const r of rows) {
    let b = byBleacher.get(r.bleacher_uuid);

    if (!b) {
      b = {
        bleacherUuid: r.bleacher_uuid,
        bleacherNumber: r.bleacher_number || 0,
        bleacherRows: r.bleacher_rows || 0,
        bleacherSeats: r.bleacher_seats || 0,
        linxupDeviceId: r.linxup_device_id,

        summerAccountManagerUuid: r.summer_account_manager_uuid,
        winterAccountManagerUuid: r.winter_account_manager_uuid,

        summerHomeBase: r.summer_home_base_uuid
          ? { homeBaseUuid: r.summer_home_base_uuid, name: r.summer_home_base_name ?? "" }
          : null,

        winterHomeBase: r.winter_home_base_uuid
          ? { homeBaseUuid: r.winter_home_base_uuid, name: r.winter_home_base_name ?? "" }
          : null,

        bleacherEvents: [],
        blocks: [],
        workTrackers: [],
        maintenanceEvents: [],
        damageReports: [],
      };

      byBleacher.set(r.bleacher_uuid, b);
      seenEvents.set(r.bleacher_uuid, new Set());
      seenBlocks.set(r.bleacher_uuid, new Set());
      seenWts.set(r.bleacher_uuid, new Set());
      seenMaint.set(r.bleacher_uuid, new Set());
      seenDr.set(r.bleacher_uuid, new Set());
    }

    // Events
    if (r.bleacher_event_uuid) {
      const set = seenEvents.get(r.bleacher_uuid)!;
      if (!set.has(r.bleacher_event_uuid)) {
        set.add(r.bleacher_event_uuid);

        // Supabase version assumed event is always present; with left joins it can be null.
        // Exclude events marked as lost from dashboard display.
        if (r.event_uuid && r.event_status !== "lost") {
          b.bleacherEvents.push({
            bleacherEventUuid: r.bleacher_event_uuid,
            eventUuid: r.event_uuid,
            eventName: r.event_name ?? "",
            eventStart: r.event_start ?? "",
            eventEnd: r.event_end ?? "",
            hslHue: r.hsl_hue,
            booked: toBool(r.booked),
            goodshuffleUrl: r.goodshuffle_url ?? null,
            address: r.address_street ?? "",
          });
        }
      }
    }

    // Blocks
    if (r.block_uuid) {
      const set = seenBlocks.get(r.bleacher_uuid)!;
      if (!set.has(r.block_uuid)) {
        set.add(r.block_uuid);
        b.blocks.push({
          blockUuid: r.block_uuid,
          text: r.block_text ?? "",
          date: r.block_date ?? "",
        });
      }
    }

    // WorkTrackers
    if (r.work_tracker_uuid) {
      const set = seenWts.get(r.bleacher_uuid)!;
      if (!set.has(r.work_tracker_uuid)) {
        set.add(r.work_tracker_uuid);
        b.workTrackers.push({
          workTrackerUuid: r.work_tracker_uuid,
          date: r.work_tracker_date ?? "",
          status: (r.work_tracker_status ??
            "draft") as Database["public"]["Enums"]["worktracker_status"],
          pickupTime: null,
          dropoffTime: null,
          driverUuid: r.work_tracker_driver_uuid,
          driverFirstName: null,
          driverLastName: null,
          dropoffAddress: null,
        });
      }
    }

    // Maintenance Events
    if (r.bme_uuid && r.maint_event_uuid) {
      const set = seenMaint.get(r.bleacher_uuid)!;
      if (!set.has(r.bme_uuid)) {
        set.add(r.bme_uuid);
        b.maintenanceEvents.push({
          maintenanceEventUuid: r.maint_event_uuid,
          bleacherMaintEventUuid: r.bme_uuid,
          eventName: r.maint_event_name ?? "Maintenance / Repair",
          eventStart: r.maint_event_start ?? "",
          eventEnd: r.maint_event_end ?? "",
          costCents: r.maint_cost_cents,
          address: r.maint_address_street ?? "",
        });
      }
    }

    // Damage Reports
    if (r.dr_uuid) {
      const set = seenDr.get(r.bleacher_uuid)!;
      if (!set.has(r.dr_uuid)) {
        set.add(r.dr_uuid);
        b.damageReports.push({
          damageReportUuid: r.dr_uuid,
          bleacherUuid: r.bleacher_uuid,
          inspectionUuid: r.dr_inspection_uuid ?? "",
          isSafeToSit: toBool(r.dr_is_safe_to_sit),
          isSafeToHaul: toBool(r.dr_is_safe_to_haul),
          note: r.dr_note,
          createdAt: r.dr_created_at ?? "",
          resolvedAt: r.dr_resolved_at,
          maintenanceEventUuid: r.dr_maintenance_event_uuid,
          workTrackerDate: r.dr_wt_pre_date ?? r.dr_wt_post_date ?? null,
        });
      }
    }
  }

  return [...byBleacher.values()];
}

export function useBleachers() {
  const compiled = db
    .selectFrom("Bleachers as b")
    .leftJoin("HomeBases as summer_hb", "summer_hb.id", "b.summer_home_base_uuid")
    .leftJoin("HomeBases as winter_hb", "winter_hb.id", "b.winter_home_base_uuid")
    .leftJoin("BleacherEvents as be", "be.bleacher_uuid", "b.id")
    .leftJoin("Events as e", "e.id", "be.event_uuid")
    .leftJoin("Addresses as a", "a.id", "e.address_uuid")
    .leftJoin("Blocks as bl", "bl.bleacher_uuid", "b.id")
    .leftJoin("WorkTrackers as wt", "wt.bleacher_uuid", "b.id")
    .leftJoin("BleacherMaintEvents as bme", "bme.bleacher_uuid", "b.id")
    .leftJoin("MaintenanceEvents as me", "me.id", "bme.maintenance_event_uuid")
    .leftJoin("Addresses as ma", "ma.id", "me.address_uuid")
    .leftJoin("DamageReports as dr", "dr.bleacher_uuid", "b.id")
    .leftJoin("WorkTrackers as dr_wt_pre", "dr_wt_pre.pre_inspection_uuid", "dr.inspection_uuid")
    .leftJoin("WorkTrackers as dr_wt_post", "dr_wt_post.post_inspection_uuid", "dr.inspection_uuid")
    .select([
      "b.id as bleacher_uuid",
      "b.bleacher_number",
      "b.bleacher_rows",
      "b.bleacher_seats",
      "b.linxup_device_id",
      "b.summer_account_manager_uuid",
      "b.winter_account_manager_uuid",

      "summer_hb.id as summer_home_base_uuid",
      "summer_hb.home_base_name as summer_home_base_name",

      "winter_hb.id as winter_home_base_uuid",
      "winter_hb.home_base_name as winter_home_base_name",

      "be.id as bleacher_event_uuid",
      "e.id as event_uuid",
      "e.event_name",
      "e.event_start",
      "e.event_end",
      "e.hsl_hue",
      "e.booked",
      "e.event_status",
      "e.goodshuffle_url",
      "a.street as address_street",

      "bl.id as block_uuid",
      "bl.text as block_text",
      "bl.date as block_date",

      "wt.id as work_tracker_uuid",
      "wt.date as work_tracker_date",
      "wt.status as work_tracker_status",
      "wt.driver_uuid as work_tracker_driver_uuid",

      "me.id as maint_event_uuid",
      "bme.id as bme_uuid",
      "me.event_name as maint_event_name",
      "me.event_start as maint_event_start",
      "me.event_end as maint_event_end",
      "me.cost_cents as maint_cost_cents",
      "ma.street as maint_address_street",

      "dr.id as dr_uuid",
      "dr.inspection_uuid as dr_inspection_uuid",
      "dr.is_safe_to_sit as dr_is_safe_to_sit",
      "dr.is_safe_to_haul as dr_is_safe_to_haul",
      "dr.note as dr_note",
      "dr.created_at as dr_created_at",
      "dr.resolved_at as dr_resolved_at",
      "dr.maintenance_event_uuid as dr_maintenance_event_uuid",
      "dr_wt_pre.date as dr_wt_pre_date",
      "dr_wt_post.date as dr_wt_post_date",
    ])
    .orderBy("b.bleacher_number", "asc")
    .compile();

  const { data: flatRows } = useTypedQuery(compiled, expect<BleacherFlatRow>());

  const bleachers = useMemo(() => {
    return reshapeBleachers(flatRows ?? []);
  }, [flatRows]);

  return bleachers;
}
