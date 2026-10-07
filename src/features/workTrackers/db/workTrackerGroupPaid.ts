import { db } from "@/components/providers/SystemProvider";
import { typedExecute } from "@/lib/powersync/typedQuery";

/**
 * `WorkTrackerGroups.is_paid`: whether a driver's week has been paid. Written through the local
 * PowerSync database, so the button flips at once and the change is uploaded behind it; the
 * database refuses it from anyone but an admin or an accountant (guard_work_tracker_group_is_paid).
 *
 * A group is one row per driver per week (`unique (driver_uuid, week_start)`), made by a database
 * trigger with the week's first work tracker. The button is only offered once the group exists,
 * so nothing here creates one: a second writer racing the payment window's own find-or-create
 * would collide on that unique key and the upload would be discarded.
 */

export type WorkTrackerGroupPaidRow = {
  id: string;
  /** Local booleans are 0/1; null on a row synced before the column existed. */
  is_paid: number | null;
};

const NONE = "__none__";

/** The group of one driver's week. A null driver keeps the query inert. */
export function buildWorkTrackerGroupPaidQuery(driverUuid: string | null, weekStart: string) {
  return db
    .selectFrom("WorkTrackerGroups")
    .select(["id", "is_paid"])
    .where("driver_uuid", "=", driverUuid ?? NONE)
    .where("week_start", "=", weekStart)
    .limit(1)
    .compile();
}

export function buildSetGroupPaidQuery(groupId: string, isPaid: boolean) {
  return db
    .updateTable("WorkTrackerGroups")
    .set({ is_paid: isPaid ? 1 : 0 })
    .where("id", "=", groupId)
    .compile();
}

export async function setWorkTrackerGroupPaid(groupId: string, isPaid: boolean): Promise<void> {
  await typedExecute(buildSetGroupPaidQuery(groupId, isPaid));
}
