import { NEAR_LIMIT_RATIO, SYNC_BUCKET_LIMIT } from "../constants";

/** One DriverSyncHealth row joined to its DriverSyncHealthUsers name. */
export type SyncHealthSourceRow = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  app_version: string | null;
  app_platform: string | null;
  bucket_count: number | null;
  sync_version: number | null;
  bucket_count_reported_at: string | null;
};

export type SyncHealthRow = {
  driverId: string;
  name: string;
  /** NULL: this driver's build has never reported. Not the same as 0. */
  bucketCount: number | null;
  limit: number;
  percentOfLimit: number | null;
  isNearLimit: boolean;
  hasReport: boolean;
  appVersion: string | null;
  appPlatform: string | null;
  syncVersion: number | null;
  reportedAt: string | null;
};

function driverName(first: string | null, last: string | null): string {
  const name = [first, last]
    .filter((part) => part && part.trim())
    .join(" ")
    .trim();
  return name || "Unknown driver";
}

function toRow(source: SyncHealthSourceRow): SyncHealthRow {
  const count = source.bucket_count;
  const hasReport = count !== null;
  return {
    driverId: source.id,
    name: driverName(source.first_name, source.last_name),
    bucketCount: count,
    limit: SYNC_BUCKET_LIMIT,
    percentOfLimit: hasReport ? Math.round((count / SYNC_BUCKET_LIMIT) * 100) : null,
    isNearLimit: hasReport && count >= SYNC_BUCKET_LIMIT * NEAR_LIMIT_RATIO,
    hasReport,
    appVersion: source.app_version,
    appPlatform: source.app_platform,
    syncVersion: source.sync_version,
    reportedAt: source.bucket_count_reported_at,
  };
}

/** Biggest count first; drivers with no report after all reports, by name. */
function compareRows(a: SyncHealthRow, b: SyncHealthRow): number {
  if (a.hasReport !== b.hasReport) return a.hasReport ? -1 : 1;
  const byCount = (b.bucketCount ?? 0) - (a.bucketCount ?? 0);
  return byCount !== 0 ? byCount : a.name.localeCompare(b.name);
}

export function buildSyncHealthRows(sources: SyncHealthSourceRow[]): SyncHealthRow[] {
  return sources.map(toRow).sort(compareRows);
}
