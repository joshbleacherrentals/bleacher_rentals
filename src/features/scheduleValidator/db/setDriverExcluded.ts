import { db } from "@/components/providers/SystemProvider";
import { typedExecute } from "@/lib/powersync/typedQuery";

/** The local write that leaves a driver out of the Auto Work Trackers model, or adds them back. */
export function driverExcludedWrite(driverUuid: string, excluded: boolean) {
  return db
    .updateTable("Drivers")
    .set({ exclude_from_auto_work_trackers: excluded ? 1 : 0 })
    .where("id", "=", driverUuid)
    .compile();
}

/** Saves it to the local database; PowerSync uploads it. */
export async function setDriverExcluded(driverUuid: string, excluded: boolean): Promise<void> {
  await typedExecute(driverExcludedWrite(driverUuid, excluded));
}
