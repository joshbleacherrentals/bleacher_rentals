import { db } from "@/components/providers/SystemProvider";

export type FeedbackKind = "edit" | "delete" | "discard";

/**
 * The run a work tracker came from, if the model made it in a run that was not discarded: the
 * trackers whose edits and deletions teach us something.
 */
export function activeRunTripQuery(workTrackerUuid: string) {
  return db
    .selectFrom("AutoWorkTrackerRunTrips as rt")
    .innerJoin("AutoWorkTrackerRuns as r", "r.id", "rt.run_uuid")
    .select(["rt.id as run_trip_uuid", "r.id as run_uuid"])
    .where("rt.work_tracker_uuid", "=", workTrackerUuid)
    .where("r.discarded_at", "is", null)
    .orderBy("r.created_at", "desc")
    .limit(1)
    .compile();
}

/** The zone and week's runs that are not discarded yet (by the key they stamped). */
export function openRunsQuery(autoKey: string) {
  return db
    .selectFrom("AutoWorkTrackerRuns")
    .select("id")
    .where("auto_work_tracker_id", "=", autoKey)
    .where("discarded_at", "is", null)
    .compile();
}

/** Marks the zone and week's open runs discarded: their drafts were bulk deleted. */
export function discardRunsStatement(autoKey: string, userUuid: string | null, now: string) {
  return db
    .updateTable("AutoWorkTrackerRuns")
    .set({ discarded_at: now, discarded_by_user_uuid: userUuid })
    .where("auto_work_tracker_id", "=", autoKey)
    .where("discarded_at", "is", null)
    .compile();
}

/**
 * Records why someone changed the model's work: an edit or deletion of one of its trips, or a
 * discarded run. Null when no reason was given (the question is optional).
 */
export function feedbackStatement(input: {
  kind: FeedbackKind;
  reason: string;
  runUuid: string;
  runTripUuid?: string | null;
  workTrackerUuid?: string | null;
  userUuid: string | null;
  id?: string;
  now?: string;
}) {
  const reason = input.reason.trim();
  if (!reason) return null;
  return db
    .insertInto("AutoWorkTrackerFeedback")
    .values({
      id: input.id ?? crypto.randomUUID(),
      created_at: input.now ?? new Date().toISOString(),
      created_by_user_uuid: input.userUuid,
      run_uuid: input.runUuid,
      run_trip_uuid: input.runTripUuid ?? null,
      work_tracker_uuid: input.workTrackerUuid ?? null,
      kind: input.kind,
      reason,
    })
    .compile();
}
