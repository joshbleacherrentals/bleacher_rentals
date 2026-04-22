"use client";
import { createErrorToast } from "@/components/toasts/ErrorToast";
import { Database, Tables } from "../../../../../database.types";
// import { getSupabaseClient } from "@/utils/supabase/getSupabaseClient";
import { Bleacher } from "../../types";
import { useDashboardBleachersStore } from "../../state/useDashboardBleachersStore";
import { SupabaseClient } from "@supabase/supabase-js";

type Row = {
  id: string; // Bleachers.id (uuid)
  bleacher_number: number;
  bleacher_rows: number;
  bleacher_seats: number;
  linxup_device_id: string | null;

  summer_account_manager_uuid: string | null;
  winter_account_manager_uuid: string | null;

  summer: { home_base_name: string; id: string } | null; // HomeBases.id (uuid)
  winter: { home_base_name: string; id: string } | null;

  bleacher_events: {
    id: string; // BleacherEvents.id (uuid)
    event: {
      id: string; // Events.id (uuid)
      event_name: string;
      event_start: string;
      event_end: string;
      hsl_hue: number | null;
      booked: boolean;
      event_status: string | null;
      goodshuffle_url: string | null;
      address: { street: string } | null;
    } | null;
  }[];

  blocks: {
    id: string; // Blocks.id (uuid)
    text: string | null;
    date: string | null;
  }[];

  work_trackers: {
    id: string; // WorkTrackers.id (uuid)
    date: string | null;
    status: string;
    pickup_time: string | null;
    dropoff_time: string | null;
    pre_inspection_uuid: string | null;
    post_inspection_uuid: string | null;
    dropoff_address: { street: string } | null;
    driver: {
      id: string;
      user: {
        first_name: string | null;
        last_name: string | null;
      } | null;
    } | null;
  }[];

  bleacher_maint_events: {
    id: string;
    maintenance_event: {
      id: string;
      event_name: string;
      event_start: string;
      event_end: string;
      cost_cents: number | null;
      address: { street: string } | null;
    } | null;
  }[];

  damage_reports: {
    id: string;
    bleacher_uuid: string;
    inspection_uuid: string;
    is_safe_to_sit: boolean;
    is_safe_to_haul: boolean;
    note: string | null;
    created_at: string;
    resolved_at: string | null;
    maintenance_event_uuid: string | null;
  }[];
};

export async function FetchDashboardBleachers(
  supabase: SupabaseClient<Database>,
): Promise<{ bleachers: Bleacher[] }> {
  if (!supabase) {
    createErrorToast(["No Supabase Client found"]);
  }
  const { data, error } = await supabase
    .from("Bleachers")
    .select(
      `
      id,
    bleacher_number,
    bleacher_rows,
    bleacher_seats,
    linxup_device_id,
    summer_account_manager_uuid,
    winter_account_manager_uuid,

    summer:HomeBases!bleachers_summer_home_base_uuid_fkey(
      home_base_name,
      id
    ),
    winter:HomeBases!bleachers_winter_home_base_uuid_fkey(
      home_base_name,
      id
    ),

    bleacher_events:BleacherEvents!BleacherEvents_bleacher_uuid_fkey(
      id,
      event:Events!BleacherEvents_event_uuid_fkey(
        id,
        event_name,
        event_start,
        event_end,
        hsl_hue,
        booked,
        event_status,
        goodshuffle_url,
        address:Addresses!Events_address_uuid_fkey(
          street
        )
      )
    ),

    blocks:Blocks!Blocks_bleacher_uuid_fkey(
      id,
      text,
      date
    ),

    work_trackers:WorkTrackers!WorkTrackers_bleacher_uuid_fkey(
      id,
      date,
      status,
      pickup_time,
      dropoff_time,
      pre_inspection_uuid,
      post_inspection_uuid,
      dropoff_address:Addresses!worktrackers_dropoff_address_uuid_fkey(
        street
      ),
      driver:Drivers!WorkTrackers_driver_uuid_fkey(
        id,
        user:Users!Drivers_user_uuid_fkey(
          first_name,
          last_name
        )
      )
    ),

    bleacher_maint_events:BleacherMaintEvents!BleacherMaintEvents_bleacher_uuid_fkey(
      id,
      maintenance_event:MaintenanceEvents!BleacherMaintEvents_maintenance_event_uuid_fkey(
        id,
        event_name,
        event_start,
        event_end,
        cost_cents,
        address:Addresses!MaintenanceEvents_address_uuid_fkey(
          street
        )
      )
    ),

    damage_reports:DamageReports!DamageReports_bleacher_uuid_fkey(
      id,
      bleacher_uuid,
      inspection_uuid,
      is_safe_to_sit,
      is_safe_to_haul,
      note,
      created_at,
      resolved_at,
      maintenance_event_uuid
    )
      `,
    )
    .eq("deleted", false)
    .order("bleacher_number", { ascending: true })
    .overrideTypes<Row[], { merge: false }>();

  if (error) {
    createErrorToast(["Failed to fetch Dashboard Bleachers.", error.message]);
  }
  // console.log("data", data);
  const bleachers: Bleacher[] = (data ?? []).map((r) => ({
    bleacherUuid: r.id,
    bleacherNumber: r.bleacher_number,
    bleacherRows: r.bleacher_rows,
    bleacherSeats: r.bleacher_seats,
    linxupDeviceId: r.linxup_device_id,

    summerAccountManagerUuid: r.summer_account_manager_uuid,
    winterAccountManagerUuid: r.winter_account_manager_uuid,

    summerHomeBase: r.summer ? { name: r.summer.home_base_name, homeBaseUuid: r.summer.id } : null,

    winterHomeBase: r.winter ? { name: r.winter.home_base_name, homeBaseUuid: r.winter.id } : null,

    bleacherEvents: (r.bleacher_events ?? [])
      // optional: if you *only* want rows that actually have an event
      .filter((be) => !!be.event)
      // Exclude events marked as lost from dashboard display
      .filter((be) => be.event!.event_status !== "lost")
      .map((be) => ({
        eventUuid: be.event!.id,
        bleacherEventUuid: be.id,
        eventName: be.event!.event_name,
        eventStart: be.event!.event_start,
        eventEnd: be.event!.event_end,
        hslHue: be.event!.hsl_hue,
        booked: be.event!.booked,
        goodshuffleUrl: be.event!.goodshuffle_url ?? null,
        address: be.event!.address?.street ?? "",
      })),

    blocks: (r.blocks ?? []).map((block) => ({
      blockUuid: block.id,
      text: block.text ?? "",
      date: block.date ?? "",
    })),

    workTrackers: (r.work_trackers ?? []).map((wt) => ({
      workTrackerUuid: wt.id,
      date: wt.date ?? "",
      status: wt.status as Database["public"]["Enums"]["worktracker_status"],
      pickupTime: wt.pickup_time ?? null,
      dropoffTime: wt.dropoff_time ?? null,
      driverUuid: wt.driver?.id ?? null,
      driverFirstName: wt.driver?.user?.first_name ?? null,
      driverLastName: wt.driver?.user?.last_name ?? null,
      dropoffAddress: wt.dropoff_address?.street ?? null,
    })),

    maintenanceEvents: (r.bleacher_maint_events ?? [])
      .filter((bme) => !!bme.maintenance_event)
      .map((bme) => ({
        maintenanceEventUuid: bme.maintenance_event!.id,
        bleacherMaintEventUuid: bme.id,
        eventName: bme.maintenance_event!.event_name,
        eventStart: bme.maintenance_event!.event_start,
        eventEnd: bme.maintenance_event!.event_end,
        costCents: bme.maintenance_event!.cost_cents,
        address: bme.maintenance_event!.address?.street ?? "",
      })),

    damageReports: (r.damage_reports ?? []).map((dr) => {
      // Resolve the work tracker date by matching inspection_uuid
      // to work_trackers' pre_inspection_uuid or post_inspection_uuid
      const linkedWt = (r.work_trackers ?? []).find(
        (wt) =>
          wt.pre_inspection_uuid === dr.inspection_uuid ||
          wt.post_inspection_uuid === dr.inspection_uuid,
      );
      return {
        damageReportUuid: dr.id,
        bleacherUuid: dr.bleacher_uuid,
        inspectionUuid: dr.inspection_uuid,
        isSafeToSit: dr.is_safe_to_sit,
        isSafeToHaul: dr.is_safe_to_haul,
        note: dr.note,
        createdAt: dr.created_at,
        resolvedAt: dr.resolved_at,
        maintenanceEventUuid: dr.maintenance_event_uuid,
        workTrackerDate: linkedWt?.date ?? null,
      };
    }),
  }));

  // console.log("bleachers", bleachers);
  // Update the dashboard bleachers store so other parts of the app can react
  try {
    useDashboardBleachersStore.getState().setData(bleachers);
    useDashboardBleachersStore.getState().setStale(false);
  } catch {}

  return { bleachers };
}
