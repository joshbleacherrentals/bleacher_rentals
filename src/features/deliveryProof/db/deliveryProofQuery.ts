import { db } from "@/components/providers/SystemProvider";

/** A work tracker's GPS proof of delivery, if the daily check has looked at it. */
export function deliveryProofQuery(workTrackerUuid: string) {
  return db
    .selectFrom("DeliveryProofs")
    .select([
      "status",
      "final",
      "checked_at",
      "evidence_at",
      "distance_meters",
      "evidence_place",
      "gps_last_report_at",
    ])
    .where("work_tracker_uuid", "=", workTrackerUuid)
    .limit(1)
    .compile();
}
