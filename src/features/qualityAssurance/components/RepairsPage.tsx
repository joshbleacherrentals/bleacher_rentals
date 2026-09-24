"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";
import { PageHeader } from "@/components/PageHeader";
import { useRepairs } from "../hooks/useRepairs";
import { useBleacherOptions } from "../hooks/useFilterOptions";
import { Wrench, Pencil, Trash2, RotateCcw } from "lucide-react";
import { useTeamPermissions } from "@/features/manageTeam/hooks/useTeamPermissions";
import { canManageDamageAndMaintenance } from "@/features/userAccess/logic/canManageDamageAndMaintenance";
import { useClerkSupabaseClient } from "@/utils/supabase/useClerkSupabaseClient";
import { loadMaintenanceEventById } from "@/features/dashboard/db/client/loadMaintenanceEventById";
import { useMaintenanceEventStore } from "@/features/maintenanceEvents/state/useMaintenanceEventStore";
import { MaintenanceEventForm } from "@/features/maintenanceEvents/components/MaintenanceEventForm";
import { setMaintenanceEventDeleted } from "@/features/maintenanceEvents/db/deleteMaintenanceEvent";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString();
  } catch {
    return iso;
  }
}

function formatMoney(cents: number | null): string {
  if (cents == null) return "—";
  return `$${(cents / 100).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

export default function RepairsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const bleacherUuid = searchParams.get("bleacher_uuid");

  // Admins can edit maintenance/repair events directly from this page.
  const { isAdmin: isAdminRole, isMaintainer } = useTeamPermissions();
  // Admins and maintainers can edit, delete and restore repairs.
  const isAdmin = canManageDamageAndMaintenance({ isAdmin: isAdminRole, isMaintainer });
  const supabase = useClerkSupabaseClient();
  const [showDeleted, setShowDeleted] = useState(false);
  const [editingUuid, setEditingUuid] = useState<string | null>(null);
  const [loadingEdit, setLoadingEdit] = useState(false);

  const bleachers = useBleacherOptions();
  const rows = useRepairs({ bleacherUuid, showDeleted });

  const openEdit = async (maintenanceEventUuid: string) => {
    if (!isAdmin || loadingEdit) return;
    setLoadingEdit(true);
    try {
      await loadMaintenanceEventById(maintenanceEventUuid, supabase);
      setEditingUuid(maintenanceEventUuid);
    } finally {
      setLoadingEdit(false);
    }
  };

  const closeEdit = () => {
    useMaintenanceEventStore.getState().resetForm();
    setEditingUuid(null);
  };

  const restore = (maintenanceEventUuid: string) => {
    void setMaintenanceEventDeleted(maintenanceEventUuid, false);
  };

  const updateFilter = (value: string) => {
    const params = new URLSearchParams(searchParams.toString());
    if (value) {
      params.set("bleacher_uuid", value);
    } else {
      params.delete("bleacher_uuid");
    }
    router.replace(`/repairs?${params.toString()}`);
  };

  const subtitle = useMemo(() => {
    if (!bleacherUuid) return "All maintenance and repair events across the fleet";
    const num = bleachers.find((b) => b.uuid === bleacherUuid)?.bleacherNumber;
    return num != null ? `Showing for Bleacher #${num}` : "Showing for selected bleacher";
  }, [bleacherUuid, bleachers]);

  return (
    <>
      <PageHeader title="Repairs" subtitle={subtitle} />

      <div className="flex flex-wrap items-center gap-3 mb-4">
        <select
          value={bleacherUuid ?? ""}
          onChange={(e) => updateFilter(e.target.value)}
          className="px-3 py-2 border border-gray-300 rounded-md text-sm bg-white"
        >
          <option value="">All bleachers</option>
          {bleachers.map((b) => (
            <option key={b.uuid} value={b.uuid}>
              Bleacher #{b.bleacherNumber ?? "?"}
            </option>
          ))}
        </select>

        {isAdmin && (
          <button
            onClick={() => setShowDeleted((v) => !v)}
            className={`ml-auto flex items-center gap-1.5 px-3 py-2 text-sm font-medium rounded-md border transition cursor-pointer ${
              showDeleted
                ? "border-gray-400 bg-gray-100 text-gray-800 hover:bg-gray-200"
                : "border-gray-200 bg-white text-gray-500 hover:bg-gray-50"
            }`}
          >
            <Trash2 className="h-3.5 w-3.5" />
            {showDeleted ? "Showing Deleted" : "Show Deleted"}
          </button>
        )}
      </div>

      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <table className="min-w-full">
          <thead>
            <tr className="border-b border-gray-200 bg-gray-50">
              <th className="px-5 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                Event
              </th>
              <th className="px-5 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                Start
              </th>
              <th className="px-5 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                End
              </th>
              <th className="px-5 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                Bleachers
              </th>
              <th className="px-5 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                Cost
              </th>
              <th className="px-5 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                Notes
              </th>
              {isAdmin && <th className="px-5 py-3 w-12" />}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr
                key={row.maintenanceEventUuid}
                onClick={
                  isAdmin && !showDeleted ? () => openEdit(row.maintenanceEventUuid) : undefined
                }
                className={`border-b border-gray-100 transition-colors hover:bg-gray-50 ${
                  isAdmin && !showDeleted ? "cursor-pointer" : ""
                }`}
              >
                <td className="px-5 py-4 text-sm font-semibold text-darkBlue">
                  {row.eventName ?? "—"}
                </td>
                <td className="px-5 py-4 text-sm text-gray-700 whitespace-nowrap">
                  {formatDate(row.eventStart)}
                </td>
                <td className="px-5 py-4 text-sm text-gray-700 whitespace-nowrap">
                  {formatDate(row.eventEnd)}
                </td>
                <td className="px-5 py-4 text-sm text-gray-700">
                  {row.bleachers.length === 0 ? (
                    <span className="text-gray-400">—</span>
                  ) : (
                    <div className="flex flex-wrap gap-1">
                      {row.bleachers.map((b) => (
                        <span
                          key={b.uuid}
                          className="inline-block px-2 py-0.5 text-xs font-semibold bg-gray-100 text-darkBlue rounded"
                        >
                          #{b.bleacherNumber ?? "?"}
                        </span>
                      ))}
                    </div>
                  )}
                </td>
                <td className="px-5 py-4 text-sm text-gray-700 whitespace-nowrap">
                  {formatMoney(row.costCents)}
                </td>
                <td className="px-5 py-4 text-sm text-gray-600 max-w-md truncate">
                  {row.notes || "—"}
                </td>
                {isAdmin && (
                  <td className="px-5 py-4">
                    {showDeleted ? (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          restore(row.maintenanceEventUuid);
                        }}
                        className="flex items-center gap-1 text-sm text-green-700 hover:text-green-900 cursor-pointer"
                      >
                        <RotateCcw className="w-4 h-4" />
                        Restore
                      </button>
                    ) : (
                      <Pencil className="w-4 h-4 text-gray-400" />
                    )}
                  </td>
                )}
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={isAdmin ? 7 : 6} className="px-5 py-12 text-center text-gray-400">
                  <Wrench className="w-8 h-8 mx-auto mb-2 text-gray-300" />
                  No repairs found.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Admin edit modal — reuses the maintenance event form. A real Dialog
          (not a custom overlay) so the form's nested delete-confirm AlertDialog
          stacks above it instead of being hidden behind. */}
      {isAdmin && (
        <Dialog open={!!editingUuid} onOpenChange={(open) => !open && closeEdit()}>
          <DialogContent className="w-[95vw] sm:max-w-5xl max-h-[90vh] overflow-auto border-red-400 p-0">
            <DialogHeader className="px-4 pt-4">
              <DialogTitle className="text-sm">Edit Maintenance / Repair</DialogTitle>
            </DialogHeader>
            {editingUuid && <MaintenanceEventForm onCancel={closeEdit} />}
          </DialogContent>
        </Dialog>
      )}
    </>
  );
}
