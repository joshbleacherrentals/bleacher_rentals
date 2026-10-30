import "server-only";

import { OAuth2Client } from "google-auth-library";

import { getAppBaseUrl } from "../util";

// A Pub/Sub push subscription can sign each request it sends with a token for a service account
// (set when the subscription is made). The push route is open to the internet, so it only accepts
// a request carrying a valid token that names the audience and the service account we expect.

export type PubSubAuthConfig = {
  /** The audience set on the subscription: normally the push route's own URL. */
  audience: string | undefined;
  /** The service account the subscription signs as. */
  serviceAccount: string | undefined;
};

export type IdTokenVerifier = (
  idToken: string,
  audience: string,
) => Promise<{ email?: string; email_verified?: boolean } | undefined>;

const googleVerifier: IdTokenVerifier = async (idToken, audience) => {
  const ticket = await new OAuth2Client().verifyIdToken({ idToken, audience });
  return ticket.getPayload();
};

/**
 * Both settings default to what the app already has: the push route's URL under the app's own URL
 * (NEXT_PUBLIC_APP_URL), and the service account the mailbox access runs as. GMAIL_PUSH_AUDIENCE and
 * GMAIL_PUSH_SERVICE_ACCOUNT override them.
 */
export function pubSubAuthConfigFromEnv(): PubSubAuthConfig {
  return {
    audience: process.env.GMAIL_PUSH_AUDIENCE?.trim() || `${getAppBaseUrl()}/api/gmail/push`,
    serviceAccount:
      process.env.GMAIL_PUSH_SERVICE_ACCOUNT?.trim() ||
      process.env.GMAIL_DWD_SERVICE_ACCOUNT_EMAIL?.trim() ||
      undefined,
  };
}

export type PubSubAuthResult = { ok: true } | { ok: false; status: number; reason: string };

/**
 * Whether a request really came from our Pub/Sub subscription. Fails closed: with the audience or
 * the service account not configured, nothing is accepted (a 500, so the missing setting is seen).
 */
export async function verifyPubSubPush(
  req: Request,
  config: PubSubAuthConfig = pubSubAuthConfigFromEnv(),
  verify: IdTokenVerifier = googleVerifier,
): Promise<PubSubAuthResult> {
  if (!config.audience || !config.serviceAccount) {
    return {
      ok: false,
      status: 500,
      reason:
        "The push audience and service account are not set: set GMAIL_PUSH_SERVICE_ACCOUNT (or GMAIL_DWD_SERVICE_ACCOUNT_EMAIL) and NEXT_PUBLIC_APP_URL (or GMAIL_PUSH_AUDIENCE).",
    };
  }

  const header = req.headers.get("authorization") ?? "";
  const token = header.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!token) return { ok: false, status: 401, reason: "Missing bearer token." };

  let payload: Awaited<ReturnType<IdTokenVerifier>>;
  try {
    payload = await verify(token, config.audience);
  } catch {
    return { ok: false, status: 401, reason: "Invalid token." };
  }

  if (
    !payload?.email_verified ||
    payload.email?.toLowerCase() !== config.serviceAccount.toLowerCase()
  ) {
    return { ok: false, status: 403, reason: "Token is not from the expected service account." };
  }
  return { ok: true };
}

/**
 * What a Gmail push says: which mailbox changed, and its history id then. The body is Pub/Sub's
 * envelope, `{ message: { data: <base64 of {"emailAddress","historyId"}> } }`. Null when it is
 * anything else.
 */
export function parsePushBody(body: unknown): { mailbox: string; historyId: string } | null {
  const data = (body as { message?: { data?: unknown } } | null)?.message?.data;
  if (typeof data !== "string") return null;

  try {
    const note = JSON.parse(Buffer.from(data, "base64").toString("utf8")) as {
      emailAddress?: unknown;
      historyId?: unknown;
    };
    if (typeof note.emailAddress !== "string" || !note.emailAddress.includes("@")) return null;
    if (typeof note.historyId !== "string" && typeof note.historyId !== "number") return null;
    return { mailbox: note.emailAddress.trim().toLowerCase(), historyId: String(note.historyId) };
  } catch {
    return null;
  }
}
