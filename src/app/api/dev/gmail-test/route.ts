import {
  getDelegatedAccessToken,
  GMAIL_READONLY_SCOPE,
} from "@/features/gmail-integration/server/delegatedAuth";
import { listLatestMessages } from "@/features/gmail-integration/server/gmailMessages";
import { requireAdmin } from "@/features/userAccess/logic/requireAdmin";
import { NextResponse } from "next/server";

/**
 * Development-only check of the domain-wide delegation setup: reads the newest 5 messages of
 * the mailbox in GMAIL_DEV_TEST_MAILBOX. The mailbox comes from the environment, never the
 * request, so this cannot be pointed at someone else's inbox. 404 on any deployed build.
 */
export async function GET() {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  try {
    await requireAdmin();

    const mailbox = process.env.GMAIL_DEV_TEST_MAILBOX;
    if (!mailbox) throw new Error("GMAIL_DEV_TEST_MAILBOX is not set");

    const accessToken = await getDelegatedAccessToken({
      subject: mailbox,
      scopes: [GMAIL_READONLY_SCOPE],
    });
    const messages = await listLatestMessages(accessToken, 5);

    return NextResponse.json({ mailbox, messages });
  } catch (error: any) {
    if (error instanceof Response) return error;
    console.error("Gmail dev test error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
