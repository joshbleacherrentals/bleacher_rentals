"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";
import { PageHeader } from "@/components/PageHeader";
import { Pagination } from "@/components/Pagination";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useTeamPermissions } from "@/features/manageTeam/hooks/useTeamPermissions";
import { canManageDamageAndMaintenance } from "@/features/userAccess/logic/canManageDamageAndMaintenance";
import { useTimezoneStore } from "@/lib/useTimezoneStore";
import { changeRepairStatus } from "../db/repairStatusWrite";
import { createRepair, deleteRepair, restoreRepair, updateRepair } from "../db/repairWrite";
import { findServiceZoneConflict } from "../db/repairLinkWrite";
import { createService, deleteService, updateService } from "../db/serviceWrite";
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
import type { RepairListRow, RepairService, RepairStatus } from "../utils/repairRows";
import { nextRepairSort, type RepairSortKey } from "../utils/repairSort";
import { DamageReportWindow } from "./DamageReportWindow";
import { NewRepairWindow, RepairWindow, type RepairEditing } from "./RepairWindow";
import { RepairsTable } from "./RepairsTable";
import { RepairsToolbar } from "./RepairsToolbar";
import { RepairsTotalsStrip } from "./RepairsTotalsStrip";
import { NewServiceWindow, ServiceWindow, type ServiceEditing } from "./ServiceWindow";

/**
 * The Repairs page: the totals strip, the Open and Completed tabs, the toolbar (search, four
 * filters, Show Deleted), the sortable table and the pager. The state of the list lives in the
 * address. Which repairs are open lives in React (spec 06 D81), and so do the windows: the repair
 * window, the service window and the damage report window are one stack, each over the one that
 * opened it (spec 07 D95, D96). It writes, for an administrator or a maintainer: the status chosen in
 * the menu of a pill (spec 08 D110, D111), and the repair itself, from the New repair button and from
 * the repair window: Add, Edit, Delete and Restore (spec 09a D124 to D145), and the services of a repair:
 * Add service, Edit and Delete (spec 09b1 D158 to D165), which also keep the repair's bleachers, zone
 * and damage report links (spec 09b2). docs/specs/repairs-04-table.md,
 * docs/specs/repairs-05-toolbar.md, docs/specs/repairs-06-expanded-row.md,
 * docs/specs/repairs-07-repair-window.md §2.7, docs/specs/repairs-08-status.md §2.1 and
 * docs/specs/repairs-09a-repair-writes.md §2.1 and §2.8 and docs/specs/repairs-09b1-services.md §2.8.
 */
export default function RepairsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const timezone = useTimezoneStore((s) => s.timezone);

  // Show Deleted and Restore are for the same two roles as before (D41); the address cannot give
  // the other roles deleted repairs (D65).
  const { isAdmin, isMaintainer, userId } = useTeamPermissions();
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

  // Restore of the row and of the window: the duplicate check and the red toasts are the writer's
  // (spec 09a D145); the catch only stops an unhandled rejection.
  const restore = (repairId: string) => {
    const repair = rows.find((row) => row.id === repairId);
    if (!repair) return;
    return restoreRepair({
      repairId,
      vendorUuid: repair.vendorUuid,
      invoiceNumber: repair.invoiceNumber,
    });
  };

  // What the repair window gets for an administrator or a maintainer (D124). `repair` is the row as
  // the page holds it at this render, so `liveStatus` and `reported` are the newest (D135).
  const editingFor = (repair: RepairListRow): RepairEditing | undefined =>
    canManage
      ? {
          vendors: options.vendor,
          bleachers: options.bleacher,
          categories: options.category,
          onSave: (initial, values, services) =>
            updateRepair({
              repairId: repair.id,
              initial,
              values,
              services,
              liveStatus: repair.status,
              reported: repair.reported,
              now: new Date().toISOString(),
              timezone,
            }),
          onDelete: () => deleteRepair(repair.id),
          onRestore: async () => {
            await restore(repair.id);
          },
          onAddService: () => open({ kind: "newService", repairId: repair.id }),
          onOpenServiceReports: (reported) => open({ kind: "reports", reported }),
          checkServiceZone: (input) => findServiceZoneConflict({ repairId: repair.id, ...input }),
        }
      : undefined;

  // What the service window gets for an administrator or a maintainer: a service that is not deleted of
  // a repair that is not deleted (spec 09b1 D157, D165). The writers show their own error toasts.
  const serviceEditingFor = (
    repair: RepairListRow,
    service: RepairService,
  ): ServiceEditing | undefined =>
    canManage && !repair.deleted && !service.deleted
      ? {
          bleachers: options.bleacher,
          categories: options.category,
          onSave: (initial, values) =>
            updateService({
              serviceId: service.id,
              initial,
              values,
              repairId: repair.id,
              now: new Date().toISOString(),
              timezone,
            }),
          onDelete: () =>
            deleteService({
              serviceId: service.id,
              repairId: repair.id,
              now: new Date().toISOString(),
              timezone,
            }),
        }
      : undefined;

  // One clock reading is the moment of the whole change (D112, D116). The function shows its own
  // error toast (D119); the catch only stops an unhandled rejection.
  const changeStatus = (repair: RepairListRow, to: RepairStatus) => {
    void changeRepairStatus({
      repairId: repair.id,
      from: repair.status,
      to,
      reported: repair.reported,
      now: new Date().toISOString(),
    }).catch(() => {});
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

      {windows.map((w) => {
        if (w.kind === "new") {
          return (
            <NewRepairWindow
              key={w.index}
              vendors={options.vendor}
              bleachers={options.bleacher}
              categories={options.category}
              onCreate={(values, services) =>
                createRepair({
                  values,
                  services,
                  createdByUserUuid: userId,
                  now: new Date().toISOString(),
                  timezone,
                })
              }
              checkServiceZone={(input) => findServiceZoneConflict({ repairId: null, ...input })}
              onClose={() => close(w.index)}
            />
          );
        }
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
              onChangeStatus={canManage ? (to) => changeStatus(w.repair, to) : undefined}
              editing={editingFor(w.repair)}
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
              editing={serviceEditingFor(w.repair, w.service)}
            />
          );
        }
        if (w.kind === "newService") {
          return (
            <NewServiceWindow
              key={w.index}
              repair={w.repair}
              bleachers={options.bleacher}
              categories={options.category}
              onCreate={(values) =>
                createService({
                  repairId: w.repair.id,
                  values,
                  now: new Date().toISOString(),
                  timezone,
                })
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
