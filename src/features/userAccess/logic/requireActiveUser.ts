import { auth } from "@clerk/nextjs/server";
import { resolveUserAccessForRequest } from "./resolveUserAccessForRequest";

/**
 * Server guard for flows open to every person who can use the web app, whatever
 * their role: signed in, account active, and at least one web role.
 *
 * Returns the clerk userId on success, or throws a `Response` (401 / 403) that
 * the caller can return directly from an API route. Driver-only accounts have
 * no web access, so they are refused.
 */
export async function requireActiveUser(): Promise<string> {
  const { userId } = await auth();

  if (!userId) {
    throw new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  const access = await resolveUserAccessForRequest(userId);

  if (access.status !== "active") {
    throw new Response(JSON.stringify({ error: "Forbidden" }), {
      status: 403,
      headers: { "Content-Type": "application/json" },
    });
  }

  return userId;
}
