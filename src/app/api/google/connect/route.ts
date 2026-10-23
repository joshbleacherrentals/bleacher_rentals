import {
  buildGoogleAuthUrl,
  createGoogleOAuthClient,
  getAppBaseUrl,
  GOOGLE_STATE_COOKIE,
} from "@/features/gmail-integration/util";
import { requireAdminOrAccountManager } from "@/features/userAccess/logic/requireAdminOrAccountManager";
import { NextResponse } from "next/server";

/**
 * Starts Google OAuth for the Gmail integration.
 *
 * A random `state` is stored in an httpOnly cookie and sent to Google; the
 * callback must see the same value come back before it trusts the `code`.
 */
export async function GET() {
  try {
    await requireAdminOrAccountManager();

    const state = crypto.randomUUID();
    const url = buildGoogleAuthUrl(createGoogleOAuthClient(), state);

    const res = NextResponse.redirect(url);
    res.cookies.set(GOOGLE_STATE_COOKIE, state, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax", // must survive the top-level redirect back from Google
      path: "/api/google",
      maxAge: 60 * 10,
    });
    return res;
  } catch (error: any) {
    if (error instanceof Response) return error;
    console.error("Google connect error:", error);

    const errorUrl = new URL("/", getAppBaseUrl());
    errorUrl.searchParams.set("error", error.message ?? "Failed to start Google authorization");
    return NextResponse.redirect(errorUrl);
  }
}
