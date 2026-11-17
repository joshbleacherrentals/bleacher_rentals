import { auth } from "@clerk/nextjs/server";
import { createClient } from "@supabase/supabase-js";
import type { McpDeps } from "./handleMcpRequest";
import { publicOrigin } from "./oauthMetadata";
import { getAnalyticsPool } from "./pool";

function getSupabaseAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

/** The real Clerk, Supabase and database behind handleMcpRequest (docs/specs/analytics-mcp.md §6). */
export function buildMcpDeps(req: Request): McpDeps {
  return {
    // Reads the OAuth access token from the Authorization header and has Clerk verify it.
    getIdentity: async () => {
      const a = await auth({ acceptsToken: "oauth_token" });
      return a.isAuthenticated && a.userId ? { clerkUserId: a.userId } : null;
    },

    findUser: async (clerkUserId) => {
      const { data, error } = await getSupabaseAdmin()
        .from("Users")
        .select("id, status_uuid")
        .eq("clerk_user_id", clerkUserId)
        .maybeSingle();
      if (error) throw new Error(error.message);
      return data;
    },

    pool: getAnalyticsPool(),

    // The service role writes the log: the analytics database role cannot.
    writeLog: async (entry) => {
      const { error } = await getSupabaseAdmin().from("McpQueryLog").insert(entry);
      if (error) throw new Error(error.message);
    },

    resourceMetadataUrl: `${publicOrigin(req)}/.well-known/oauth-protected-resource`,
  };
}
