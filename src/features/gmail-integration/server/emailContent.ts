import "server-only";

import { getDelegatedAccessToken, GMAIL_READONLY_SCOPE } from "./delegatedAuth";
import {
  getAttachmentData,
  getFullMessage,
  type GmailFullMessage,
  type GmailMessagePart,
} from "./gmailMessages";

export type EmailAttachment = {
  filename: string;
  mimeType: string;
  /** Size in bytes. */
  size: number;
  /** Fetch the file with this (and the message's Gmail id); it is not part of this result. */
  attachmentId: string | null;
  /** Shown inside the body (an embedded image, referenced as cid:<contentId>) rather than attached. */
  inline: boolean;
  contentId: string | null;
};

export type EmailContent = {
  id: string;
  threadId: string;
  /** When Google received it, in epoch milliseconds. */
  internalDate: number | null;
  labelIds: string[];
  headers: {
    subject: string | null;
    from: string | null;
    to: string | null;
    cc: string | null;
    bcc: string | null;
    replyTo: string | null;
    date: string | null;
    messageId: string | null;
    inReplyTo: string | null;
    references: string | null;
  };
  /** The plain-text version, if the email has one. */
  text: string | null;
  /** The HTML version, exactly as sent. Untrusted: sanitize before rendering it anywhere. */
  html: string | null;
  attachments: EmailAttachment[];
};

type TextPart = { mime: "text/plain" | "text/html"; charset: string; part: GmailMessagePart };

function headerOf(part: GmailMessagePart | undefined, name: string): string | null {
  return part?.headers?.find((h) => h.name.toLowerCase() === name.toLowerCase())?.value ?? null;
}

function charsetOf(part: GmailMessagePart): string {
  const match = headerOf(part, "Content-Type")?.match(/charset="?([^";\s]+)"?/i);
  return match?.[1] ?? "utf-8";
}

/** Gmail sends body bytes as base64url. Decode them in the charset the email declared. */
export function decodeBody(data: string, charset: string): string {
  const bytes = Buffer.from(data, "base64url");
  try {
    return new TextDecoder(charset).decode(bytes);
  } catch {
    return new TextDecoder("utf-8").decode(bytes); // an unknown charset name
  }
}

function collect(part: GmailMessagePart, texts: TextPart[], files: EmailAttachment[]) {
  const mime = (part.mimeType ?? "").toLowerCase();
  const disposition = (headerOf(part, "Content-Disposition") ?? "").toLowerCase();
  const contentId = headerOf(part, "Content-ID")?.replace(/^<|>$/g, "") ?? null;

  // A named part is a file, even when it is itself a container (a forwarded .eml).
  const isFile =
    !!part.filename ||
    disposition.startsWith("attachment") ||
    (!!part.body?.attachmentId && !mime.startsWith("text/") && !part.parts?.length);

  if (isFile) {
    files.push({
      filename: part.filename || "(unnamed)",
      mimeType: part.mimeType ?? "application/octet-stream",
      size: part.body?.size ?? 0,
      attachmentId: part.body?.attachmentId ?? null,
      inline: !!contentId || disposition.startsWith("inline"),
      contentId,
    });
    return;
  }

  if (part.parts?.length) {
    for (const child of part.parts) collect(child, texts, files);
    return;
  }

  if (mime === "text/plain" || mime === "text/html") {
    texts.push({ mime, charset: charsetOf(part), part });
  }
}

/** Gmail ids of the body parts too big to come inline; they have to be fetched like attachments. */
export function neededBodyAttachmentIds(message: GmailFullMessage): string[] {
  if (!message.payload) return [];
  const texts: TextPart[] = [];
  collect(message.payload, texts, []);
  return texts
    .filter((t) => !t.part.body?.data && t.part.body?.attachmentId)
    .map((t) => t.part.body!.attachmentId!);
}

/**
 * Turns Gmail's MIME tree into the pieces a reader needs: the headers, the text and HTML versions
 * of the body (parts joined in order when there are several), and the attachment list. Pure.
 * `fetchedBodies` supplies the data of body parts that did not come inline, by attachmentId.
 */
export function extractEmailContent(
  message: GmailFullMessage,
  fetchedBodies: ReadonlyMap<string, string> = new Map(),
): EmailContent {
  const texts: TextPart[] = [];
  const attachments: EmailAttachment[] = [];
  if (message.payload) collect(message.payload, texts, attachments);

  const join = (mime: TextPart["mime"]): string | null => {
    const decoded = texts
      .filter((t) => t.mime === mime)
      .map((t) => {
        const data =
          t.part.body?.data ??
          (t.part.body?.attachmentId ? fetchedBodies.get(t.part.body.attachmentId) : undefined);
        return data ? decodeBody(data, t.charset) : "";
      })
      .filter(Boolean);
    return decoded.length > 0 ? decoded.join("\n\n") : null;
  };

  const h = (name: string) => headerOf(message.payload, name);
  return {
    id: message.id,
    threadId: message.threadId,
    internalDate: message.internalDate ? Number(message.internalDate) : null,
    labelIds: message.labelIds ?? [],
    headers: {
      subject: h("Subject"),
      from: h("From"),
      to: h("To"),
      cc: h("Cc"),
      bcc: h("Bcc"),
      replyTo: h("Reply-To"),
      date: h("Date"),
      messageId: h("Message-ID"),
      inReplyTo: h("In-Reply-To"),
      references: h("References"),
    },
    text: join("text/plain"),
    html: join("text/html"),
    attachments,
  };
}

/**
 * One email in full, read with a token that already acts as the mailbox holding it. Gives back
 * Gmail's own message too (its snippet and headers), for a caller that needs more than the content.
 */
export async function readEmailContent(
  accessToken: string,
  id: string,
): Promise<{ message: GmailFullMessage; content: EmailContent }> {
  const message = await getFullMessage(accessToken, id);

  // A very long body comes as an attachment-style reference instead of inline data.
  const fetched = new Map<string, string>();
  for (const attachmentId of neededBodyAttachmentIds(message)) {
    fetched.set(attachmentId, await getAttachmentData(accessToken, id, attachmentId));
  }

  return { message, content: extractEmailContent(message, fetched) };
}

/** One email in full, read as `mailbox`. `id` is Gmail's id for that mailbox's copy (google_id). */
export async function getEmailContent(params: {
  mailbox: string;
  id: string;
}): Promise<EmailContent> {
  const accessToken = await getDelegatedAccessToken({
    subject: params.mailbox,
    scopes: [GMAIL_READONLY_SCOPE],
  });
  return (await readEmailContent(accessToken, params.id)).content;
}
