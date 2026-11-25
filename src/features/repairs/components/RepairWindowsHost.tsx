"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo } from "react";
import { createErrorToastNoThrow } from "@/components/toasts/ErrorToast";
import { useTeamPermissions } from "@/features/manageTeam/hooks/useTeamPermissions";
import { canManageDamageAndMaintenance } from "@/features/userAccess/logic/canManageDamageAndMaintenance";
import { useTimezoneStore } from "@/lib/useTimezoneStore";
import { useClerkSupabaseClient } from "@/utils/supabase/useClerkSupabaseClient";
import { makeRepairFilesClient, saveRepairFiles } from "../db/repairFileWrite";
import { createRepair, deleteRepair, restoreRepair, updateRepair } from "../db/repairWrite";
import { findServiceZoneConflict } from "../db/repairLinkWrite";
import { createService, deleteService, updateService } from "../db/serviceWrite";
import { useCloseReportsFlow } from "../hooks/useCloseReportsFlow";
import { useRepairFilterOptions } from "../hooks/useRepairFilterOptions";
import { useRepairList } from "../hooks/useRepairList";
import { useRepairWindowsStore } from "../state/useRepairWindowsStore";
import { bleachersAfterServiceChange, liveServiceBleachers } from "../utils/closeReports";
import { resolveWindows } from "../utils/repairDetails";
import { filesFailureLines, isFilesDraftChanged, type FilesDraft } from "../utils/repairFiles";
import { liveBleachersOfDraft } from "../utils/repairLinks";
import type { RepairListRow, RepairService } from "../utils/repairRows";
import { DamageReportWindow } from "./DamageReportWindow";
import { NewRepairWindow, RepairWindow, type RepairEditing } from "./RepairWindow";
import { NewServiceWindow, ServiceWindow, type ServiceEditing } from "./ServiceWindow";

export type RepairWindowsHostProps = {
  /**
   * The rows the page already holds (the Repairs page, which may show deleted repairs). Without them
   * the host reads the live repairs itself, and only while a window is open.
   */
  rows?: readonly RepairListRow[];
};

/**
 * Draws the stack of repair windows: the repair window, the service window, the New service window,
 * the damage report window and the New repair window, each over the one that opened it (spec 07 D95,
 * D96). Each page mounts it once (the Repairs page, the Dashboard and the Damage Reports page); the
 * windows are opened through `useRepairWindowsStore`. While the stack is empty it draws nothing and
 * reads nothing; when it unmounts it empties the stack, so a window does not come back on another page.
 * docs/specs/repairs-11-dashboard.md §2.7 and §3.
 */
export function RepairWindowsHost({ rows }: RepairWindowsHostProps) {
  const hasWindows = useRepairWindowsStore((s) => s.stack.length > 0);
  const reset = useRepairWindowsStore((s) => s.reset);
  useEffect(() => reset, [reset]);

  if (!hasWindows) return null;
  return rows ? <RepairWindowsView rows={rows} /> : <RepairWindowsOwnRows />;
}

/** The host of a page that does not hold the rows: the live repairs, read while a window is open. */
function RepairWindowsOwnRows() {
  const timezone = useTimezoneStore((s) => s.timezone);
  const { rows } = useRepairList({ showDeleted: false, timezone });
  return <RepairWindowsView rows={rows} />;
}

/**
 * What a service write tells the flow: the repair keeps its status, and the bleachers of its live
 * services change by the one service that is added (`removed` is null) or moved (08a D246).
 */
function serviceClosingInput(repair: RepairListRow, removed: string | null, added: string | null) {
  const before = liveServiceBleachers(repair);
  return {
    repairId: repair.id,
    fromStatus: repair.status,
    toStatus: repair.status,
    eventEnd: repair.eventEnd,
    bleachersBefore: before,
    bleachersAfter: bleachersAfterServiceChange(before, { removed, added }),
  };
}

function RepairWindowsView({ rows }: { rows: readonly RepairListRow[] }) {
  const timezone = useTimezoneStore((s) => s.timezone);
  const stack = useRepairWindowsStore((s) => s.stack);
  const open = useRepairWindowsStore((s) => s.open);
  const close = useRepairWindowsStore((s) => s.close);

  // An administrator and a maintainer write (spec 09a D124); everyone else reads.
  const { isAdmin, isMaintainer, userId } = useTeamPermissions();
  const canManage = canManageDamageAndMaintenance({ isAdmin, isMaintainer });

  // The files of a repair go straight to Supabase, after the local write of a Save (spec 09b3).
  const supabase = useClerkSupabaseClient();
  const queryClient = useQueryClient();
  const filesClient = useMemo(() => makeRepairFilesClient(supabase), [supabase]);

  const { options } = useRepairFilterOptions();

  // Asks which damage reports to close when a write puts a repair into Completed, or puts a bleacher on
  // a Completed repair, and draws the dialog (spec 08a). The writers call `chooseClosing` after their
  // validation; a Cancel rejects it and the window stays as it is.
  const { changeStatus, chooseClosing, dialog: closeReportsDialog } = useCloseReportsFlow();

  // The windows are found again in the whole list on every render, so they show the newest values; one
  // whose repair or service is no longer in the list is not drawn (spec 06 §2.5, spec 07 §2.7).
  const windows = resolveWindows(rows, stack);

  // The network part of a Save (spec 09b3 §2.4 steps 3 to 6): the files of the draft, after the local
  // write. Nothing to do for a draft with no change. It never throws; a failure is one red toast
  // (D194, D195) and the window leaves as after any Save.
  const saveFiles = async (repairId: string, files: FilesDraft) => {
    if (!isFilesDraftChanged(files)) return;
    const result = await saveRepairFiles({
      client: filesClient,
      repairId,
      added: files.added,
      removed: files.removed,
    });
    await queryClient.invalidateQueries({ queryKey: ["repair-files", repairId] });
    const lines = filesFailureLines(result, "save");
    if (lines) createErrorToastNoThrow(lines);
  };

  // What the repair window gets for an administrator or a maintainer (D124). `repair` is the row as
  // the host holds it at this render, so `liveStatus` and `reported` are the newest (D135).
  const editingFor = (repair: RepairListRow): RepairEditing | undefined =>
    canManage
      ? {
          vendors: options.vendor,
          bleachers: options.bleacher,
          categories: options.category,
          onSave: async (initial, values, services, files) => {
            const errors = await updateRepair({
              repairId: repair.id,
              initial,
              values,
              services,
              liveStatus: repair.status,
              now: new Date().toISOString(),
              timezone,
              chooseClosing: () =>
                chooseClosing({
                  repairId: repair.id,
                  fromStatus: repair.status,
                  toStatus: values.status,
                  eventEnd: values.eventEnd || null,
                  bleachersBefore: liveServiceBleachers(repair),
                  bleachersAfter: liveBleachersOfDraft(services),
                }),
            });
            if (errors) return errors;
            await saveFiles(repair.id, files);
            return null;
          },
          onDelete: () => deleteRepair(repair.id),
          // Restore of the window: the duplicate check and the red toasts are the writer's (spec 09a
          // D145); the catch only stops an unhandled rejection.
          onRestore: async () => {
            await restoreRepair({
              repairId: repair.id,
              vendorUuid: repair.vendorUuid,
              invoiceNumber: repair.invoiceNumber,
            });
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
              chooseClosing: () =>
                chooseClosing(
                  serviceClosingInput(repair, initial.bleacherUuid, values.bleacherUuid),
                ),
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

  return (
    <>
      {closeReportsDialog}
      {windows.map((w) => {
        if (w.kind === "new") {
          // A repair is made only by an administrator or a maintainer, whoever asked for the window.
          if (!canManage) return null;
          return (
            <NewRepairWindow
              key={w.index}
              vendors={options.vendor}
              bleachers={options.bleacher}
              categories={options.category}
              preset={w.preset}
              onCreate={async (values, services, files) => {
                const id = crypto.randomUUID();
                const errors = await createRepair({
                  id,
                  values,
                  services,
                  createdByUserUuid: userId,
                  now: new Date().toISOString(),
                  timezone,
                  chooseClosing: () =>
                    chooseClosing({
                      repairId: null,
                      fromStatus: null,
                      toStatus: values.status,
                      eventEnd: values.eventEnd || null,
                      bleachersBefore: [],
                      bleachersAfter: liveBleachersOfDraft(services),
                    }),
                });
                if (errors) return errors;
                await saveFiles(id, files);
                return null;
              }}
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
                  chooseClosing: () =>
                    chooseClosing(serviceClosingInput(w.repair, null, values.bleacherUuid)),
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
    </>
  );
}
