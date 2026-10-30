import { GmailEmailMismatchError, saveGmailRefreshToken } from "@/features/gmail-integration/db";
import {
  createGoogleOAuthClient,
  getAppBaseUrl,
  GOOGLE_STATE_COOKIE,
} from "@/features/gmail-integration/util";
import { requireActiveUser } from "@/features/userAccess/logic/requireActiveUser";
import { NextRequest, NextResponse } from "next/server";

function redirectHome(params: Record<string, string>) {
  const url = new URL("/", getAppBaseUrl());
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);

  const res = NextResponse.redirect(url);
  // One-shot: the state is spent whether the flow succeeded or not.
  res.cookies.set(GOOGLE_STATE_COOKIE, "", { path: "/api/google", maxAge: 0 });
  return res;
}

/**
 * Finishes Google OAuth for the Gmail integration.
 *
 * Verifies the CSRF `state`, trades the `code` for tokens, checks the ID token,
 * and stores the encrypted refresh token against the signed-in user.
 */
export async function GET(req: NextRequest) {
  try {
    const userId = await requireActiveUser();

    const params = req.nextUrl.searchParams;

    // The user clicked "Cancel" on Google's consent screen (error=access_denied).
    const googleError = params.get("error");
    if (googleError) return redirectHome({ error: `Google authorization failed: ${googleError}` });

    const code = params.get("code");
    const state = params.get("state");
    const expectedState = req.cookies.get(GOOGLE_STATE_COOKIE)?.value;
    if (!code || !state || !expectedState || state !== expectedState) {
      return redirectHome({ error: "Google authorization could not be verified. Please retry." });
    }

    const client = createGoogleOAuthClient();
    const { tokens } = await client.getToken(code);

    if (!tokens.refresh_token) {
      return redirectHome({
        error:
          "Google did not return a refresh token. Remove the app's access in your Google account and retry.",
      });
    }
    if (!tokens.id_token) {
      return redirectHome({ error: "Google did not return an ID token." });
    }

    const ticket = await client.verifyIdToken({
      idToken: tokens.id_token,
      audience: process.env.GOOGLE_CLIENT_ID,
    });
    const payload = ticket.getPayload();
    if (!payload?.email || !payload.email_verified) {
      return redirectHome({ error: "Google did not return a verified email address." });
    }

    await saveGmailRefreshToken(userId, tokens.refresh_token, payload.email);

    return redirectHome({ gmail: "connected" });
  } catch (error: any) {
    if (error instanceof Response) return error;
    // Expected user mistake, with a message written for them: not a server error.
    if (error instanceof GmailEmailMismatchError) return redirectHome({ error: error.message });
    console.error("Google callback error:", error);
    return redirectHome({ error: error.message ?? "Failed to finish Google authorization" });
  }
}
