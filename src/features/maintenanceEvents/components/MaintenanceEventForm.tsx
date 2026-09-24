"use client";

import { useState } from "react";
import { AlertTriangle } from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { DamageReportModal, EditDamageReport } from "@/app/damage-reports/DamageReportModal";
import { useMaintenanceEventStore } from "../state/useMaintenanceEventStore";
import { createMaintenanceEvent } from "../db/createMaintenanceEvent";
import { updateMaintenanceEvent } from "../db/updateMaintenanceEvent";
import { deleteMaintenanceEvent } from "../db/deleteMaintenanceEvent";
import { useClerkSupabaseClient } from "@/utils/supabase/useClerkSupabaseClient";
import { MaintenanceCoreTab } from "./tabs/CoreTab";
import { MaintenanceFilesTab } from "./tabs/FilesTab";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { useTeamPermissions } from "@/features/manageTeam/hooks/useTeamPermissions";
import { canEditOwnedEntity } from "@/features/userAccess/logic/canEditOwnedEntity";

const tabs = ["Core", "Files"] as const;
type Tab = (typeof tabs)[number];

type MaintenanceEventFormProps = {
  onCancel: () => void;
};

export const MaintenanceEventForm = ({ onCancel }: MaintenanceEventFormProps) => {
  const supabase = useClerkSupabaseClient();
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<Tab>("Core");
  const store = useMaintenanceEventStore();
  const permissions = useTeamPermissions();

  const isEditing = !!store.maintenanceEventUuid;
  const canEdit = permissions.isMaintainer
    ? true
    : permissions.canCreateUser
      ? canEditOwnedEntity({
          isAdmin: permissions.isAdmin,
          isNew: !isEditing,
        })
      : false;

  // ── Damage report lookup per bleacher (moved out of the Core tab) ─────────
  // For each selected bleacher, look backwards from eventStart to find a damage
  // report (via work tracker inspection) or a maintenance event. If a
  // maintenance event is found first → no damage report. Otherwise show it.
  const queryClient = useQueryClient();
  const bleacherUuids = store.bleacherUuids;
  const eventStart = store.eventStart;
  const [viewingDamageReport, setViewingDamageReport] = useState<EditDamageReport | null>(null);

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
          seat_damage,
          haul_damage,
          note,
          resolved_at,
          maintenance_event_uuid,
          bleacher:Bleachers!DamageReports_bleacher_uuid_fkey(bleacher_number),
          photos:DamageReportPhotos!DamageReportPhotos_damage_report_uuid_fkey(id, photo_path)
        `,
        )
        .in("bleacher_uuid", bleacherUuids)
        .eq("deleted", false);

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
            work_tracker_date: dr.inspection_uuid
              ? (wtDateMap.get(dr.inspection_uuid) ?? null)
              : null,
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

  const handleCreate = async () => {
    setLoading(true);
    try {
      const state = useMaintenanceEventStore.getState();
      await createMaintenanceEvent(state, supabase);
      onCancel();
    } catch {
      // Error toasts handled inside createMaintenanceEvent
    } finally {
      setLoading(false);
    }
  };

  const handleUpdate = async () => {
    setLoading(true);
    try {
      const state = useMaintenanceEventStore.getState();
      await updateMaintenanceEvent(state, supabase);
      onCancel();
    } catch {
      // Error toasts handled inside updateMaintenanceEvent
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    setLoading(true);
    try {
      const state = useMaintenanceEventStore.getState();
      if (!state.maintenanceEventUuid) return;
      await deleteMaintenanceEvent(state.maintenanceEventUuid);
      onCancel();
    } catch {
      // Error toasts handled inside deleteMaintenanceEvent
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-4">
      <div className="flex items-center gap-2">
        <div className="flex gap-2">
          {tabs.map((tab) => (
            <button
              key={tab}
              className={`px-2.5 mb-2 rounded-t border-b-2 cursor-pointer ${
                activeTab === tab ? "border-darkBlue font-semibold" : "border-transparent"
              } ${activeTab === tab ? "text-darkBlue" : "text-black/50"}`}
              onClick={() => setActiveTab(tab)}
            >
              {tab}
            </button>
          ))}
        </div>

        {/* Damage report links (moved here from the Core tab) */}
        <div className="flex flex-wrap items-center gap-2">
          {bleacherUuids.map((bUuid) => {
            const lookup = damageReportLookup.get(bUuid);
            if (!lookup || lookup === "none") return null;
            const bNum = bleacherNumbers.get(bUuid);
            const label = bNum != null ? `#${bNum}` : "Bleacher";
            return (
              <button
                key={bUuid}
                type="button"
                onClick={() => setViewingDamageReport(lookup)}
                className="mb-2 flex cursor-pointer items-center gap-1.5 text-xs font-medium text-red-700 hover:text-red-900 hover:underline"
              >
                <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-red-500" />
                <span>{label}: View Damage Report</span>
              </button>
            );
          })}
        </div>

        {/* Spacer */}
        <div className="flex-1" />

        <div className="flex items-center gap-2">
          {/* Delete button - only for existing events the user can edit */}
          {isEditing && canEdit && (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <button className="px-4 py-2 mr-2 bg-white text-red-800 text-sm font-semibold border border-red-800 rounded-sm hover:bg-red-800 hover:text-white transition cursor-pointer">
                  Delete
                </button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This will permanently delete this maintenance event and cannot be undone.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel className="cursor-pointer rounded-sm">
                    Cancel
                  </AlertDialogCancel>
                  <AlertDialogAction
                    className="cursor-pointer rounded-sm bg-red-800 text-white hover:bg-red-900"
                    onClick={handleDelete}
                  >
                    Continue
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}

          {/* Create/Update button — only when user can edit */}
          {canEdit &&
            (!loading ? (
              <button
                className="px-4 py-2 bg-darkBlue text-white text-sm font-semibold rounded-sm shadow-md hover:bg-lightBlue transition cursor-pointer"
                onClick={isEditing ? handleUpdate : handleCreate}
                disabled={loading}
              >
                {isEditing ? "Update Maintenance" : "Add Maintenance"}
              </button>
            ) : (
              <button
                className="bg-gray-400 cursor-not-allowed px-4 py-2 text-white text-sm font-semibold rounded-sm shadow-md transition"
                disabled={true}
              >
                <div className="relative flex items-center justify-center">
                  <svg
                    className="w-4 h-4 animate-spin mr-2 fill-white"
                    viewBox="0 0 100 101"
                    fill="none"
                    xmlns="http://www.w3.org/2000/svg"
                  >
                    <path
                      d="M100 50.5908C100 78.2051 77.6142 100.591 50
                          100.591C22.3858 100.591 0 78.2051 0
                          50.5908C0 22.9766 22.3858 0.59082 50
                          0.59082C77.6142 0.59082 100 22.9766 100
                          50.5908ZM9.08144 50.5908C9.08144 73.1895
                          27.4013 91.5094 50 91.5094C72.5987
                          91.5094 90.9186 73.1895 90.9186
                          50.5908C90.9186 27.9921 72.5987 9.67226
                          50 9.67226C27.4013 9.67226 9.08144
                          27.9921 9.08144 50.5908Z"
                      fill="currentColor"
                    />
                    <path
                      d="M93.9676 39.0409C96.393 38.4038
                          97.8624 35.9116 97.0079
                          33.5539C95.2932 28.8227 92.871
                          24.3692 89.8167 20.348C85.8452
                          15.1192 80.8826 10.7238 75.2124
                          7.41289C69.5422 4.10194 63.2754
                          1.94025 56.7698 1.05124C51.7666
                          0.367541 46.6976 0.446843 41.7345
                          1.27873C39.2613 1.69328 37.813
                          4.19778 38.4501 6.62326C39.0873
                          9.04874 41.5694 10.4717 44.0505
                          10.1071C47.8511 9.54855 51.7191
                          9.52689 55.5402 10.0491C60.8642
                          10.7766 65.9928 12.5457 70.6331
                          15.2552C75.2735 17.9648 79.3347
                          21.5619 82.5849 25.841C84.9175
                          28.9121 86.7997 32.2913 88.1811
                          35.8758C89.083 38.2158 91.5421
                          39.6781 93.9676 39.0409Z"
                      fill="currentFill"
                    />
                  </svg>
                  <span>Saving...</span>
                </div>
              </button>
            ))}
        </div>
      </div>

      {/* Read-only banner for non-owners */}
      {!canEdit && isEditing && (
        <div className="mb-2 rounded border border-yellow-300 bg-yellow-50 px-3 py-2 text-sm text-yellow-800">
          You have read-only access to this maintenance event.
        </div>
      )}

      {/* Tab content */}
      <fieldset disabled={!canEdit}>
        {activeTab === "Core" && <MaintenanceCoreTab disabled={!canEdit} />}
        {activeTab === "Files" && <MaintenanceFilesTab />}
      </fieldset>

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
    </div>
  );
};
