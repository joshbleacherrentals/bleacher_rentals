import React from "react";
import type { CompiledQuery } from "kysely";
import { toast } from "sonner";
import { ErrorToast } from "@/components/toasts/ErrorToast";
import { db } from "@/components/providers/SystemProvider";
import { typedExecuteBatch } from "@/lib/powersync/typedQuery";
import type { RepairStatus } from "../utils/repairRows";
import { statusPatch } from "../utils/repairStatus";

/**
 * The one writer of the status of a repair: local-first, through the app's Kysely and one local
 * transaction (docs/POWERSYNC_ARCHITECTURE.md). The statements are built apart from the run so that
 * they are tested on SQLite. docs/specs/repairs-08-status.md §2.3 and §3 (D112 to D117, D119), as
 * amended by docs/specs/repairs-08a-choose-reports-to-close.md §2.4 and §3 (D238 to D244): the reports a
 * move into Completed closes or unlinks are the ones the person chose, not a list found here.
 */

export type StatusChange = {
  repairId: string;
  from: string;
  to: RepairStatus;
  /** Linked open reports whose switch was on: closed with `resolved_at` = `now` (D239, D240). */
  closeLinkedIds: readonly string[];
  /** Linked open reports whose switch was off: stay open, the link is cleared (D244). */
  unlinkLinkedIds: readonly string[];
  now: string; // an ISO timestamp: one reading of the clock for the whole change
};

/**
 * The compiled statements of a change, in the order they run: the repair, the closing of the chosen
 * reports, then the unlinking of the ones kept open. An empty list when nothing is to be written. Only a
 * move into Completed from another status uses the two lists (D249). Every report statement carries
 * `resolved_at IS NULL` and the link to this repair, so a report that someone else closed or linked
 * elsewhere meanwhile is never changed.
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

  const intoCompleted = change.to === "completed" && change.from !== "completed";
  if (intoCompleted && change.closeLinkedIds.length > 0) {
    statements.push(
      db
        .updateTable("DamageReports")
        .set({ resolved_at: change.now })
        .where("id", "in", [...change.closeLinkedIds])
        .where("maintenance_event_uuid", "=", change.repairId)
        .where("resolved_at", "is", null)
        .compile(),
    );
  }
  if (intoCompleted && change.unlinkLinkedIds.length > 0) {
    statements.push(
      db
        .updateTable("DamageReports")
        .set({ maintenance_event_uuid: null })
        .where("id", "in", [...change.unlinkLinkedIds])
        .where("maintenance_event_uuid", "=", change.repairId)
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
