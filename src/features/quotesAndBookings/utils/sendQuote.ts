export const QUOTE_PDF_KEY = "quote_pdf";

export type PreviewAttachment = {
  key: string; // "quote_pdf" or the id of the template's attachment row
  name: string;
  url: string;
  // Not in the spec's type: additive and optional, so the dialog can count the 10 MB limit (D9).
  // Null/absent when the size is not known (always the case for the quote PDF).
  sizeBytes?: number | null;
};

export type SendPreview =
  | {
      ok: true;
      from: string;
      to: string;
      subject: string;
      htmlBody: string;
      attachments: PreviewAttachment[];
    }
  | { ok: false; reason: string };

/** Valid, trimmed, case-insensitively de-duplicated addresses — what the send route will be given. */
export function cleanRecipients(candidates: (string | null | undefined)[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of candidates) {
    const email = raw?.trim();
    if (!email || !isValidEmail(email) || seen.has(email.toLowerCase())) continue;
    seen.add(email.toLowerCase());
    out.push(email);
  }
  return out;
}

export type SendQuoteInput = {
  to: string[];
  cc: string[];
  bcc: string[];
  subject: string;
  // Attachments of the preview the person removed, by `key` (see SendPreview).
  // The server ignores "quote_pdf" here (D11).
  // An empty `subject` means "use the template's subject" (D8).
  removedAttachmentKeys: string[];
  // EventFiles rows the browser added for this send.
  addedFileIds: string[];
};

export async function postSendQuote(
  eventId: string,
  input: SendQuoteInput,
): Promise<{ ok: true } | { ok: false; message: string }> {
  try {
    const res = await fetch(`/api/quotes/${eventId}/send`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    });
    if (res.ok) return { ok: true };
    if (res.status === 401) {
      return { ok: false, message: "Your session has expired. Please sign in again." };
    }
    const body = await res.json().catch(() => ({}));
    return { ok: false, message: body.error || `Failed (${res.status})` };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "Could not reach the server." };
  }
}

export async function fetchSendPreview(
  eventId: string,
  recipientEmails: string[],
): Promise<SendPreview> {
  try {
    const res = await fetch(
      `/api/quotes/${eventId}/send-preview?recipients=${encodeURIComponent(recipientEmails.join(","))}`,
    );
    if (!res.ok) return { ok: false, reason: `Could not load the email preview (${res.status}).` };
    return (await res.json()) as SendPreview;
  } catch (e) {
    return { ok: false, reason: e instanceof Error ? e.message : "Could not reach the server." };
  }
}

// ── Pure helpers for the send dialog (docs/specs/quote-send-email-options.md) ──────────────────

export type RecipientField = "to" | "cc" | "bcc";
export type RecipientFields = Record<RecipientField, string[]>;

const FIELD_LABEL: Record<RecipientField, string> = { to: "To", cc: "Cc", bcc: "Bcc" };

/** Maximum recipients across To, Cc and Bcc (Postmark). */
export const MAX_RECIPIENTS = 50;
/**
 * About 10 MB for the whole message including attachments (Postmark). Postmark measures the
 * base64-encoded message, so callers compare `bytes * 4/3` with this (see checkSendLimits).
 */
export const MAX_TOTAL_ATTACHMENT_BYTES = 10 * 1024 * 1024;

/**
 * The quote PDF is rendered by the server, so the dialog cannot know its size. For the 10 MB limit
 * it counts this estimate (1 MB, typical for a multi-page quote) instead of 0.
 */
export const QUOTE_PDF_ESTIMATE_BYTES = 1024 * 1024;

// Whitespace, control characters and the characters that separate or wrap addresses.
// eslint-disable-next-line no-control-regex
const FORBIDDEN_CHARS_RE = /[\s\u0000-\u001f\u007f<>,;]/;

/**
 * A pragmatic check, stricter than "has an @": one @, a local part with no leading, trailing or
 * doubled dot, and a dotted domain whose labels are non-empty and neither start nor end with "-"
 * (which also rules out a trailing dot). Plus-tags and the like are fine.
 */
export function isValidEmail(value: string): boolean {
  const email = value.trim();
  const at = email.indexOf("@");
  if (at < 1 || at !== email.lastIndexOf("@")) return false;
  const local = email.slice(0, at);
  const domain = email.slice(at + 1);
  if (FORBIDDEN_CHARS_RE.test(email)) return false;
  if (local.startsWith(".") || local.endsWith(".") || local.includes("..")) return false;
  const labels = domain.split(".");
  if (labels.length < 2) return false;
  return labels.every((l) => l !== "" && !l.startsWith("-") && !l.endsWith("-"));
}

/** Case-insensitive comparison key for an address. */
export function emailKey(value: string): string {
  return value.trim().toLowerCase();
}

const SEPARATOR_RE = /[\s,;]/;

/**
 * Splits typed or pasted text on commas, semicolons and whitespace; blanks dropped, not validated.
 * An address written as `Name <a@b.com>` or `"Smith, John" <a@b.com>` yields just the address
 * inside the angle brackets. Only a display name directly attached to the `<...>` is dropped (a
 * quoted name, or the plain words before it that are not themselves addresses). A single linear
 * pass: long input without any `<` or quote stays fast.
 */
export function splitAddressText(text: string): string[] {
  const n = text.length;
  const out: string[] = [];
  let pending: string[] = []; // words since the last comma/semicolon, possibly a display name
  let gtCache = -2; // cached indexOf(">") result; -1 = none left
  let quoteGone = false; // no closing quote exists after the last search

  // The index of the ">" closing an "<" at `i`, or -1 when it is not a well-formed `<...>`.
  const closeAngle = (i: number): number => {
    if (gtCache !== -1 && gtCache <= i) gtCache = text.indexOf(">", i + 1);
    if (gtCache === -1) return -1;
    const lt = text.indexOf("<", i + 1);
    return lt !== -1 && lt < gtCache ? -1 : gtCache;
  };
  const flush = () => {
    out.push(...pending);
    pending = [];
  };
  const pushInner = (inner: string) => {
    for (const part of inner.split(/[\s,;]+/)) if (part) out.push(part);
  };

  let i = 0;
  while (i < n) {
    const ch = text[i];
    if (ch === "," || ch === ";") {
      flush();
      i++;
    } else if (/\s/.test(ch)) {
      i++;
    } else if (ch === '"' && !quoteGone) {
      const close = text.indexOf('"', i + 1);
      if (close === -1) {
        quoteGone = true;
        continue;
      }
      let k = close + 1;
      while (k < n && /\s/.test(text[k])) k++;
      const gt = k < n && text[k] === "<" ? closeAngle(k) : -1;
      if (gt !== -1) {
        flush();
        pushInner(text.slice(k + 1, gt));
        i = gt + 1;
      } else {
        // Not a display name: an ordinary word that happens to contain a quote.
        let j = i;
        while (j < n && !SEPARATOR_RE.test(text[j])) j++;
        pending.push(text.slice(i, j));
        i = j;
      }
    } else if (ch === "<" && closeAngle(i) !== -1) {
      const gt = closeAngle(i);
      // Plain words right before the "<" are its display name, unless they are addresses.
      while (pending.length > 0 && !pending[pending.length - 1].includes("@")) pending.pop();
      flush();
      pushInner(text.slice(i + 1, gt));
      i = gt + 1;
    } else {
      let j = i;
      while (j < n && !SEPARATOR_RE.test(text[j])) {
        if (text[j] === "<" && j > i && closeAngle(j) !== -1) break;
        j++;
      }
      if (j === i) j++;
      pending.push(text.slice(i, j));
      i = j;
    }
  }
  flush();
  return out;
}

/** Trimmed and case-insensitively de-duplicated (first spelling kept); invalid ones are kept out. */
export function dedupeAddresses(list: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of list) {
    const email = raw.trim();
    const key = emailKey(email);
    if (!email || seen.has(key)) continue;
    seen.add(key);
    out.push(email);
  }
  return out;
}

/** Which field already holds the address (To first), or null. */
export function findAddressField(fields: RecipientFields, email: string): RecipientField | null {
  const key = emailKey(email);
  for (const f of ["to", "cc", "bcc"] as const) {
    if (fields[f].some((e) => emailKey(e) === key)) return f;
  }
  return null;
}

export type AddAddressResult =
  | { ok: true; fields: RecipientFields; email: string }
  | { ok: false; message: string };

/**
 * Adds one typed address to a field. Refuses an invalid address and one that is already in any of
 * To, Cc or Bcc (D12), saying where.
 */
export function addAddress(
  fields: RecipientFields,
  field: RecipientField,
  raw: string,
): AddAddressResult {
  const email = raw.trim();
  if (!isValidEmail(email)) {
    return { ok: false, message: `"${email}" is not a valid email address.` };
  }
  const existing = findAddressField(fields, email);
  if (existing) {
    return {
      ok: false,
      message: `${email} is already in ${FIELD_LABEL[existing]}.`,
    };
  }
  return { ok: true, email, fields: { ...fields, [field]: [...fields[field], email] } };
}

export type SendDialogState = {
  to: string[];
  cc: string[];
  bcc: string[];
  subject: string;
  // Keys of the preview's attachments still in the list (including "quote_pdf").
  attachments: { key: string }[];
  // Keys of every attachment the preview originally had.
  previewAttachmentKeys: string[];
  addedFileIds: string[];
};

/**
 * The request body from the dialog state. Each field is trimmed and de-duplicated, an address kept
 * in an earlier field is dropped from a later one (To, then Cc, then Bcc), the quote PDF is never
 * reported as removed, and the subject is passed as typed (empty means the template's, D8).
 */
export function buildSendQuoteInput(state: SendDialogState): SendQuoteInput {
  const taken = new Set<string>();
  const take = (list: string[]) =>
    dedupeAddresses(list).filter((e) => {
      const key = emailKey(e);
      if (taken.has(key)) return false;
      taken.add(key);
      return true;
    });
  const to = take(state.to);
  const cc = take(state.cc);
  const bcc = take(state.bcc);

  const kept = new Set(state.attachments.map((a) => a.key));
  const removedAttachmentKeys = state.previewAttachmentKeys.filter(
    (k) => k !== QUOTE_PDF_KEY && !kept.has(k),
  );

  return {
    to,
    cc,
    bcc,
    subject: state.subject.trim(),
    removedAttachmentKeys,
    addedFileIds: [...new Set(state.addedFileIds)],
  };
}

export type LimitCheck =
  | { ok: true }
  | { ok: false; limit: "recipients" | "attachments"; message: string };

function formatMb(bytes: number): string {
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * D9. `attachmentSizes` are the sizes in bytes of everything that will be attached: the quote PDF,
 * the template files still in the list and the files added in the dialog. Unknown sizes count 0
 * (the dialog passes QUOTE_PDF_ESTIMATE_BYTES for the quote PDF).
 * The raw total is converted to its base64 size before it is compared with the limit.
 * Recipients are checked first.
 */
export function checkSendLimits(params: {
  to: string[];
  cc: string[];
  bcc: string[];
  attachmentSizes: (number | null | undefined)[];
}): LimitCheck {
  const count = params.to.length + params.cc.length + params.bcc.length;
  if (count > MAX_RECIPIENTS) {
    return {
      ok: false,
      limit: "recipients",
      message: `Too many recipients: ${count} across To, Cc and Bcc, and the limit is ${MAX_RECIPIENTS}.`,
    };
  }
  const raw = params.attachmentSizes.reduce<number>((sum, n) => sum + (n ?? 0), 0);
  const encoded = Math.ceil((raw * 4) / 3); // base64 inflates by 4/3; Postmark counts that
  if (encoded > MAX_TOTAL_ATTACHMENT_BYTES) {
    return {
      ok: false,
      limit: "attachments",
      message: `Attachments are too large: about ${formatMb(encoded)} once encoded for email, and the limit is ${formatMb(MAX_TOTAL_ATTACHMENT_BYTES)}.`,
    };
  }
  return { ok: true };
}

/** D10: "To: a; Cc: b; Bcc: c". An empty part is left out. */
export function formatRecipientsLine(input: { to: string[]; cc: string[]; bcc: string[] }): string {
  const parts: string[] = [];
  if (input.to.length) parts.push(`To: ${input.to.join(", ")}`);
  if (input.cc.length) parts.push(`Cc: ${input.cc.join(", ")}`);
  if (input.bcc.length) parts.push(`Bcc: ${input.bcc.join(", ")}`);
  return parts.join("; ");
}
