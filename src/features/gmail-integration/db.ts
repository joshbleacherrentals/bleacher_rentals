import { createServiceRoleClient } from "@/utils/supabase/server";
import { isSameEmail } from "./util";
import { encryptToken } from "./tokenCrypto";

// Service role because the token never reaches clients: GmailConnections has no
// write policies and its token column is not selectable by `authenticated`.

/** The Google account chosen is not the one the user logs in with. Safe to show the user. */
export class GmailEmailMismatchError extends Error {
  constructor(loginEmail: string, googleEmail: string) {
    super(
      `You connected ${googleEmail}, but you log in as ${loginEmail}. Connect the Google account ${loginEmail}.`,
    );
    this.name = "GmailEmailMismatchError";
  }
}

/**
 * Stores (or replaces) the signed-in user's Gmail refresh token, encrypted.
 * One row per user, so reconnecting overwrites the previous token.
 *
 * `googleEmail` is the verified address of the Google account that was authorized. It must be
 * the user's login email (Users.email), because that is the address the UI shows as connected.
 */
export async function saveGmailRefreshToken(
  clerkUserId: string,
  refreshToken: string,
  googleEmail: string,
): Promise<void> {
  const supabase = await createServiceRoleClient();

  const { data: user, error: userError } = await supabase
    .from("Users")
    .select("id, email")
    .eq("clerk_user_id", clerkUserId)
    .maybeSingle();

  if (userError || !user) {
    throw new Error(
      `Could not find the user to connect Gmail for: ${userError?.message ?? "no row"}`,
    );
  }

  if (!isSameEmail(user.email, googleEmail)) {
    throw new GmailEmailMismatchError(user.email, googleEmail);
  }

  const { error } = await supabase.from("GmailConnections").upsert(
    {
      user_uuid: user.id,
      encrypted_token_value: encryptToken(refreshToken),
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_uuid" },
  );

  if (error) {
    console.error("Failed to save Gmail connection:", error);
    throw new Error(`Failed to save Gmail connection: ${error.message}`);
  }
}
