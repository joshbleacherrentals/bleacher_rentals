import { getEmailContent } from "@/features/gmail-integration/server/emailContent";
import { resolveDomainMailboxes } from "@/features/gmail-integration/server/domainMailboxes";
import { GmailApiError } from "@/features/gmail-integration/server/gmailMessages";
import { isSafeSearchAddress } from "@/features/gmail-integration/server/contactEmails";
import { requireAdmin } from "@/features/userAccess/logic/requireAdmin";
import { NextRequest, NextResponse } from "next/server";

/**
 * Development-only: one whole email, read as the mailbox that holds it. Nothing is stored. 404 on
 * any deployed build.
 *
 *   /api/dev/gmail-email?mailbox=paul@tpi-3.ca&id=1a15f4ce83c6ef44
 *     mailbox  the mailbox the copy lives in (EmailMessages.mailbox)
 *     id       Gmail's id for that copy (EmailMessages.google_id) - not the Message-ID header
 *     source   "users" to check the mailbox against the Users table instead of Google's directory
 *
 * The mailbox comes from the request, so it is checked against the domain's real mailbox list
 * first: this cannot be pointed at an alias or an address outside the company.
 */
export async function GET(req: NextRequest) {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  try {
    await requireAdmin();

    const params = req.nextUrl.searchParams;
    const mailbox = params.get("mailbox")?.trim().toLowerCase() ?? "";
    if (!isSafeSearchAddress(mailbox)) {
      return NextResponse.json({ error: "Pass a mailbox address as ?mailbox=" }, { status: 400 });
    }
    const id = params.get("id")?.trim() ?? "";
    if (!/^[0-9a-f]{8,32}$/i.test(id)) {
      return NextResponse.json({ error: "Pass Gmail's message id as ?id=" }, { status: 400 });
    }

    const { mailboxes, domain } = await resolveDomainMailboxes({
      domain: mailbox.split("@")[1],
      source: params.get("source") === "users" ? "users" : "directory",
    });
    if (!mailboxes.includes(mailbox)) {
      return NextResponse.json(
        { error: `${mailbox} is not a mailbox in ${domain}` },
        { status: 404 },
      );
    }

    const email = await getEmailContent({ mailbox, id });
    return NextResponse.json({ mailbox, ...email });
  } catch (error: any) {
    if (error instanceof Response) return error;
    // Gmail answers 404 for a well-formed id that is not in the mailbox, and 400 for one it cannot parse.
    if (error instanceof GmailApiError && (error.status === 404 || error.status === 400)) {
      return NextResponse.json(
        { error: "That mailbox has no email with that id" },
        { status: 404 },
      );
    }
    console.error("Gmail email dev error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
