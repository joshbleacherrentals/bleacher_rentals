"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useMemo } from "react";
import { PageHeader } from "@/components/PageHeader";
import { Pagination } from "@/components/Pagination";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useTeamPermissions } from "@/features/manageTeam/hooks/useTeamPermissions";
import { canManageDamageAndMaintenance } from "@/features/userAccess/logic/canManageDamageAndMaintenance";
import { setMaintenanceEventDeleted } from "@/features/maintenanceEvents/db/deleteMaintenanceEvent";
import { useTimezoneStore } from "@/lib/useTimezoneStore";
import { useRepairFilterOptions } from "../hooks/useRepairFilterOptions";
import { useRepairList } from "../hooks/useRepairList";
import {
  buildRepairsView,
  narrowRepairsUrlState,
  readRepairsUrlState,
  writeRepairsUrlState,
  type RepairsUrlPatch,
  type RepairsUrlState,
} from "../utils/repairPageState";
import { nextRepairSort, type RepairSortKey } from "../utils/repairSort";
import { RepairsTable } from "./RepairsTable";
import { RepairsToolbar } from "./RepairsToolbar";
import { RepairsTotalsStrip } from "./RepairsTotalsStrip";

/**
 * The Repairs page: the totals strip, the Open and Completed tabs, the toolbar (search, four
 * filters, Show Deleted), the sortable table and the pager. Its whole state lives in the address.
 * It only reads; the one write is Restore in the Show Deleted view (an administrator or a
 * maintainer). docs/specs/repairs-04-table.md and docs/specs/repairs-05-toolbar.md.
 */
export default function RepairsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const timezone = useTimezoneStore((s) => s.timezone);

  // Show Deleted and Restore are for the same two roles as before (D41); the address cannot give
  // the other roles deleted repairs (D65).
  const { isAdmin, isMaintainer } = useTeamPermissions();
  const canManage = canManageDamageAndMaintenance({ isAdmin, isMaintainer });

  const urlState = useMemo(() => readRepairsUrlState(searchParams), [searchParams]);
  const showDeleted = canManage && urlState.showDeleted;

  const { rows, isLoading } = useRepairList({ showDeleted, timezone });
  const { options, isLoading: optionsLoading } = useRepairFilterOptions();
  const view = useMemo(() => buildRepairsView(rows, urlState), [rows, urlState]);

  // The page reads its state from the URL and writes it only when the person acts.
  const go = (next: RepairsUrlState) => {
    const query = writeRepairsUrlState(
      next,
      new URLSearchParams(searchParams.toString()),
    ).toString();
    router.replace(query ? `/repairs?${query}` : "/repairs", { scroll: false });
  };
  const change = (patch: RepairsUrlPatch) => go(narrowRepairsUrlState(urlState, patch));

  const restore = (repairId: string) => {
    // The function shows its own error toast; the catch only stops an unhandled rejection.
    void setMaintenanceEventDeleted(repairId, false).catch(() => {});
  };

  return (
    <>
      <PageHeader title="Repairs" subtitle="All maintenance and repair events across the fleet" />

      <RepairsTotalsStrip
        tab={urlState.tab}
        deleted={showDeleted}
        totals={isLoading ? null : view.totals}
      />

      <Tabs
        value={urlState.tab}
        onValueChange={(value) => change({ tab: value === "completed" ? "completed" : "open" })}
        className="mt-4"
      >
        <TabsList aria-label="Repairs">
          <TabsTrigger value="open">Open</TabsTrigger>
          <TabsTrigger value="completed">Completed</TabsTrigger>
        </TabsList>
      </Tabs>

      <RepairsToolbar
        search={urlState.search}
        bleacherUuids={urlState.bleacherUuids}
        zoneUuids={urlState.zoneUuids}
        vendorUuids={urlState.vendorUuids}
        categoryUuids={urlState.categoryUuids}
        options={options}
        optionsLoading={optionsLoading}
        canShowDeleted={canManage}
        showDeleted={showDeleted}
        onChange={change}
      />

      <div className="mt-3">
        <RepairsTable
          rows={view.pageRows}
          isLoading={isLoading}
          showRestore={showDeleted}
          onRestore={restore}
          sort={urlState.sort}
          onSort={(key: RepairSortKey) => change({ sort: nextRepairSort(urlState.sort, key) })}
        />
      </div>

      {!isLoading && (
        <Pagination
          page={view.currentPage}
          pageSize={urlState.pageSize}
          totalItems={view.totalItems}
          onPageChange={(page) => go({ ...urlState, page })}
          onPageSizeChange={(pageSize) => change({ pageSize })}
        />
      )}
    </>
  );
}
