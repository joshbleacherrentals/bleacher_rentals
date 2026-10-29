import { validateAllowedEmail } from "@/features/devEmailAllowlist/logic/validateAllowedEmail";

// Checks the body of a send request and turns it into the exact shape the route works with. The
// sender is not part of it: the route takes that from the signed-in user, never from the request.

export const MAX_RECIPIENTS = 50;
export const MAX_TEXT_LENGTH = 100_000;
const MAX_SUBJECT_LENGTH = 500;
const MAX_REFERENCES = 100;

export type SendRequest = {
  to: string[];
  cc: string[];
  bcc: string[];
  subject: string;
  text: string;
  /** The Message-ID of the email being answered, or null. */
  inReplyTo: string | null;
  /** Message-IDs of the conversation so far, space separated, or null. */
  references: string | null;
  /** The reply's thread in one mailbox's Gmail, used only if that is the sender's own mailbox. */
  thread: { mailbox: string; threadId: string } | null;
};

export type ParsedSendRequest = { ok: true; value: SendRequest } | { ok: false; error: string };

type AddressList = { ok: true; addresses: string[] } | { ok: false; error: string };

function addressList(label: string, value: unknown): AddressList {
  if (value === undefined || value === null) return { ok: true, addresses: [] };
  if (!Array.isArray(value)) return { ok: false, error: `${label} must be a list of addresses.` };

  const addresses: string[] = [];
  for (const item of value) {
    const checked = typeof item === "string" ? validateAllowedEmail(item, []) : null;
    if (!checked?.ok) {
      return { ok: false, error: `${JSON.stringify(item)} is not a valid email address.` };
    }
    if (!addresses.includes(checked.email)) addresses.push(checked.email);
  }
  return { ok: true, addresses };
}

// The Message-IDs in a header, in their own case, as <id@host>.
const idsIn = (value: unknown): string[] =>
  typeof value === "string" ? (value.match(/<[^<>\s]+>/g) ?? []) : [];

function thread(value: unknown): SendRequest["thread"] {
  if (typeof value !== "object" || value === null) return null;
  const { mailbox, threadId } = value as { mailbox?: unknown; threadId?: unknown };

  const checked = typeof mailbox === "string" ? validateAllowedEmail(mailbox, []) : null;
  if (!checked?.ok || typeof threadId !== "string" || !/^[A-Za-z0-9_-]{1,64}$/.test(threadId)) {
    return null;
  }
  return { mailbox: checked.email, threadId };
}

export function parseSendRequest(body: unknown): ParsedSendRequest {
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    return { ok: false, error: "The request must be a JSON object." };
  }
  const input = body as Record<string, unknown>;

  const to = addressList("To", input.to);
  if (!to.ok) return to;
  const cc = addressList("Cc", input.cc);
  if (!cc.ok) return cc;
  const bcc = addressList("Bcc", input.bcc);
  if (!bcc.ok) return bcc;

  const recipients = to.addresses.length + cc.addresses.length + bcc.addresses.length;
  if (recipients === 0) return { ok: false, error: "Add at least one recipient." };
  if (recipients > MAX_RECIPIENTS) {
    return { ok: false, error: `Too many recipients: the most is ${MAX_RECIPIENTS}.` };
  }

  if (typeof input.text !== "string" || input.text.trim() === "") {
    return { ok: false, error: "Write a message before sending." };
  }
  if (input.text.length > MAX_TEXT_LENGTH) {
    return { ok: false, error: "The message is too long." };
  }

  if (typeof input.subject !== "string") return { ok: false, error: "The subject is missing." };
  const subject = input.subject.replace(/\s*[\r\n]+\s*/g, " ").trim();
  if (subject === "") return { ok: false, error: "The subject is missing." };
  if (subject.length > MAX_SUBJECT_LENGTH) return { ok: false, error: "The subject is too long." };

  const references = idsIn(input.references).slice(-MAX_REFERENCES);

  return {
    ok: true,
    value: {
      to: to.addresses,
      cc: cc.addresses,
      bcc: bcc.addresses,
      subject,
      text: input.text,
      inReplyTo: idsIn(input.inReplyTo)[0] ?? null,
      references: references.length > 0 ? references.join(" ") : null,
      thread: thread(input.thread),
    },
  };
}
