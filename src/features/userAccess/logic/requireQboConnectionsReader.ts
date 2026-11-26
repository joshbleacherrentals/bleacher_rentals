import { auth } from "@clerk/nextjs/server";
import { hasQboConnectionsReaderRole } from "./hasQboConnectionsReaderRole";
import { resolveUserAccessForRequest } from "./resolveUserAccessForRequest";

/**
 * Server guard for reading the QuickBooks connections: admin, accountant, account manager or
 * maintainer (docs/specs/vendors-page.md D14). Writing a connection stays admin-only.
 */
export async function requireQboConnectionsReader(): Promise<string> {
  const { userId } = await auth();

  if (!userId) {
    throw new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  const access = await resolveUserAccessForRequest(userId);

  if (access.status !== "active" || !hasQboConnectionsReaderRole(access.roles)) {
    throw new Response(JSON.stringify({ error: "Forbidden" }), {
      status: 403,
      headers: { "Content-Type": "application/json" },
    });
  }

  return userId;
}
