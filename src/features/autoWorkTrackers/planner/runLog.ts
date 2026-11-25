import type { CompiledQuery } from "kysely";
import { db } from "@/components/providers/SystemProvider";
import type { PlannerSettings } from "./settings";
import type { PlanRows } from "./writePlan";

/** What a run records about itself (AutoWorkTrackerRuns). */
export type RunRecord = {
  id: string;
  createdAt: string;
  createdByUserUuid: string | null;
  zoneUuid: string;
  weekStart: string;
  autoKey: string;
  settings: PlannerSettings;
  /** The run's totals, as shown after Create. */
  result: Record<string, unknown>;
};

/** A trip as the model wrote it: the tracker's values and its line items (AutoWorkTrackerRunTrips.snapshot). */
export type TripSnapshot = {
  tracker: Record<string, unknown>;
  lineItems: Record<string, unknown>[];
};

/** The app version and the git commit a run ran on (from next.config.ts; no commit locally). */
export function codeVersion(): { appVersion: string | null; commitSha: string | null } {
  return {
    appVersion: process.env.NEXT_PUBLIC_APP_VERSION || null,
    commitSha: process.env.NEXT_PUBLIC_GIT_COMMIT_SHA || null,
  };
}

/** Each created tracker's snapshot: its values and its line items, as inserted. Pure. */
export function tripSnapshots(
  rows: PlanRows,
): { workTrackerUuid: string; snapshot: TripSnapshot }[] {
  return rows.trackers.map((t) => ({
    workTrackerUuid: t.id,
    snapshot: {
      tracker: { ...t },
      lineItems: rows.lineItems.filter((l) => l.work_tracker_uuid === t.id).map((l) => ({ ...l })),
    },
  }));
}

/**
 * The run's log, written in the same batch as its work trackers: the run first, then a snapshot row
 * per tracker it created (after the trackers in the batch is fine; the snapshot does not reference
 * them by foreign key).
 */
export function runStatements(
  run: RunRecord,
  rows: PlanRows,
  version = codeVersion(),
  newId: () => string = () => crypto.randomUUID(),
): { run: CompiledQuery; trips: CompiledQuery[] } {
  return {
    run: db
      .insertInto("AutoWorkTrackerRuns")
      .values({
        id: run.id,
        created_at: run.createdAt,
        created_by_user_uuid: run.createdByUserUuid,
        zone_uuid: run.zoneUuid,
        week_start: run.weekStart,
        auto_work_tracker_id: run.autoKey,
        app_version: version.appVersion,
        commit_sha: version.commitSha,
        settings: JSON.stringify(run.settings),
        result: JSON.stringify(run.result),
        trips_created: rows.trackers.length,
      })
      .compile(),
    trips: tripSnapshots(rows).map((t) =>
      db
        .insertInto("AutoWorkTrackerRunTrips")
        .values({
          id: newId(),
          created_at: run.createdAt,
          run_uuid: run.id,
          work_tracker_uuid: t.workTrackerUuid,
          snapshot: JSON.stringify(t.snapshot),
        })
        .compile(),
    ),
  };
}
