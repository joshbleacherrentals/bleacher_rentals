import { db } from "@/components/providers/SystemProvider";
import { typedExecute } from "@/lib/powersync/typedQuery";

/**
 * Marks a website request as answered (or back to waiting): sets `Events.hide_lead_alert` and
 * changes nothing else. Written through the local database like any other edit.
 */
export async function setLeadResponded(eventId: string, responded: boolean): Promise<void> {
  await typedExecute(
    db
      .updateTable("Events")
      .set({ hide_lead_alert: responded ? 1 : 0 })
      .where("id", "=", eventId)
      .compile(),
  );
}
