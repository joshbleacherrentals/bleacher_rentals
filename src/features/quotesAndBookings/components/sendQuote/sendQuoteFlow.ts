import { postSendQuote } from "../../utils/sendQuote";

export type SendPhase = "review" | "sending" | "sent" | "error";

/** The dialog cannot be closed mid-send, so the person always sees the outcome. */
export function canDismiss(phase: SendPhase): boolean {
  return phase !== "sending";
}

export function canSend(params: {
  recipients: string[];
  preview: { ok: boolean } | null;
}): boolean {
  return params.recipients.length > 0 && params.preview?.ok === true;
}

type SendOutcome = { ok: true } | { ok: false; message: string };

/**
 * The whole send, in order: optional pre-step, the email, then the local log.
 *
 * A failed local log never turns into an error: by then the email has gone out, and telling the
 * person it failed would invite a second send.
 */
export async function runSend(params: {
  eventId: string;
  recipients: string[];
  onBeforeSend?: () => Promise<void>;
  post?: (eventId: string, recipients: string[]) => Promise<SendOutcome>;
  onSent: () => Promise<void> | void;
}): Promise<SendOutcome> {
  const post = params.post ?? postSendQuote;

  if (params.onBeforeSend) {
    try {
      await params.onBeforeSend();
    } catch (e) {
      const reason = e instanceof Error ? e.message : "unknown error";
      return { ok: false, message: `Could not update the quote: ${reason}` };
    }
  }

  const result = await post(params.eventId, params.recipients);
  if (!result.ok) {
    return params.onBeforeSend
      ? { ok: false, message: `Saved as Quoted, but the email did not send: ${result.message}` }
      : result;
  }

  try {
    await params.onSent();
  } catch (e) {
    console.error("Quote sent, but logging it locally failed:", e);
  }
  return { ok: true };
}
