import { db } from "@/components/providers/SystemProvider";
import { typedExecute } from "@/lib/powersync/typedQuery";
import { formatRecipientsLine } from "../utils/sendQuote";

/**
 * Logs a "quote sent to client" event to the EventChangeLog via PowerSync
 * (local-first), so the entry syncs in the normal upload queue.
 *
 * This runs on the client after the server confirms the email was sent. The
 * email + PDF storage stay server-side (Postmark + service role), but the log
 * is written here so it records the **current logged-in user** (the person who
 * clicked Send) and follows the PowerSync-first rule.
 *
 * The Event already exists on the server by send time, so there's no FK timing
 * issue on event_uuid.
 */
export async function logQuoteSentLocal(params: {
  eventId: string;
  recipients: { to: string[]; cc: string[]; bcc: string[] };
  currentUserUuid: string | null;
}): Promise<void> {
  await typedExecute(
    db
      .insertInto("EventChangeLog")
      .values({
        id: crypto.randomUUID(),
        event_uuid: params.eventId,
        changed_by_user_uuid: params.currentUserUuid,
        field_name: "email_sent",
        prev_value: null,
        next_value: formatRecipientsLine(params.recipients), // D10: "To: a; Cc: b; Bcc: c"
        action_type: "send",
        changed_at: new Date().toISOString(),
      } as any)
      .compile(),
  );
}
