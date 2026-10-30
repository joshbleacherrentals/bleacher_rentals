import { auth } from "@clerk/nextjs/server";
import {
  CANNOT_OPEN_CONTACT_EMAILS_MESSAGE,
  CANNOT_PULL_CONTACT_EMAILS_MESSAGE,
  canOpenContactEmails,
  canPullContactEmails,
} from "./contactEmailAccess";
import type { WebRole } from "./determineAccess";
import { resolveUserAccessForRequest } from "./resolveUserAccessForRequest";

async function requireRoles(
  allowed: (roles: readonly WebRole[]) => boolean,
  refusal: string,
): Promise<string> {
  const { userId } = await auth();

  if (!userId) {
    throw new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  const access = await resolveUserAccessForRequest(userId);

  if (access.status !== "active" || !allowed(access.roles)) {
    throw new Response(JSON.stringify({ error: refusal }), {
      status: 403,
      headers: { "Content-Type": "application/json" },
    });
  }

  return userId;
}

/**
 * Server guard for pulling a contact's emails from Gmail: signed in, account active, and an admin,
 * account manager or accountant (see canPullContactEmails).
 *
 * Returns the clerk userId on success, or throws a `Response` (401 / 403) that the caller can
 * return directly from an API route.
 */
export function requireContactEmailPuller(): Promise<string> {
  return requireRoles(canPullContactEmails, CANNOT_PULL_CONTACT_EMAILS_MESSAGE);
}

/**
 * Server guard for reading one contact email from Gmail: signed in, account active, and an admin,
 * account manager, accountant or viewer (see canOpenContactEmails). Same way of refusing as
 * requireContactEmailPuller.
 */
export function requireContactEmailReader(): Promise<string> {
  return requireRoles(canOpenContactEmails, CANNOT_OPEN_CONTACT_EMAILS_MESSAGE);
}
