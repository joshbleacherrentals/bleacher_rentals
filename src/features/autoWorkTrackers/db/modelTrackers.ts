import type { CompiledQuery } from "kysely";
import { db } from "@/components/providers/SystemProvider";
import { weekEndOf } from "../utils/week";
import { OFF_STATUSES } from "./tripsNeeded";

/**
 * The work trackers counted on the Auto Work Trackers panel: the ones the model made for this zone
 * and week (by key), and the live ones on the zone's bleachers dated in the week.
 */
export function weekTrackersQuery(zoneId: string, weekStart: string, key: string) {
  const weekEnd = weekEndOf(weekStart);
  return db
    .selectFrom("WorkTrackers as w")
    .leftJoin("Bleachers as b", "b.id", "w.bleacher_uuid")
    .select(["w.id as id", "w.auto_work_tracker_id as auto_work_tracker_id", "w.status as status"])
    .where((eb) =>
      eb.or([
        eb("w.auto_work_tracker_id", "=", key),
        eb.and([
          eb("b.zone_uuid", "=", zoneId),
          eb("b.deleted", "=", 0),
          eb("w.date", ">=", weekStart),
          eb("w.date", "<=", weekEnd),
          eb.or([eb("w.status", "is", null), eb("w.status", "not in", OFF_STATUSES)]),
        ]),
      ]),
    )
    .compile();
}

/**
 * Deletes the model's drafts for a zone and week: their line items, then the work trackers. Only
 * drafts still carrying the key, so released trackers and any tracker saved in the modal are kept.
 */
export function deleteModelDraftsStatements(key: string): CompiledQuery[] {
  const ids = db
    .selectFrom("WorkTrackers")
    .select("id")
    .where("auto_work_tracker_id", "=", key)
    .where("status", "=", "draft");
  return [
    db.deleteFrom("WorkTrackerLineItems").where("work_tracker_uuid", "in", ids).compile(),
    db
      .deleteFrom("WorkTrackers")
      .where("auto_work_tracker_id", "=", key)
      .where("status", "=", "draft")
      .compile(),
  ];
}
