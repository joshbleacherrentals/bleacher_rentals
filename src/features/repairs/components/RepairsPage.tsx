"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";
import { PageHeader } from "@/components/PageHeader";
import { Pagination } from "@/components/Pagination";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useTeamPermissions } from "@/features/manageTeam/hooks/useTeamPermissions";
import { canManageDamageAndMaintenance } from "@/features/userAccess/logic/canManageDamageAndMaintenance";
import { setMaintenanceEventDeleted } from "@/features/maintenanceEvents/db/deleteMaintenanceEvent";
import { useTimezoneStore } from "@/lib/useTimezoneStore";
import { useRepairFilterOptions } from "../hooks/useRepairFilterOptions";
import { useRepairList } from "../hooks/useRepairList";
import { closeFrom, openWindow, resolveWindows, type WindowEntry } from "../utils/repairDetails";
import {
  NO_EXPANSION,
  openRepairIds,
  reconcileExpansion,
  repairsListKey,
  toggleRepair,
} from "../utils/repairExpand";
import {
  buildRepairsView,
  narrowRepairsUrlState,
  readRepairsUrlState,
  writeRepairsUrlState,
  type RepairsUrlPatch,
  type RepairsUrlState,
} from "../utils/repairPageState";
import { nextRepairSort, type RepairSortKey } from "../utils/repairSort";
import { DamageReportWindow } from "./DamageReportWindow";
import { RepairWindow } from "./RepairWindow";
import { RepairsTable } from "./RepairsTable";
import { RepairsToolbar } from "./RepairsToolbar";
import { RepairsTotalsStrip } from "./RepairsTotalsStrip";
import { ServiceWindow } from "./ServiceWindow";

/**
 * The Repairs page: the totals strip, the Open and Completed tabs, the toolbar (search, four
 * filters, Show Deleted), the sortable table and the pager. The state of the list lives in the
 * address. Which repairs are open lives in React (spec 06 D81), and so do the windows: the repair
 * window, the service window and the damage report window are one stack, each over the one that
 * opened it (spec 07 D95, D96). It only reads; the one write is Restore in the Show Deleted view (an
 * administrator or a maintainer). docs/specs/repairs-04-table.md, docs/specs/repairs-05-toolbar.md,
 * docs/specs/repairs-06-expanded-row.md and docs/specs/repairs-07-repair-window.md §2.7.
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

  // The open repairs belong to the state of the list: any change of it closes them all (D82). The
  // page forgets them while it renders, so coming back to the same view does not bring them back.
  const listKey = repairsListKey(urlState);
  const [expansion, setExpansion] = useState(NO_EXPANSION);
  const reconciled = reconcileExpansion(expansion, listKey);
  if (reconciled !== expansion) setExpansion(reconciled);
  const expandedIds = openRepairIds(reconciled, listKey);

  // The windows are a stack: a new one opens over the one that opened it. They are found again in
  // the whole list on every render, so they show the newest values; one whose repair or service is
  // no longer in the list is not drawn (spec 06 §2.5, spec 07 §2.7).
  const [stack, setStack] = useState<WindowEntry[]>([]);
  const windows = resolveWindows(rows, stack);
  const open = (entry: WindowEntry) => setStack(openWindow(stack, entry));
  const close = (index: number) => setStack(closeFrom(stack, index));

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
          expandedIds={expandedIds}
          onToggleRepair={(repairId) => setExpansion(toggleRepair(reconciled, listKey, repairId))}
          onOpenService={(repairId, serviceId) => open({ kind: "service", repairId, serviceId })}
          onOpenReports={(reported) => open({ kind: "reports", reported })}
          onOpenRepair={(repairId) => open({ kind: "repair", repairId })}
        />
      </div>

      {windows.map((w) => {
        if (w.kind === "repair") {
          return (
            <RepairWindow
              key={w.index}
              repair={w.repair}
              onOpenService={(serviceId) =>
                open({ kind: "service", repairId: w.repair.id, serviceId })
              }
              onOpenReports={() => open({ kind: "reports", reported: w.repair.reported })}
              onClose={() => close(w.index)}
            />
          );
        }
        if (w.kind === "service") {
          return (
            <ServiceWindow
              key={w.index}
              repair={w.repair}
              service={w.service}
              onOpenReports={() => open({ kind: "reports", reported: w.service.reported })}
              onOpenRepair={
                w.showOpenRepair ? () => open({ kind: "repair", repairId: w.repair.id }) : undefined
              }
              onClose={() => close(w.index)}
            />
          );
        }
        return (
          <DamageReportWindow key={w.index} reported={w.reported} onClose={() => close(w.index)} />
        );
      })}

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
