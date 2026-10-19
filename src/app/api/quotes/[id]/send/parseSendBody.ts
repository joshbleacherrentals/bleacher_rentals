import {
  isValidEmail,
  MAX_RECIPIENTS,
  QUOTE_PDF_KEY,
  type SendQuoteInput,
} from "@/features/quotesAndBookings/utils/sendQuote";

const isStringArray = (v: unknown): v is string[] =>
  Array.isArray(v) && v.every((x) => typeof x === "string");

/**
 * Validates the body of POST /api/quotes/[id]/send (a SendQuoteInput). The only hard rules are the
 * ones the server must not leave to the browser: To has at least one address and every address in
 * To, Cc and Bcc is a valid one. `quote_pdf` is dropped from the removed keys (D11).
 */
export function parseSendBody(
  body: unknown,
): { ok: true; input: SendQuoteInput } | { ok: false; error: string } {
  const b = (body ?? {}) as Record<string, unknown>;
  const list = (v: unknown) => (v === undefined ? [] : v);

  const to = list(b.to);
  const cc = list(b.cc);
  const bcc = list(b.bcc);
  const removed = list(b.removedAttachmentKeys);
  const added = list(b.addedFileIds);
  if (
    !isStringArray(to) ||
    !isStringArray(cc) ||
    !isStringArray(bcc) ||
    !isStringArray(removed) ||
    !isStringArray(added) ||
    (b.subject !== undefined && typeof b.subject !== "string")
  ) {
    return { ok: false, error: "The send request is malformed" };
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
      addedFileIds: [...new Set(added)],
    },
  };
}
