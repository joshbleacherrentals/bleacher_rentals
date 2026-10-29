import type { PulledEmail } from "../logic/emailActivity";

/** What the send route takes (see parseSendRequest). The sender is not in it: the server knows. */
export type SendReplyPayload = {
  to: string[];
  cc: string[];
  bcc: string[];
  subject: string;
  text: string;
  inReplyTo: string | null;
  references: string | null;
  thread: { mailbox: string; threadId: string } | null;
};

/** The sent email's body, as saveEmailDetails takes it. */
export type SentEmailDetails = { text: string | null; html: string | null };

/**
 * What the server hands back once an email is sent: the email in the form saveContactEmails takes,
 * and its body. Both are null when it was sent but the server could not read it back (a later pull
 * finds it).
 */
export type SentReply = { message: PulledEmail | null; details: SentEmailDetails | null };

/**
 * Sends a reply through the server. Resolves with the sent email and its body (see SentReply).
 * Throws, with the server's own explanation, when it was not sent.
 */
export async function sendReply(payload: SendReplyPayload): Promise<SentReply> {
  let res: Response;
  try {
    res = await fetch("/api/gmail/send", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
  } catch {
    throw new Error("Could not reach the server, so the reply was not sent. Try again.");
  }

  const body: {
    error?: string;
    message?: PulledEmail | null;
    details?: SentEmailDetails | null;
  } | null = await res.json().catch(() => null);
  if (!res.ok) throw new Error(body?.error ?? `Could not send the reply (${res.status}).`);
  return { message: body?.message ?? null, details: body?.details ?? null };
}
