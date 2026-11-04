import { markEmailFailed } from "./unsentEmail";
import { sendReply, type SendReplyPayload } from "./sendReply";

/**
 * Has the server send a reply whose row is already saved (createPendingEmail). When it cannot be
 * sent, the row is marked failed with the reason, so the email itself says so, and the reason is
 * handed back for the caller to show. (The server marks the row too, when it can, which covers a
 * closed tab; this covers a server that was never reached.) Never throws.
 */
export async function sendPendingEmail(
  payload: SendReplyPayload,
): Promise<{ ok: true } | { ok: false; message: string }> {
  try {
    await sendReply(payload);
    return { ok: true };
  } catch (error: any) {
    const message: string = error?.message ?? "Could not send the reply.";
    try {
      await markEmailFailed(payload.emailMessageUuid, message);
    } catch (markError) {
      console.error("Reply failed, and the email could not be marked as failed:", markError);
    }
    return { ok: false, message };
  }
}
