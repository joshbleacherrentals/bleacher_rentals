export type PreviewAttachment = { name: string; url: string };

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
    if (!email || !email.includes("@") || seen.has(email.toLowerCase())) continue;
    seen.add(email.toLowerCase());
    out.push(email);
  }
  return out;
}

export async function postSendQuote(
  eventId: string,
  recipientEmails: string[],
): Promise<{ ok: true } | { ok: false; message: string }> {
  try {
    const res = await fetch(`/api/quotes/${eventId}/send`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ recipientEmails }),
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
