import { db } from "@/components/providers/SystemProvider";
import { typedGetAll, expect } from "@/lib/powersync/typedQuery";

type EventIdRow = { id: string };

/**
 * How many OTHER non-deleted events are linked to this venue — shown before
 * editing a Venue's own record, since that edit updates the shared address
 * for every one of them (see updateVenue.ts).
 */
export async function countEventsForVenue(
  venueId: string,
  excludeEventId?: string | null,
): Promise<number> {
  let query = db
    .selectFrom("Events")
    .select(["id"])
    .where("venue_uuid", "=", venueId)
    .where("deleted", "=", 0);

  if (excludeEventId) {
    query = query.where("id", "!=", excludeEventId);
  }

  const rows = await typedGetAll(query.compile(), expect<EventIdRow>());
  return rows.length;
}
