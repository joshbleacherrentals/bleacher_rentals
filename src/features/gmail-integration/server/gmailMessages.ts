import "server-only";

const GMAIL_API = "https://gmail.googleapis.com/gmail/v1/users/me";

export type GmailMessageSummary = {
  /** Gmail's id for this copy of the message. It belongs to one mailbox. */
  id: string;
  threadId: string;
  /** The `Message-ID` header: the same email in two mailboxes shares it, so it deduplicates. */
  messageId: string | null;
  /** The `In-Reply-To` header: the Message-ID of the email this one answers. */
  inReplyTo: string | null;
  /** The `References` header: the Message-IDs of the whole conversation before this email. */
  references: string | null;
  from: string | null;
  to: string | null;
  cc: string | null;
  subject: string | null;
  date: string | null;
  snippet: string;
  /** When Google received it, in epoch milliseconds. Used to order and to page back in time. */
  internalDate: number | null;
  /** Gmail labels such as INBOX and SENT. */
  labelIds: string[];
};

type GmailMessageResponse = {
  id: string;
  threadId: string;
  snippet?: string;
  internalDate?: string;
  labelIds?: string[];
  payload?: { headers?: { name: string; value: string }[] };
};

const METADATA_HEADERS = [
  "From",
  "To",
  "Cc",
  "Subject",
  "Date",
  "Message-ID",
  "In-Reply-To",
  "References",
];

export function summarizeMessage(message: GmailMessageResponse): GmailMessageSummary {
  const header = (name: string) =>
    message.payload?.headers?.find((h) => h.name.toLowerCase() === name.toLowerCase())?.value ??
    null;

  return {
    id: message.id,
    threadId: message.threadId,
    messageId: header("Message-ID"),
    inReplyTo: header("In-Reply-To"),
    references: header("References"),
    from: header("From"),
    to: header("To"),
    cc: header("Cc"),
    subject: header("Subject"),
    date: header("Date"),
    snippet: message.snippet ?? "",
    internalDate: message.internalDate ? Number(message.internalDate) : null,
    labelIds: message.labelIds ?? [],
  };
}

/** A Gmail API refusal, with its HTTP status so a caller can tell "not found" from a real failure. */
export class GmailApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(`Gmail API ${status}: ${message}`);
    this.name = "GmailApiError";
  }
}

async function gmailGet<T>(accessToken: string, path: string): Promise<T> {
  const res = await fetch(`${GMAIL_API}${path}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new GmailApiError(res.status, body?.error?.message ?? res.statusText);
  }
  return res.json();
}

async function gmailPost<T>(accessToken: string, path: string, body: unknown): Promise<T> {
  const res = await fetch(`${GMAIL_API}${path}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const failure = await res.json().catch(() => ({}));
    throw new GmailApiError(res.status, failure?.error?.message ?? res.statusText);
  }
  return res.json();
}

/**
 * Sends a message, as the mailbox the token acts as. `raw` is the whole message in base64url (see
 * composeMessage.ts). With a `threadId` it joins that thread of the mailbox, which Gmail only
 * allows when the headers match the thread; without one it starts a thread of its own there.
 */
export async function sendRawMessage(
  accessToken: string,
  raw: string,
  threadId?: string,
): Promise<{ id: string; threadId: string; labelIds?: string[] }> {
  return gmailPost(accessToken, "/messages/send", threadId ? { raw, threadId } : { raw });
}

/** One part of a message's MIME tree, as `format=full` returns it. */
export type GmailMessagePart = {
  partId?: string;
  mimeType?: string;
  filename?: string;
  headers?: { name: string; value: string }[];
  body?: { size?: number; data?: string; attachmentId?: string };
  parts?: GmailMessagePart[];
};

export type GmailFullMessage = {
  id: string;
  threadId: string;
  snippet?: string;
  internalDate?: string;
  labelIds?: string[];
  payload?: GmailMessagePart;
};

/** One whole message: headers, body and attachment list. The expensive call, so only on demand. */
export async function getFullMessage(accessToken: string, id: string): Promise<GmailFullMessage> {
  return gmailGet<GmailFullMessage>(accessToken, `/messages/${encodeURIComponent(id)}?format=full`);
}

/** The bytes of one attachment, or of a body part too big to come inline, as base64url. */
export async function getAttachmentData(
  accessToken: string,
  messageId: string,
  attachmentId: string,
): Promise<string> {
  const attachment = await gmailGet<{ data?: string }>(
    accessToken,
    `/messages/${encodeURIComponent(messageId)}/attachments/${encodeURIComponent(attachmentId)}`,
  );
  return attachment.data ?? "";
}

/**
 * The ids of up to `maxResults` messages matching a Gmail search (`query`), newest first, or of the
 * newest messages when there is no query. Cheap: the list call returns only ids. `hasMore` says
 * there are further matches beyond this page.
 */
export async function listMessageIds(
  accessToken: string,
  query: string | undefined,
  maxResults: number,
): Promise<{ ids: string[]; hasMore: boolean }> {
  const params = new URLSearchParams();
  if (query) params.set("q", query);
  params.set("maxResults", String(maxResults));

  const list = await gmailGet<{ messages?: { id: string }[]; nextPageToken?: string }>(
    accessToken,
    `/messages?${params}`,
  );
  return { ids: (list.messages ?? []).map((m) => m.id), hasMore: !!list.nextPageToken };
}

/** One message's headers and snippet, without its body. The expensive call: one per message. */
export async function getMessageSummary(
  accessToken: string,
  id: string,
): Promise<GmailMessageSummary> {
  const headers = METADATA_HEADERS.map((h) => `metadataHeaders=${encodeURIComponent(h)}`).join("&");
  return summarizeMessage(
    await gmailGet<GmailMessageResponse>(
      accessToken,
      `/messages/${encodeURIComponent(id)}?format=metadata&${headers}`,
    ),
  );
}

/** One page of what was added to a mailbox since a history id (see listHistory). */
export type GmailHistoryPage = {
  /** The messages added in this page, with their labels, oldest change first. */
  added: { id: string; labelIds: string[] }[];
  /** The id of the last change on this page: where to carry on from if the pages are cut short. */
  lastRecordId: string | null;
  /** The mailbox's current history id: where the next sync starts once every page is read. */
  historyId: string | null;
  nextPageToken: string | null;
};

/**
 * What was added to the mailbox the token acts as since `startHistoryId`. Gmail keeps a history id
 * for about a week: an older one is answered with a 404 (a GmailApiError), which means the changes
 * can no longer be listed and the mailbox has to be caught up another way.
 */
export async function listHistory(
  accessToken: string,
  startHistoryId: string,
  pageToken?: string,
): Promise<GmailHistoryPage> {
  const params = new URLSearchParams({
    startHistoryId,
    historyTypes: "messageAdded",
    maxResults: "500",
  });
  if (pageToken) params.set("pageToken", pageToken);

  const page = await gmailGet<{
    history?: {
      id: string;
      messagesAdded?: { message: { id: string; labelIds?: string[] } }[];
    }[];
    nextPageToken?: string;
    historyId?: string;
  }>(accessToken, `/history?${params}`);

  const records = page.history ?? [];
  return {
    added: records.flatMap((record) =>
      (record.messagesAdded ?? []).map(({ message }) => ({
        id: message.id,
        labelIds: message.labelIds ?? [],
      })),
    ),
    lastRecordId: records.length > 0 ? records[records.length - 1].id : null,
    historyId: page.historyId ?? null,
    nextPageToken: page.nextPageToken ?? null,
  };
}

/** The mailbox's current history id: "now", for starting to follow it from here. */
export async function getProfileHistoryId(accessToken: string): Promise<string> {
  const profile = await gmailGet<{ historyId: string }>(accessToken, "/profile");
  return profile.historyId;
}

/**
 * Asks Gmail to publish to the Pub/Sub topic whenever the mailbox changes, for the Inbox and Sent
 * only. Lasts about a week, so it is called again before then (watching again simply renews it).
 * Gives back the mailbox's current history id and when the watch ends. A mailbox has one watch at a
 * time for the whole Cloud project: a second caller replaces the first.
 */
export async function watchMailbox(
  accessToken: string,
  topicName: string,
): Promise<{ historyId: string; expiresAt: Date }> {
  const watch = await gmailPost<{ historyId: string; expiration: string }>(accessToken, "/watch", {
    topicName,
    labelIds: ["INBOX", "SENT"],
    labelFilterBehavior: "INCLUDE",
  });
  return { historyId: watch.historyId, expiresAt: new Date(Number(watch.expiration)) };
}

/** The newest `count` messages in the mailbox the token acts as, headers and snippet only. */
export async function listLatestMessages(
  accessToken: string,
  count: number,
): Promise<GmailMessageSummary[]> {
  const { ids } = await listMessageIds(accessToken, undefined, count);
  return Promise.all(ids.map((id) => getMessageSummary(accessToken, id)));
}
