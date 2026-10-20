import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../../../../database.types";
import { db } from "@/components/providers/SystemProvider";
import { typedExecute } from "@/lib/powersync/typedQuery";
import { triage } from "@/features/alerts/triage";
import type { QuoteStatus } from "../types/quoteTypes";
import { normalizeLostFields, type LostReason } from "../utils/lostReason";
import { postFinanceBookedNotice, shouldNotifyFinanceBooked } from "../utils/notifyFinanceBooked";
import { assertStatusTransition } from "../utils/statusTransitions";
import { logSingleChange } from "./logEventChanges";

/**
 * Changes only the status of a quote, from the status button on the quote page. Written through
 * the local database like any other edit, so the page follows by itself. The change must be one the
 * quote may make (utils/statusTransitions). A lost quote carries its reason; any other status
 * clears it. `booked_at` is set when a quote becomes booked, except one coming back from
 * unsigned_changes, which keeps the date it was first booked; any status other than booked or
 * unsigned_changes clears it, as the edit page does.
 */
export async function changeQuoteStatus(
  params: {
    eventId: string;
    from: string | null;
    to: QuoteStatus;
    lostReason?: LostReason | null;
    lostReasonNote?: string;
  },
  supabase: SupabaseClient<Database>,
  userId: string | null,
): Promise<void> {
  const { eventId, from, to } = params;
  assertStatusTransition(from, to);
  if (from === to) return;

  const bookedAt =
    to === "booked"
      ? from === "unsigned_changes"
        ? {}
        : { booked_at: new Date().toISOString() }
      : to === "unsigned_changes"
        ? {}
        : { booked_at: null };

  await typedExecute(
    db
      .updateTable("Events")
      .set({
        event_status: to,
        ...normalizeLostFields({
          status: to,
          lostReason: params.lostReason ?? null,
          lostReasonNote: params.lostReasonNote ?? "",
        }),
        ...bookedAt,
      })
      .where("id", "=", eventId)
      .compile(),
  );

  await logSingleChange(supabase, eventId, userId, "event_status", from, to, "status_change");
  void triage("Events", { id: eventId }, supabase);
  if (shouldNotifyFinanceBooked(from, to)) postFinanceBookedNotice(eventId);
}
