import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../../../../database.types";
import { db } from "@/components/providers/SystemProvider";
import { typedExecute } from "@/lib/powersync/typedQuery";
import { bookedAtDay, bookedAtFromDay, formatBookedDay } from "../utils/bookedAt";
import { logSingleChange } from "./logEventChanges";

/**
 * Sets the booked date of a quote from the date button on the quote page: an event that moved
 * between statuses has lost its `booked_at` (changeQuoteStatus), and this puts the right day back.
 * Written through the local database like any other edit, so the page follows by itself.
 *
 * The chosen day (`YYYY-MM-DD`) is saved at 12:00 in `timezone`, the app's timezone (see
 * utils/bookedAt). Choosing the day the quote already has writes nothing and logs nothing: it would
 * only reset the time of day and leave a "Nov 12 → Nov 12" row in the Log. Returns whether it wrote.
 * The Log row is an "Updated: Booked At" with both days as text, written the way a status change is.
 */
export async function changeBookedAt(
  params: { eventId: string; from: string | null; day: string; timezone: string },
  supabase: SupabaseClient<Database>,
  userId: string | null,
): Promise<boolean> {
  const { eventId, from, day, timezone } = params;
  const bookedAt = bookedAtFromDay(day, timezone);

  const previousDay = bookedAtDay(from, timezone);
  if (previousDay === day) return false;

  await typedExecute(
    db.updateTable("Events").set({ booked_at: bookedAt }).where("id", "=", eventId).compile(),
  );

  await logSingleChange(
    supabase,
    eventId,
    userId,
    "booked_at",
    previousDay ? formatBookedDay(previousDay) : null,
    formatBookedDay(day),
    "update",
  );
  return true;
}
