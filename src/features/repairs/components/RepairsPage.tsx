"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";
import { PageHeader } from "@/components/PageHeader";
import { Pagination } from "@/components/Pagination";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useTeamPermissions } from "@/features/manageTeam/hooks/useTeamPermissions";
import { canManageDamageAndMaintenance } from "@/features/userAccess/logic/canManageDamageAndMaintenance";
import { useTimezoneStore } from "@/lib/useTimezoneStore";
import { restoreRepair } from "../db/repairWrite";
import { useRepairFilterOptions } from "../hooks/useRepairFilterOptions";
import { useCloseReportsFlow } from "../hooks/useCloseReportsFlow";
import { useRepairList } from "../hooks/useRepairList";
import { useRepairWindowsStore } from "../state/useRepairWindowsStore";
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
import { RepairWindowsHost } from "./RepairWindowsHost";
import { RepairsTable } from "./RepairsTable";
import { RepairsToolbar } from "./RepairsToolbar";
import { RepairsTotalsStrip } from "./RepairsTotalsStrip";

/**
 * The Repairs page: the totals strip, the Open and Completed tabs, the toolbar (search, four
 * filters, Show Deleted), the sortable table and the pager. The state of the list lives in the
 * address. Which repairs are open lives in React (spec 06 D81). The windows (the repair window, the
 * service window, the damage report window and the New repair window) are one stack in a store, each
 * over the one that opened it (spec 07 D95, D96), and the host draws them with every write of the
 * administrator and the maintainer: the status, the repair itself, its services, its files (spec 08,
 * 09a to 09b3). The Dashboard and the Damage Reports page open the same windows (spec 11).
 * docs/specs/repairs-04-table.md, docs/specs/repairs-05-toolbar.md,
 * docs/specs/repairs-06-expanded-row.md, docs/specs/repairs-07-repair-window.md §2.7,
 * docs/specs/repairs-08-status.md §2.1, docs/specs/repairs-09a-repair-writes.md §2.1 and §2.8,
 * docs/specs/repairs-09b1-services.md §2.8 and docs/specs/repairs-11-dashboard.md §2.7.
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

  // The windows are a stack in a store: a new one opens over the one that opened it, and the host below
  // draws them, found again in the whole list of this page on every render (spec 06 §2.5, spec 07 §2.7).
  const open = useRepairWindowsStore((s) => s.open);

  // The status menu of a row asks which damage reports to close when a repair moves into Completed
  // (spec 08a); this page draws the dialog for it, and the host draws its own for the windows.
  const { changeStatus, dialog: closeReportsDialog } = useCloseReportsFlow();

  // The page reads its state from the URL and writes it only when the person acts.
  const go = (next: RepairsUrlState) => {
    const query = writeRepairsUrlState(
      next,
      new URLSearchParams(searchParams.toString()),
    ).toString();
    router.replace(query ? `/repairs?${query}` : "/repairs", { scroll: false });
  };
  const change = (patch: RepairsUrlPatch) => go(narrowRepairsUrlState(urlState, patch));

  // Restore of the row: the duplicate check and the red toasts are the writer's (spec 09a D145); the
  // catch only stops an unhandled rejection.
  const restore = (repairId: string) => {
    const repair = rows.find((row) => row.id === repairId);
    if (!repair) return;
    return restoreRepair({
      repairId,
      vendorUuid: repair.vendorUuid,
      invoiceNumber: repair.invoiceNumber,
    });
  };

  return (
    <>
      <PageHeader
        title="Repairs"
        subtitle="All maintenance and repair events across the fleet"
        action={
          canManage ? (
            <button
              type="button"
              data-testid="new-repair"
              onClick={() => open({ kind: "new" })}
              className="cursor-pointer rounded-sm bg-darkBlue px-4 py-2 text-sm font-semibold text-white shadow-md transition hover:bg-lightBlue"
            >
              New repair
            </button>
          ) : undefined
        }
      />

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
          onRestore={(repairId) => void restore(repairId)?.catch(() => {})}
          sort={urlState.sort}
          onSort={(key: RepairSortKey) => change({ sort: nextRepairSort(urlState.sort, key) })}
          expandedIds={expandedIds}
          onToggleRepair={(repairId) => setExpansion(toggleRepair(reconciled, listKey, repairId))}
          onOpenService={(repairId, serviceId) => open({ kind: "service", repairId, serviceId })}
          onOpenReports={(reported) => open({ kind: "reports", reported })}
          onOpenRepair={(repairId) => open({ kind: "repair", repairId })}
          onAddService={
            canManage ? (repairId) => open({ kind: "newService", repairId }) : undefined
          }
          onChangeStatus={canManage ? changeStatus : undefined}
        />
      </div>

      <RepairWindowsHost rows={rows} />
      {closeReportsDialog}

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
