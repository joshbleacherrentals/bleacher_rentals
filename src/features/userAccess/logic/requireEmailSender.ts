import { auth } from "@clerk/nextjs/server";
import { canSendEmail, CANNOT_SEND_EMAIL_MESSAGE } from "./canSendEmail";
import { resolveUserAccessForRequest } from "./resolveUserAccessForRequest";

/**
 * Server guard for sending email: signed in, account active, and an admin, account manager or
 * accountant (see canSendEmail).
 *
 * Returns the clerk userId on success, or throws a `Response` (401 / 403) that the caller can
 * return directly from an API route.
 */
export async function requireEmailSender(): Promise<string> {
  const { userId } = await auth();

  if (!userId) {
    throw new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  const access = await resolveUserAccessForRequest(userId);

  if (access.status !== "active" || !canSendEmail(access.roles)) {
    throw new Response(JSON.stringify({ error: CANNOT_SEND_EMAIL_MESSAGE }), {
      status: 403,
      headers: { "Content-Type": "application/json" },
    });
  }

  return userId;
}
