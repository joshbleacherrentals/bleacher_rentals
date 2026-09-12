import type { Database } from "../../../../../../database.types";

type WorkTrackerStatus = Database["public"]["Enums"]["worktracker_status"];

/** Map work-tracker statuses to hex tint colours (matching Tailwind palette). */
export const STATUS_TINT: Record<WorkTrackerStatus, number> = {
  draft: 0xffea00,
  released: 0xd9d9d9,
  accepted: 0xd9d9d9,
  dest_pickup: 0xd9d9d9,
  pickup_inspection: 0xd9d9d9,
  dest_dropoff: 0xd9d9d9,
  dropoff_inspection: 0xd9d9d9,
  completed: 0xd9d9d9,
  cancelled: 0xd9d9d9,
  declined: 0xd9d9d9,
  abandoned: 0xd9d9d9,
};
