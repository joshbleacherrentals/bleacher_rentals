import type { SupabaseClient } from "@supabase/supabase-js";
import type { SendResult } from "./sendTriggerEmail";

/**
 * Persists one row to EventEmailLog. Best-effort — never throws so a logging
 * failure cannot break the caller's flow.
 */
export async function logEmailSend(
  supabase: SupabaseClient<any>,
  opts: {
    eventId: string;
    trigger: string;
    result: SendResult;
    templateId?: string | null;
    // What the message contained, when known. Null columns on rows that never got that far.
    details?: {
      cc?: string | null;
      bcc?: string | null;
      subject?: string | null;
      attachmentNames?: string | null;
    };
  },
): Promise<void> {
  try {
    await supabase.from("EventEmailLog").insert({
      event_uuid: opts.eventId,
      trigger: opts.trigger,
      status: opts.result.sent ? "sent" : "failed",
      reason: opts.result.sent ? null : opts.result.reason,
      to_email: opts.result.sent ? opts.result.to : null,
      cc_emails: opts.details?.cc ?? null,
      bcc_emails: opts.details?.bcc ?? null,
      subject: opts.details?.subject ?? null,
      attachment_names: opts.details?.attachmentNames ?? null,
      template_id: opts.templateId ?? null,
    });
  } catch (e) {
    console.error("[automatic-emails] Failed to write EventEmailLog row:", e);
  }
}
