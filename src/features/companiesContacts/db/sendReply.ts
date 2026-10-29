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

/**
 * Sends a reply through the server. Resolves with the sent email, in the form saveContactEmails
 * takes, or null when it was sent but the server could not read it back (a later pull finds it).
 * Throws, with the server's own explanation, when it was not sent.
 */
export async function sendReply(payload: SendReplyPayload): Promise<PulledEmail | null> {
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

  const body: { error?: string; message?: PulledEmail | null } | null = await res
    .json()
    .catch(() => null);
  if (!res.ok) throw new Error(body?.error ?? `Could not send the reply (${res.status}).`);
  return body?.message ?? null;
}
