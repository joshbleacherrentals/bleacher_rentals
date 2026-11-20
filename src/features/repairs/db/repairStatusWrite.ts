import React from "react";
import type { CompiledQuery } from "kysely";
import { toast } from "sonner";
import { ErrorToast } from "@/components/toasts/ErrorToast";
import { db } from "@/components/providers/SystemProvider";
import { typedExecuteBatch } from "@/lib/powersync/typedQuery";
import type { RepairStatus, ReportedReport } from "../utils/repairRows";
import { reportIdsToClose, statusPatch } from "../utils/repairStatus";

/**
 * The one writer of the status of a repair: local-first, through the app's Kysely and one local
 * transaction (docs/POWERSYNC_ARCHITECTURE.md). The statements are built apart from the run so that
 * they are tested on SQLite. docs/specs/repairs-08-status.md §2.3 and §3 (D112 to D117, D119).
 */

export type StatusChange = {
  repairId: string;
  from: string;
  to: RepairStatus;
  reported: readonly ReportedReport[];
  now: string; // an ISO timestamp: one reading of the clock for the whole change
};

/**
 * The compiled statements of a change, in the order they run: the repair, then the reports. An
 * empty list when nothing is to be written. A report that is already closed is never changed: the
 * statement carries `resolved_at IS NULL`, as `createMaintenanceEvent` does (D116).
 */
export function buildStatusStatements(change: StatusChange): CompiledQuery[] {
  const patch = statusPatch(change.from, change.to, change.now);
  if (!patch) return [];

  const statements: CompiledQuery[] = [
    db
      .updateTable("MaintenanceEvents")
      .set({
        status: patch.status,
        ...(patch.completedAt !== undefined ? { completed_at: patch.completedAt } : {}),
      })
      .where("id", "=", change.repairId)
      .compile(),
  ];

  const reportIds = reportIdsToClose(change.from, change.to, change.reported);
  if (reportIds.length > 0) {
    statements.push(
      db
        .updateTable("DamageReports")
        .set({ resolved_at: change.now, maintenance_event_uuid: change.repairId })
        .where("id", "in", reportIds)
        .where("resolved_at", "is", null)
        .compile(),
    );
  }

  return statements;
}

/**
 * Runs the statements of a change with `typedExecuteBatch`: atomic, so nothing is half written. A
 * success shows nothing (D114); an error shows a red toast and is thrown again (D119), so the
 * caller only has to stop an unhandled rejection.
 */
export async function changeRepairStatus(change: StatusChange): Promise<void> {
  const statements = buildStatusStatements(change);
  if (statements.length === 0) return;

  try {
    await typedExecuteBatch(statements);
  } catch (e) {
    toast.custom(
      (t) =>
        React.createElement(ErrorToast, {
          id: t,
          lines: ["Failed to change the status.", String(e)],
        }),
      { duration: 10000 },
    );
    throw e;
  }
}
