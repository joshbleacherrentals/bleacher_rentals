import { expect, typedGetAll } from "@/lib/powersync/typedQuery";
import type { AuditRange } from "../utils/auditRange";
import { toAuditRow, type AuditTrackerResultRow, type AuditTrackerRow } from "../utils/auditRows";
import { buildAuditTrackersExportQuery } from "./auditTrackers";

/**
 * Every one of a driver's trackers in the range, read once from the local database when the Export
 * to CSV button is clicked. The driver page itself only holds one page of them.
 */
export async function loadAuditTrackersForExport(
  driverUuid: string,
  range: AuditRange,
): Promise<AuditTrackerRow[]> {
  const rows = await typedGetAll(
    buildAuditTrackersExportQuery(driverUuid, range),
    expect<AuditTrackerResultRow>(),
  );
  return rows.map(toAuditRow);
}
