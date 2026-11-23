import { db } from "@/components/providers/SystemProvider";
import { typedGetAll, expect } from "@/lib/powersync/typedQuery";
import { useSubrentalEventStore } from "@/features/subrentals/state/useSubrentalEventStore";
import { useCurrentEventStore } from "@/features/eventConfiguration/state/useCurrentEventStore";
import type { SubrentalStatus } from "@/features/subrentals/state/useSubrentalEventStore";

type SubrentalRow = {
  id: string;
  event_start: string | null;
  event_end: string | null;
  notes: string | null;
  created_by_user_uuid: string | null;
  status: string | null;
  requested_zone_uuid: string | null;
  bleacher_uuid: string | null;
  reviewed_by_user_uuid: string | null;
  reviewed_at: string | null;
};

/**
 * Loads a subrental event by ID from PowerSync and populates the subrental event store.
 */
export async function loadSubrentalEventById(subrentalEventUuid: string): Promise<void> {
  const compiled = db
    .selectFrom("SubrentalEvents")
    .select([
      "id",
      "event_start",
      "event_end",
      "notes",
      "created_by_user_uuid",
      "status",
      "requested_zone_uuid",
      "bleacher_uuid",
      "reviewed_by_user_uuid",
      "reviewed_at",
    ])
    .where("id", "=", subrentalEventUuid)
    .compile();

  const rows = await typedGetAll(compiled, expect<SubrentalRow>());
  const data = rows[0];

  if (!data) {
    console.warn("Could not find subrental event data for id:", subrentalEventUuid);
    return;
  }

  // Close the event form if it is open
  useCurrentEventStore.getState().resetForm();

  const store = useSubrentalEventStore.getState();
  const { setField } = store;

  setField("subrentalEventUuid", data.id);
  setField("eventStart", data.event_start ?? "");
  setField("eventEnd", data.event_end ?? "");
  setField("notes", data.notes ?? "");
  setField("createdByUserUuid", data.created_by_user_uuid);
  setField("status", (data.status as SubrentalStatus) ?? "pending");
  setField("requestedZoneUuid", data.requested_zone_uuid);
  setField("bleacherUuid", data.bleacher_uuid);
  setField("reviewedByUserUuid", data.reviewed_by_user_uuid);
  setField("reviewedAt", data.reviewed_at);
  setField("isFormExpanded", true);
}
