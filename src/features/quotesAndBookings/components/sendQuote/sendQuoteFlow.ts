import { postSendQuote, type SendQuoteInput } from "../../utils/sendQuote";
import { errorMessage } from "../../utils/eventFileUpload";

export type SendPhase = "review" | "sending" | "sent" | "error";

/** The dialog cannot be closed mid-send, so the person always sees the outcome. */
export function canDismiss(phase: SendPhase): boolean {
  return phase !== "sending";
}

export function canSend(params: {
  recipients: string[];
  preview: { ok: boolean } | null;
  /** False while the message is over a Postmark limit (D9). Defaults to within limits. */
  withinLimits?: boolean;
}): boolean {
  return (
    params.recipients.length > 0 && params.preview?.ok === true && params.withinLimits !== false
  );
}

/** `stage: "upload"` marks a failure before anything was sent: the dialog stays on the review form. */
type SendOutcome = { ok: true } | { ok: false; message: string; stage?: "upload" };

/**
 * Whether an Escape key press should be ignored by the dialog: while sending, and while the focused
 * address box has its suggestion list open (Escape then closes only the list).
 */
export function ignoreDialogEscape(
  phase: SendPhase,
  active: { getAttribute(name: string): string | null } | null,
): boolean {
  if (!canDismiss(phase)) return true;
  return (
    active?.getAttribute("role") === "combobox" && active.getAttribute("aria-expanded") === "true"
  );
}

/** A file the person picked in the dialog. It is uploaded only when Send is pressed (D4). */
export type PendingFile = { id: string; file: File };

/**
 * The whole send, in order: upload the added files, the optional pre-step, the email, then the
 * local log.
 *
 * `uploadedIds` maps a pending file's id to its EventFiles id. The caller keeps the same map
 * across attempts, so after a failed send "Try again" does not upload the files a second time.
 *
 * A failed local log never turns into an error: by then the email has gone out, and telling the
 * person it failed would invite a second send.
 */
export async function runSend(params: {
  eventId: string;
  /** Builds the request body once the ids of the uploaded files are known. */
  buildInput: (addedFileIds: string[]) => SendQuoteInput;
  pendingFiles?: PendingFile[];
  uploadedIds?: Map<string, string>;
  upload?: (file: File) => Promise<string>;
  onBeforeSend?: () => Promise<void>;
  post?: (eventId: string, input: SendQuoteInput) => Promise<SendOutcome>;
  onSent: (input: SendQuoteInput) => Promise<void> | void;
}): Promise<SendOutcome> {
  const post = params.post ?? postSendQuote;
  const uploadedIds = params.uploadedIds ?? new Map<string, string>();

  for (const pending of params.pendingFiles ?? []) {
    if (uploadedIds.has(pending.id)) continue;
    try {
      if (!params.upload) throw new Error("uploading is not available");
      uploadedIds.set(pending.id, await params.upload(pending.file));
    } catch (e) {
      return {
        ok: false,
        message: `Could not upload ${pending.file.name}: ${errorMessage(e)}`,
        stage: "upload",
      };
    }
  }
  const addedFileIds = (params.pendingFiles ?? []).map((p) => uploadedIds.get(p.id)!);
  const input = params.buildInput(addedFileIds);

  if (params.onBeforeSend) {
    try {
      await params.onBeforeSend();
    } catch (e) {
      return { ok: false, message: `Could not update the quote: ${errorMessage(e)}` };
    }
  }

  const result = await post(params.eventId, input);
  if (!result.ok) {
    return params.onBeforeSend
      ? { ok: false, message: `Saved as Quoted, but the email did not send: ${result.message}` }
      : result;
  }

  try {
    await params.onSent(input);
  } catch (e) {
    console.error("Quote sent, but logging it locally failed:", e);
  }
  return { ok: true };
}
