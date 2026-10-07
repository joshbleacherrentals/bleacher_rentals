import { auth } from "@clerk/nextjs/server";
import { hasAdminOrAccountantRole } from "./hasAdminOrAccountantRole";
import { resolveUserAccessForRequest } from "./resolveUserAccessForRequest";

/**
 * Server guard for reading the QuickBooks connections: admin or active accountant.
 */
export async function requireAdminOrAccountant(): Promise<string> {
  const { userId } = await auth();

  if (!userId) {
    throw new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  const access = await resolveUserAccessForRequest(userId);

  if (access.status !== "active" || !hasAdminOrAccountantRole(access.roles)) {
    throw new Response(JSON.stringify({ error: "Forbidden" }), {
      status: 403,
      headers: { "Content-Type": "application/json" },
    });
  }

  return userId;
}
