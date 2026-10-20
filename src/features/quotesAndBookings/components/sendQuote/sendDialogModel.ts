import {
  QUOTE_PDF_ESTIMATE_BYTES,
  QUOTE_PDF_KEY,
  type PreviewAttachment,
} from "../../utils/sendQuote";
import type { PendingFile } from "./sendQuoteFlow";

/** One line of the dialog's attachment list. */
export type AttachmentRow = {
  /** Preview key for the PDF and template files; the pending id for a file added here. */
  key: string;
  name: string;
  /** Where the file can be opened. Absent for a file that has not been uploaded yet. */
  url?: string;
  /** Size in bytes, null when unknown (always so for the quote PDF). */
  sizeBytes: number | null;
  /** The quote PDF: always attached, no remove button (D11). */
  locked: boolean;
  /** Added in the dialog and waiting for Send. */
  pending: boolean;
};

/** The list the person sees: the preview's attachments minus the removed ones, then added files. */
export function attachmentRows(
  previewAttachments: PreviewAttachment[],
  removedKeys: ReadonlySet<string>,
  added: PendingFile[],
): AttachmentRow[] {
  const fromPreview = previewAttachments
    .filter((a) => a.key === QUOTE_PDF_KEY || !removedKeys.has(a.key))
    .map<AttachmentRow>((a) => ({
      key: a.key,
      name: a.name,
      url: a.url,
      sizeBytes: a.sizeBytes ?? null,
      locked: a.key === QUOTE_PDF_KEY,
      pending: false,
    }));
  const fromAdded = added.map<AttachmentRow>((p) => ({
    key: p.id,
    name: p.file.name,
    sizeBytes: p.file.size,
    locked: false,
    pending: true,
  }));
  return [...fromPreview, ...fromAdded];
}

/**
 * Sizes for checkSendLimits. The quote PDF's size is unknown, so it counts QUOTE_PDF_ESTIMATE_BYTES;
 * any other unknown size is passed as null and counts 0.
 */
export function attachmentSizes(rows: AttachmentRow[]): (number | null)[] {
  return rows.map((r) =>
    r.key === QUOTE_PDF_KEY ? (r.sizeBytes ?? QUOTE_PDF_ESTIMATE_BYTES) : r.sizeBytes,
  );
}

/**
 * The recipients an opening of the dialog works with. They are taken from the live list when the
 * dialog opens and then frozen, so a contact sync in the middle of an upload or send cannot reset
 * the dialog. The one exception: an opening that started with no recipients (contacts not synced
 * yet) adopts the first non-empty list, while it is still on the review form.
 */
export function openingRecipients(
  frozen: string[],
  live: string[],
  phase: "review" | "sending" | "sent" | "error",
): string[] {
  if (frozen.length > 0 || phase !== "review" || live.length === 0) return frozen;
  return live;
}
