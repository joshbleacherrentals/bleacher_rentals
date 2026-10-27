import "server-only";

const GMAIL_API = "https://gmail.googleapis.com/gmail/v1/users/me";

export type GmailMessageSummary = {
  id: string;
  threadId: string;
  from: string | null;
  subject: string | null;
  date: string | null;
  snippet: string;
};

type GmailMessageResponse = {
  id: string;
  threadId: string;
  snippet?: string;
  payload?: { headers?: { name: string; value: string }[] };
};

export function summarizeMessage(message: GmailMessageResponse): GmailMessageSummary {
  const header = (name: string) =>
    message.payload?.headers?.find((h) => h.name.toLowerCase() === name.toLowerCase())?.value ??
    null;

  return {
    id: message.id,
    threadId: message.threadId,
    from: header("From"),
    subject: header("Subject"),
    date: header("Date"),
    snippet: message.snippet ?? "",
  };
}

async function gmailGet<T>(accessToken: string, path: string): Promise<T> {
  const res = await fetch(`${GMAIL_API}${path}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(`Gmail API ${res.status}: ${body?.error?.message ?? res.statusText}`);
  }
  return res.json();
}

/** The newest `count` messages in the mailbox the token acts as, headers and snippet only. */
export async function listLatestMessages(
  accessToken: string,
  count: number,
): Promise<GmailMessageSummary[]> {
  const list = await gmailGet<{ messages?: { id: string }[] }>(
    accessToken,
    `/messages?maxResults=${count}`,
  );

  return Promise.all(
    (list.messages ?? []).map(async ({ id }) =>
      summarizeMessage(
        await gmailGet<GmailMessageResponse>(
          accessToken,
          `/messages/${id}?format=metadata&metadataHeaders=From&metadataHeaders=Subject&metadataHeaders=Date`,
        ),
      ),
    ),
  );
}
