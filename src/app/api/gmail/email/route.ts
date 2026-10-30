import { isSafeSearchAddress } from "@/features/gmail-integration/server/contactEmails";
import { getEmailContent } from "@/features/gmail-integration/server/emailContent";
import { GmailApiError } from "@/features/gmail-integration/server/gmailMessages";
import { isSavedContactEmail } from "@/features/gmail-integration/server/savedContactEmail";
import { requireContactEmailReader } from "@/features/userAccess/logic/requireContactEmailAccess";
import { createServiceRoleClient } from "@/utils/supabase/server";
import { NextRequest, NextResponse } from "next/server";

/**
 * One whole email, read as the mailbox that holds it. This is what opening an email on a contact's
 * page asks for when it has not been opened before; the page saves what comes back, this route
 * stores nothing.
 *
 * Who may call it: an admin, an account manager, an accountant or a viewer
 * (requireContactEmailReader).
 *
 *   /api/gmail/email?mailbox=paul@bleacherrentals.com&id=1a15f4ce83c6ef44
 *     mailbox  the mailbox the copy lives in (EmailMessages.mailbox)
 *     id       Gmail's id for that copy (EmailMessages.google_id) - not the Message-ID header
 *
 * The mailbox and id come from the request, so they must name an email that was saved onto a
 * contact (see isSavedContactEmail), and Google is not asked about anything else.
 */
export async function GET(req: NextRequest) {
  try {
    await requireContactEmailReader();

    const params = req.nextUrl.searchParams;
    const mailbox = params.get("mailbox")?.trim().toLowerCase() ?? "";
    if (!isSafeSearchAddress(mailbox)) {
      return NextResponse.json({ error: "Pass a mailbox address as ?mailbox=" }, { status: 400 });
    }
    const id = params.get("id")?.trim() ?? "";
    if (!/^[0-9a-f]{8,32}$/i.test(id)) {
      return NextResponse.json({ error: "Pass Gmail's message id as ?id=" }, { status: 400 });
    }

    if (!(await isSavedContactEmail(await createServiceRoleClient(), { mailbox, googleId: id }))) {
      return NextResponse.json(
        { error: "That mailbox has no email with that id on a contact" },
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
    console.error("Gmail email error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
