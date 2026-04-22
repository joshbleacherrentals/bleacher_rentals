"use client";
import React, { useEffect, useState, useMemo } from "react";
import AddressAutocomplete from "@/components/AddressAutoComplete";
import { useUsersStore } from "@/state/userStore";
import { Dropdown } from "@/components/DropDown";
import { useMaintenanceEventStore } from "../../state/useMaintenanceEventStore";
import { useScrollToDateStore } from "@/features/dashboard/state/useScrollToDateStore";
import { LocateFixed, AlertTriangle, CheckCircle2 } from "lucide-react";
import CentsInput from "@/components/CentsInput";
import { useClerkSupabaseClient } from "@/utils/supabase/useClerkSupabaseClient";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { DamageReportModal, EditDamageReport } from "@/app/damage-reports/DamageReportModal";

export const MaintenanceCoreTab = () => {
  const store = useMaintenanceEventStore();
  const supabase = useClerkSupabaseClient();
  const queryClient = useQueryClient();
  const users = useUsersStore((s) => s.users);
  const ownerOptions = users.map((u) => ({
    label: `${u.first_name ?? ""} ${u.last_name ?? ""}`.trim() || u.email,
    value: String(u.id),
  }));

  const [viewingDamageReport, setViewingDamageReport] = useState<EditDamageReport | null>(null);

  // Default ownerUserUuid when users load
  useEffect(() => {
    if (
      store.isFormExpanded &&
      store.maintenanceEventUuid === null &&
      !store.ownerUserUuid &&
      users.length > 0
    ) {
      store.setField("ownerUserUuid", users[0].id);
    }
  }, [users, store.ownerUserUuid, store.maintenanceEventUuid, store.isFormExpanded]);

  // Clamp dates
  useEffect(() => {
    if (store.eventStart && store.eventEnd && store.eventStart > store.eventEnd) {
      store.setField("eventEnd", store.eventStart);
    }
    if (store.eventStart && store.eventEnd && store.eventEnd < store.eventStart) {
      store.setField("eventStart", store.eventEnd);
    }
  }, [store.eventStart, store.eventEnd]);

  const [costDisplay, setCostDisplay] = React.useState(
    store.costCents !== null ? (store.costCents / 100).toFixed(2) : "",
  );

  useEffect(() => {
    setCostDisplay(store.costCents !== null ? (store.costCents / 100).toFixed(2) : "");
  }, [store.maintenanceEventUuid]);

  // ── Damage report lookup per bleacher ───────────────────────────────────
  // For each selected bleacher, look backwards from eventStart to find
  // a damage report (via work tracker inspection) or a maintenance event.
  // If a maintenance event is found first → no damage report.
  // If a damage report is found first → show it.

  const bleacherUuids = store.bleacherUuids;
  const eventStart = store.eventStart;

  type DamageReportRow = EditDamageReport & {
    work_tracker_date: string | null;
  };

  const { data: damageReportLookup = new Map() } = useQuery({
    queryKey: ["maintenance-damage-lookup", bleacherUuids, eventStart],
    queryFn: async () => {
      if (!bleacherUuids.length || !eventStart) return new Map<string, DamageReportRow | "none">();

      // 1. Fetch damage reports for selected bleachers (including resolved)
      //    with work tracker date resolved through the inspection link
      const { data: damageReports } = await supabase
        .from("DamageReports")
        .select(
          `
          id,
          bleacher_uuid,
          inspection_uuid,
          is_safe_to_sit,
          is_safe_to_haul,
          note,
          resolved_at,
          maintenance_event_uuid,
          bleacher:Bleachers!DamageReports_bleacher_uuid_fkey(bleacher_number),
          photos:DamageReportPhotos!DamageReportPhotos_damage_report_uuid_fkey(id, photo_path)
        `,
        )
        .in("bleacher_uuid", bleacherUuids);

      // 2. For each damage report, find the work tracker date via inspection UUID
      const inspectionUuids = (damageReports ?? []).map((dr) => dr.inspection_uuid);
      let wtDateMap = new Map<string, string | null>(); // inspection_uuid → date

      if (inspectionUuids.length > 0) {
        // Find work trackers whose pre or post inspection matches
        const { data: workTrackers } = await supabase
          .from("WorkTrackers")
          .select("id, date, pre_inspection_uuid, post_inspection_uuid")
          .or(
            inspectionUuids
              .map((uuid) => `pre_inspection_uuid.eq.${uuid},post_inspection_uuid.eq.${uuid}`)
              .join(","),
          );

        for (const wt of workTrackers ?? []) {
          if (wt.pre_inspection_uuid && inspectionUuids.includes(wt.pre_inspection_uuid)) {
            wtDateMap.set(wt.pre_inspection_uuid, wt.date);
          }
          if (wt.post_inspection_uuid && inspectionUuids.includes(wt.post_inspection_uuid)) {
            wtDateMap.set(wt.post_inspection_uuid, wt.date);
          }
        }
      }

      // 3. Fetch maintenance events for selected bleachers before eventStart
      const { data: maintEvents } = await supabase
        .from("BleacherMaintEvents")
        .select(
          `
          bleacher_uuid,
          maintenance_event:MaintenanceEvents!BleacherMaintEvents_maintenance_event_uuid_fkey(
            id,
            event_start,
            event_end
          )
        `,
        )
        .in("bleacher_uuid", bleacherUuids);

      // Build map: bleacher_uuid → most recent maintenance event end before eventStart
      const maintEndByBleacher = new Map<string, string>();
      for (const bme of maintEvents ?? []) {
        const me = bme.maintenance_event as any;
        if (!me?.event_end || me.event_end >= eventStart) continue;
        // Exclude the current maintenance event being edited
        if (store.maintenanceEventUuid && me.id === store.maintenanceEventUuid) continue;
        const prev = maintEndByBleacher.get(bme.bleacher_uuid);
        if (!prev || me.event_end > prev) {
          maintEndByBleacher.set(bme.bleacher_uuid, me.event_end);
        }
      }

      // 4. For each bleacher, determine damage report or "none"
      const result = new Map<string, DamageReportRow | "none">();

      for (const bUuid of bleacherUuids) {
        const mostRecentMaintEnd = maintEndByBleacher.get(bUuid) ?? null;

        // Find the most recent damage report (by work tracker date) before eventStart
        const bleacherReports = (damageReports ?? [])
          .filter((dr) => dr.bleacher_uuid === bUuid)
          .map((dr) => ({
            ...dr,
            work_tracker_date: wtDateMap.get(dr.inspection_uuid) ?? null,
          }))
          .filter((dr) => dr.work_tracker_date && dr.work_tracker_date < eventStart)
          .sort((a, b) => (b.work_tracker_date ?? "").localeCompare(a.work_tracker_date ?? ""));

        const bestReport = bleacherReports[0] ?? null;

        if (!bestReport) {
          result.set(bUuid, "none");
          continue;
        }

        // If the most recent maintenance event is after the damage report's
        // work tracker date, the damage was already addressed
        if (
          mostRecentMaintEnd &&
          bestReport.work_tracker_date &&
          mostRecentMaintEnd > bestReport.work_tracker_date
        ) {
          result.set(bUuid, "none");
        } else {
          result.set(bUuid, bestReport as DamageReportRow);
        }
      }

      return result;
    },
    enabled: !!supabase && bleacherUuids.length > 0 && !!eventStart,
  });

  // Build bleacher number map for display
  const { data: bleacherNumbers = new Map() } = useQuery({
    queryKey: ["bleacher-numbers-for-maintenance", bleacherUuids],
    queryFn: async () => {
      const { data } = await supabase
        .from("Bleachers")
        .select("id, bleacher_number")
        .in("id", bleacherUuids);
      return new Map((data ?? []).map((b) => [b.id, b.bleacher_number]));
    },
    enabled: !!supabase && bleacherUuids.length > 0,
  });

  return (
    <>
      <div className="grid grid-cols-[1fr_1fr_auto_1fr] gap-4">
        <div>
          <label className="block text-sm font-medium text-black/70 mb-1">Event Name</label>
          <input
            type="text"
            className="bg-white w-full p-2 border rounded"
            placeholder="Maintenance / Repair"
            value={store.eventName}
            onChange={(e) => store.setField("eventName", e.target.value)}
          />
          <label className="block mt-1 text-sm font-medium text-black/70">Address</label>
          <AddressAutocomplete
            className="bg-white"
            onAddressSelect={(data) =>
              store.setField("addressData", {
                ...data,
                addressUuid: store.addressData?.addressUuid ?? null,
              })
            }
            initialValue={store.addressData?.address || ""}
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-black/70 mb-1">Start Date</label>
          <div className="flex gap-1">
            <input
              type="date"
              className="bg-white w-full p-2 border rounded min-w-0"
              value={store.eventStart}
              onChange={(e) => store.setField("eventStart", e.target.value)}
              max={store.eventEnd || undefined}
            />
            <ScrollToDateButton date={store.eventStart} />
          </div>
          <label className="block text-sm font-medium text-black/70 mt-1">End Date</label>
          <div className="flex gap-1">
            <input
              type="date"
              className="bg-white w-full p-2 border rounded min-w-0"
              value={store.eventEnd}
              onChange={(e) => store.setField("eventEnd", e.target.value)}
              min={store.eventStart || undefined}
            />
            <ScrollToDateButton date={store.eventEnd} />
          </div>
        </div>

        {/* Damage Report column */}
        <div className="min-w-[160px]">
          <label className="block text-sm font-medium text-black/70 mb-1">Damage Reports</label>
          {bleacherUuids.length === 0 || !eventStart ? (
            <p className="text-xs text-gray-400 italic">Select bleachers &amp; start date</p>
          ) : (
            <div className="space-y-1.5 max-h-[100px] overflow-y-auto">
              {bleacherUuids.map((bUuid) => {
                const lookup = damageReportLookup.get(bUuid);
                const bNum = bleacherNumbers.get(bUuid);
                const label = bNum != null ? `#${bNum}` : "Bleacher";

                if (!lookup || lookup === "none") {
                  return (
                    <div key={bUuid} className="flex items-center gap-1.5 text-xs text-gray-400">
                      <CheckCircle2 className="h-3.5 w-3.5 text-green-500 shrink-0" />
                      <span>{label}: No Damage Report</span>
                    </div>
                  );
                }

                return (
                  <button
                    key={bUuid}
                    type="button"
                    onClick={() => setViewingDamageReport(lookup)}
                    className="flex items-center gap-1.5 text-xs text-red-700 hover:text-red-900 hover:underline cursor-pointer"
                  >
                    <AlertTriangle className="h-3.5 w-3.5 text-red-500 shrink-0" />
                    <span>{label}: View Damage Report</span>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <div>
          <label className="block text-sm font-medium text-black/70 mb-1">Repair Cost</label>
          <CentsInput
            value={costDisplay}
            onChange={(value, cents) => {
              setCostDisplay(value);
              store.setField("costCents", cents);
            }}
            placeholder="0.00"
            className="bg-white w-full p-2 border rounded"
          />
          <label className="block text-sm font-medium text-black/70 mt-1">Owner</label>
          <Dropdown
            options={ownerOptions}
            selected={store.ownerUserUuid ? String(store.ownerUserUuid) : undefined}
            onSelect={(val) => {
              if (!val) {
                store.setField("ownerUserUuid", null);
              } else {
                store.setField("ownerUserUuid", val as string);
              }
            }}
            placeholder="Select owner"
          />
        </div>
      </div>

      {/* Damage report edit modal */}
      {viewingDamageReport && (
        <DamageReportModal
          open={!!viewingDamageReport}
          onOpenChange={(open) => {
            if (!open) setViewingDamageReport(null);
          }}
          onSaved={() => {
            setViewingDamageReport(null);
            queryClient.invalidateQueries({ queryKey: ["maintenance-damage-lookup"] });
          }}
          editReport={viewingDamageReport}
        />
      )}
    </>
  );
};

function ScrollToDateButton({ date }: { date: string }) {
  const scrollToDate = useScrollToDateStore((s) => s.scrollToDate);
  return (
    <button
      type="button"
      className="shrink-0 p-2 text-black/50 hover:text-black disabled:opacity-30 disabled:cursor-not-allowed"
      disabled={!date || !scrollToDate}
      onClick={() => scrollToDate?.(date)}
      title="Scroll dashboard to this date"
    >
      <LocateFixed size={16} />
    </button>
  );
}
