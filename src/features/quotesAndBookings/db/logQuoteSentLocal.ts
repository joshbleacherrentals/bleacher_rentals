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
  /** Files the person added in the send dialog; one "file added" line each (D13). */
  addedFiles?: { name: string }[];
}): Promise<void> {
  // The Log tab lists newest first. Earlier events must sit lower, so the file lines are written
  // first (in dialog order) and the "email sent" line last, each with a strictly increasing
  // changed_at so same-millisecond ties cannot reorder them (D13).
  const base = Date.now();
  const files = params.addedFiles ?? [];

  // Best effort: a failed file line must not stop the other file lines or the email line.
  for (let i = 0; i < files.length; i++) {
    try {
      await logFileAddedLocal({
        eventId: params.eventId,
        fileName: files[i].name,
        currentUserUuid: params.currentUserUuid,
        changedAt: new Date(base + i).toISOString(),
      });
    } catch (e) {
      console.error("Quote sent, but logging an added file failed:", e);
    }
  }

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
        changed_at: new Date(base + files.length).toISOString(),
      } as any)
      .compile(),
  );
}

/**
 * "The user added a file to the quote and attached it to the email" (D13). `next_value` is the
 * file name; the Log tab adds the note that it was attached and saved to Files.
 */
export async function logFileAddedLocal(params: {
  eventId: string;
  fileName: string;
  currentUserUuid: string | null;
  /** ISO time for the row; defaults to now. */
  changedAt?: string;
}): Promise<void> {
  await typedExecute(
    db
      .insertInto("EventChangeLog")
      .values({
        id: crypto.randomUUID(),
        event_uuid: params.eventId,
        changed_by_user_uuid: params.currentUserUuid,
        field_name: "file",
        prev_value: null,
        next_value: params.fileName,
        action_type: "file_add",
        changed_at: params.changedAt ?? new Date().toISOString(),
      } as any)
      .compile(),
  );
}
