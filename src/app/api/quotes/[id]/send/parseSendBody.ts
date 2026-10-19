import {
  isValidEmail,
  MAX_RECIPIENTS,
  QUOTE_PDF_KEY,
  type AddedFileInput,
  type SendQuoteInput,
} from "@/features/quotesAndBookings/utils/sendQuote";

const isStringArray = (v: unknown): v is string[] =>
  Array.isArray(v) && v.every((x) => typeof x === "string");

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_NAME_LENGTH = 255;
/** The most files one send may add (server-side cap; the browser has its own limits). */
export const MAX_ADDED_FILES = 20;

/** The shape of one added file; where it lives in storage is checked by the route (it knows the event). */
function parseAddedFile(v: unknown): AddedFileInput | null {
  if (!v || typeof v !== "object") return null;
  const f = v as Record<string, unknown>;
  if (typeof f.id !== "string" || !UUID_RE.test(f.id)) return null;
  if (typeof f.storagePath !== "string" || !f.storagePath) return null;
  if (typeof f.name !== "string") return null;
  const name = f.name.trim();
  // eslint-disable-next-line no-control-regex
  if (!name || name.length > MAX_NAME_LENGTH || /[\u0000-\u001f\u007f/\\]/.test(name)) return null;
  if (typeof f.mimeType !== "string" || !f.mimeType) return null;
  if (typeof f.sizeBytes !== "number" || !Number.isFinite(f.sizeBytes) || f.sizeBytes < 0) {
    return null;
  }
  return {
    id: f.id.toLowerCase(),
    storagePath: f.storagePath,
    name,
    mimeType: f.mimeType,
    sizeBytes: Math.floor(f.sizeBytes),
  };
}

/**
 * Validates the body of POST /api/quotes/[id]/send (a SendQuoteInput). The only hard rules are the
 * ones the server must not leave to the browser: To has at least one address and every address in
 * To, Cc and Bcc is a valid one. `quote_pdf` is dropped from the removed keys (D11).
 */
export function parseSendBody(
  body: unknown,
): { ok: true; input: SendQuoteInput } | { ok: false; error: string } {
  const b = (body ?? {}) as Record<string, unknown>;
  // An old browser tab still posts the previous shape; its files would be dropped silently.
  if (Array.isArray(b.addedFileIds) && b.addedFileIds.length > 0) {
    return {
      ok: false,
      error: "This page is out of date. Reload the page and send the quote again.",
    };
  }
  const list = (v: unknown) => (v === undefined ? [] : v);

  const to = list(b.to);
  const cc = list(b.cc);
  const bcc = list(b.bcc);
  const removed = list(b.removedAttachmentKeys);
  const added = list(b.addedFiles);
  if (
    !isStringArray(to) ||
    !isStringArray(cc) ||
    !isStringArray(bcc) ||
    !isStringArray(removed) ||
    !Array.isArray(added) ||
    (b.subject !== undefined && typeof b.subject !== "string")
  ) {
    return { ok: false, error: "The send request is malformed" };
  }

  if (added.length > MAX_ADDED_FILES) {
    return { ok: false, error: `Too many attached files: the limit is ${MAX_ADDED_FILES}` };
  }
  const addedFiles: AddedFileInput[] = [];
  for (const raw of added) {
    const f = parseAddedFile(raw);
    if (!f) return { ok: false, error: "An attached file is malformed" };
    if (!addedFiles.some((o) => o.id === f.id || o.storagePath === f.storagePath)) {
      addedFiles.push(f);
    }
  }

  const trim = (l: string[]) => l.map((e) => e.trim()).filter(Boolean);
  const toT = trim(to);
  if (toT.length === 0) {
    return { ok: false, error: "At least one recipient email is required" };
  }
  const ccT = trim(cc);
  const bccT = trim(bcc);
  if (toT.length + ccT.length + bccT.length > MAX_RECIPIENTS) {
    return {
      ok: false,
      error: `Too many recipients: the limit is ${MAX_RECIPIENTS} across To, Cc and Bcc`,
    };
  }
  const bad = [...toT, ...ccT, ...bccT].find((e) => !isValidEmail(e));
  if (bad) return { ok: false, error: `"${bad}" is not a valid email address` };

  return {
    ok: true,
    input: {
      to: toT,
      cc: ccT,
      bcc: bccT,
      subject: ((b.subject as string | undefined) ?? "").trim(),
      removedAttachmentKeys: removed.filter((k) => k !== QUOTE_PDF_KEY),
      addedFiles,
    },
  };
}
