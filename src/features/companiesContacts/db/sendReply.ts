/**
 * What the send route takes (see parseSendRequest). The sender is not in it: the server knows.
 * `emailMessageUuid` is the EmailMessages row already saved for this reply (see createPendingEmail),
 * which the server updates once the email is sent.
 */
export type SendReplyPayload = {
  emailMessageUuid: string;
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
 * Asks the server to send a reply. Resolves once it is sent and its row updated. Throws, with the
 * server's own explanation, when it was not sent.
 */
export async function sendReply(payload: SendReplyPayload): Promise<void> {
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

  if (!res.ok) {
    const body: { error?: string } | null = await res.json().catch(() => null);
    throw new Error(body?.error ?? `Could not send the reply (${res.status}).`);
  }
}
