import {
  parseMailboxSourceParams,
  resolveDomainMailboxes,
} from "@/features/gmail-integration/server/domainMailboxes";
import { requireAdmin } from "@/features/userAccess/logic/requireAdmin";
import { NextRequest, NextResponse } from "next/server";

/**
 * Development-only: lists every mailbox in a Workspace domain, so the lookup can be checked on
 * its own. Nothing is stored. 404 on any deployed build.
 *
 *   /api/dev/gmail-mailboxes                         the configured domain, asked of Google
 *   /api/dev/gmail-mailboxes?domain=tpi-3.ca         another domain (an admin of it must be in
 *                                                    GMAIL_DIRECTORY_ADMINS)
 *   /api/dev/gmail-mailboxes?source=users            the app's Users table instead of Google
 */
export async function GET(req: NextRequest) {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  try {
    await requireAdmin();

    const parsed = parseMailboxSourceParams(req.nextUrl.searchParams);
    if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });

    const resolved = await resolveDomainMailboxes(parsed);
    return NextResponse.json({ count: resolved.mailboxes.length, ...resolved });
  } catch (error: any) {
    if (error instanceof Response) return error;
    console.error("Gmail mailboxes dev error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
