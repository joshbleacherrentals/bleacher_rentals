import { postSendQuote, type AddedFileInput, type SendQuoteInput } from "../../utils/sendQuote";
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

/** A file the person added in the dialog and that went out with the email (D13). */
export type AddedFile = { fileId: string; name: string };

/**
 * The files to write a "file added" log line for (D13): the pending files that were uploaded and
 * are in the final `addedFiles` of the request, in the order the person added them. A file the
 * person removed before Send is not in `pending`; the quote PDF and template files never are.
 */
export function selectAddedFilesToLog(
  pending: readonly PendingFile[],
  uploaded: ReadonlyMap<string, AddedFileInput>,
  addedFiles: readonly AddedFileInput[],
): AddedFile[] {
  const sent = new Set(addedFiles.map((f) => f.id));
  const out: AddedFile[] = [];
  for (const p of pending) {
    const file = uploaded.get(p.id);
    if (file && sent.has(file.id)) out.push({ fileId: file.id, name: p.file.name });
  }
  return out;
}

/**
 * Deletes the storage objects uploaded for `pendingIds` (all of them when omitted) and forgets them.
 * Used when the person removes an uploaded file, and when the dialog closes without a successful
 * send (D14). `remove` is best effort and must not throw.
 */
export async function discardUploads(
  uploaded: Map<string, AddedFileInput>,
  remove: (files: { id: string; storagePath: string }[]) => Promise<void>,
  pendingIds?: readonly string[],
): Promise<void> {
  const ids = pendingIds ?? [...uploaded.keys()];
  const files = ids.flatMap((id) => {
    const f = uploaded.get(id);
    return f ? [{ id: f.id, storagePath: f.storagePath }] : [];
  });
  for (const id of ids) uploaded.delete(id);
  try {
    await remove(files);
  } catch (e) {
    console.error("Could not remove uploaded files:", e);
  }
}

/**
 * The whole send, in order: upload the added files to storage (no EventFiles row: the server
 * records them only after the email went out, D14), the optional pre-step, the email, then the
 * local log.
 *
 * `uploaded` maps a pending file's id to what was uploaded for it. The caller keeps the same map
 * across attempts, so after a failed send "Try again" does not upload the files a second time.
 *
 * A failed local log never turns into an error: by then the email has gone out, and telling the
 * person it failed would invite a second send.
 */
export async function runSend(params: {
  eventId: string;
  /** Builds the request body once the ids of the uploaded files are known. */
  buildInput: (addedFiles: AddedFileInput[]) => SendQuoteInput;
  pendingFiles?: PendingFile[];
  uploaded?: Map<string, AddedFileInput>;
  upload?: (file: File) => Promise<AddedFileInput>;
  onBeforeSend?: () => Promise<void>;
  post?: (eventId: string, input: SendQuoteInput) => Promise<SendOutcome>;
  onSent: (input: SendQuoteInput, addedFiles: AddedFile[]) => Promise<void> | void;
}): Promise<SendOutcome> {
  const post = params.post ?? postSendQuote;
  const uploaded = params.uploaded ?? new Map<string, AddedFileInput>();

  for (const pending of params.pendingFiles ?? []) {
    if (uploaded.has(pending.id)) continue;
    try {
      if (!params.upload) throw new Error("uploading is not available");
      uploaded.set(pending.id, await params.upload(pending.file));
    } catch (e) {
      return {
        ok: false,
        message: `Could not upload ${pending.file.name}: ${errorMessage(e)}`,
        stage: "upload",
      };
    }
  }
  const addedFiles = (params.pendingFiles ?? []).map((p) => uploaded.get(p.id)!);
  const input = params.buildInput(addedFiles);

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
    await params.onSent(
      input,
      selectAddedFilesToLog(params.pendingFiles ?? [], uploaded, input.addedFiles),
    );
  } catch (e) {
    console.error("Quote sent, but logging it locally failed:", e);
  }
  return { ok: true };
}
