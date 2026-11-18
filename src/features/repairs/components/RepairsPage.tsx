"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";
import { Trash2 } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { Pagination } from "@/components/Pagination";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useBleacherOptions } from "@/features/qualityAssurance/hooks/useFilterOptions";
import { useTeamPermissions } from "@/features/manageTeam/hooks/useTeamPermissions";
import { canManageDamageAndMaintenance } from "@/features/userAccess/logic/canManageDamageAndMaintenance";
import { setMaintenanceEventDeleted } from "@/features/maintenanceEvents/db/deleteMaintenanceEvent";
import { useTimezoneStore } from "@/lib/useTimezoneStore";
import { useRepairList } from "../hooks/useRepairList";
import {
  buildRepairsView,
  narrowRepairsUrlState,
  readRepairsUrlState,
  writeRepairsUrlState,
  type RepairsUrlState,
} from "../utils/repairPageState";
import { RepairsTable } from "./RepairsTable";
import { RepairsTotalsStrip } from "./RepairsTotalsStrip";

/**
 * The Repairs page: the totals strip, the Open and Completed tabs, the table and the pager. It only
 * reads; the one write is Restore in the Show Deleted view (an administrator or a maintainer).
 * docs/specs/repairs-04-table.md.
 */
export default function RepairsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const timezone = useTimezoneStore((s) => s.timezone);

  // Show Deleted and Restore are for the same two roles as before (D41).
  const { isAdmin, isMaintainer } = useTeamPermissions();
  const canManage = canManageDamageAndMaintenance({ isAdmin, isMaintainer });
  const [showDeleted, setShowDeleted] = useState(false);

  const urlState = useMemo(() => readRepairsUrlState(searchParams), [searchParams]);
  const bleachers = useBleacherOptions();
  const { rows, isLoading } = useRepairList({ showDeleted, timezone });
  const view = useMemo(() => buildRepairsView(rows, urlState), [rows, urlState]);

  // The page reads its state from the URL and writes it only when the person acts (§2.6).
  const go = (next: RepairsUrlState) => {
    const query = writeRepairsUrlState(
      next,
      new URLSearchParams(searchParams.toString()),
    ).toString();
    router.replace(query ? `/repairs?${query}` : "/repairs", { scroll: false });
  };

  const subtitle = useMemo(() => {
    if (!urlState.bleacherUuid) return "All maintenance and repair events across the fleet";
    const num = bleachers.find((b) => b.uuid === urlState.bleacherUuid)?.bleacherNumber;
    return num != null ? `Showing for Bleacher #${num}` : "Showing for selected bleacher";
  }, [urlState.bleacherUuid, bleachers]);

  const restore = (repairId: string) => {
    // The function shows its own error toast; the catch only stops an unhandled rejection.
    void setMaintenanceEventDeleted(repairId, false).catch(() => {});
  };

  return (
    <>
      <PageHeader title="Repairs" subtitle={subtitle} />

      <RepairsTotalsStrip tab={urlState.tab} totals={isLoading ? null : view.totals} />

      <Tabs
        value={urlState.tab}
        onValueChange={(value) =>
          go(narrowRepairsUrlState(urlState, { tab: value === "completed" ? "completed" : "open" }))
        }
        className="mt-4"
      >
        <TabsList aria-label="Repairs">
          <TabsTrigger value="open">Open</TabsTrigger>
          <TabsTrigger value="completed">Completed</TabsTrigger>
        </TabsList>
      </Tabs>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <select
          aria-label="Bleacher"
          value={urlState.bleacherUuid ?? ""}
          onChange={(e) =>
            go(narrowRepairsUrlState(urlState, { bleacherUuid: e.target.value || null }))
          }
          className="h-9 rounded-md border border-gray-300 bg-white px-3 text-sm"
        >
          <option value="">All bleachers</option>
          {bleachers.map((b) => (
            <option key={b.uuid} value={b.uuid}>
              Bleacher #{b.bleacherNumber ?? "?"}
            </option>
          ))}
        </select>

        {canManage && (
          <button
            type="button"
            onClick={() => {
              setShowDeleted((v) => !v);
              go(narrowRepairsUrlState(urlState, {}));
            }}
            className={`ml-auto flex h-9 cursor-pointer items-center gap-1.5 rounded-md border px-3 text-sm font-medium transition ${
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

      <div className="mt-3">
        <RepairsTable
          rows={view.pageRows}
          isLoading={isLoading}
          showRestore={canManage && showDeleted}
          onRestore={restore}
        />
      </div>

      {!isLoading && (
        <Pagination
          page={view.currentPage}
          pageSize={urlState.pageSize}
          totalItems={view.totalItems}
          onPageChange={(page) => go({ ...urlState, page })}
          onPageSizeChange={(pageSize) => go(narrowRepairsUrlState(urlState, { pageSize }))}
        />
      )}
    </>
  );
}
