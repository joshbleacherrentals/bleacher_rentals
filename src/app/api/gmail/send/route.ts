import { ALLOWED_EMAILS_PATH } from "@/features/devEmailAllowlist/logic/allowlist";
import { guardEmailRecipients } from "@/features/devEmailAllowlist/server/guardRecipients";
import { buildRawMessage } from "@/features/gmail-integration/server/composeMessage";
import { mergeMailboxMessages } from "@/features/gmail-integration/server/contactEmails";
import {
  getDelegatedAccessToken,
  GMAIL_READONLY_SCOPE,
  GMAIL_SEND_SCOPE,
} from "@/features/gmail-integration/server/delegatedAuth";
import {
  getMessageSummary,
  GmailApiError,
  sendRawMessage,
} from "@/features/gmail-integration/server/gmailMessages";
import { parseSendRequest } from "@/features/gmail-integration/server/sendRequest";
import { isCompanyEmail } from "@/features/quotesAndBookings/utils/companyEmail";
import { NOT_COMPANY_EMAIL_MESSAGE } from "@/features/userAccess/logic/canSendEmail";
import { requireEmailSender } from "@/features/userAccess/logic/requireEmailSender";
import { createServerSupabaseClient } from "@/utils/supabase/getClerkSupabaseServerClient";
import { createServiceRoleClient } from "@/utils/supabase/server";
import { NextRequest, NextResponse } from "next/server";

/**
 * Sends an email from the signed-in user's own mailbox, through domain-wide delegation, and returns
 * the sent email in the form the contact page saves (see usePullContactEmails, saveContactEmails).
 *
 * Who may call it: an admin, an account manager or an accountant (requireEmailSender), whose
 * account email is on the company domain. The sender is read from the signed-in user's row, never
 * from the request, so nobody can send as someone else.
 *
 * In the development environment (NEXT_PUBLIC_ENVIRONMENT=development, the one behind the green
 * banner) every recipient, To, Cc and Bcc, must be on the DevAllowedEmails list, or nothing is
 * sent. That keeps testing from emailing real people. Everywhere else the check does nothing.
 *
 *   POST /api/gmail/send
 *   { to: string[], cc?: string[], bcc?: string[], subject: string, text: string,
 *     inReplyTo?: string, references?: string, thread?: { mailbox, threadId } }
 */
export async function POST(req: NextRequest) {
  try {
    const clerkUserId = await requireEmailSender();

    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: "The request body must be JSON." }, { status: 400 });
    }
    const parsed = parseSendRequest(body);
    if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });
    const request = parsed.value;

    const { data: user } = await createServerSupabaseClient()
      .from("Users")
      .select("email, first_name, last_name")
      .eq("clerk_user_id", clerkUserId)
      .single();
    const sender = user?.email?.trim().toLowerCase();
    if (!user || !sender) {
      return NextResponse.json(
        { error: "Your account has no email address, so it cannot send email." },
        { status: 400 },
      );
    }

    // Only a company mailbox can be sent from: Google has no such mailbox for a personal address.
    if (!isCompanyEmail(sender)) {
      return NextResponse.json({ error: NOT_COMPANY_EMAIL_MESSAGE }, { status: 403 });
    }

    // Before anything is asked of Google. A blocked address stops the whole send, not just itself.
    const guarded = await guardEmailRecipients(await createServiceRoleClient(), {
      to: request.to.join(", "),
      cc: request.cc.join(", "),
      bcc: request.bcc.join(", "),
    });
    if (guarded.blocked.length > 0) {
      return NextResponse.json(
        {
          error:
            `You cannot send to external emails in development: ${guarded.blocked.join(", ")}. ` +
            `Only addresses on the Allowed Emails list can be emailed here; add them at ${ALLOWED_EMAILS_PATH}.`,
        },
        { status: 403 },
      );
    }

    let accessToken: string;
    try {
      accessToken = await getDelegatedAccessToken({
        subject: sender,
        // Reading is for fetching the sent email back, so it can be saved to the thread.
        scopes: [GMAIL_SEND_SCOPE, GMAIL_READONLY_SCOPE],
      });
    } catch (error: any) {
      // Google's wording is for whoever sets the service account up, so it goes to the log; the
      // person at the screen is told what it means for them.
      console.error(`Gmail send: no delegated token for ${sender}:`, error);
      return NextResponse.json(
        {
          error:
            `Couldn't send as ${sender}: Google did not allow the app to send from that mailbox. ` +
            "That is a setup problem, not something you did wrong. Ask a developer to check it.",
        },
        { status: 502 },
      );
    }

    const name = [user.first_name, user.last_name].filter(Boolean).join(" ") || null;
    const raw = buildRawMessage({
      from: { name, address: sender },
      to: request.to,
      cc: request.cc,
      bcc: request.bcc,
      subject: request.subject,
      text: request.text,
      inReplyTo: request.inReplyTo,
      references: request.references,
    });

    // A Gmail thread id belongs to one mailbox, so it only helps in the sender's own.
    const threadId =
      request.thread && request.thread.mailbox === sender ? request.thread.threadId : undefined;
    const sent = await sendRawMessage(accessToken, raw, threadId);

    // The email is sent whatever happens next. If it cannot be read back it is simply not saved to
    // the thread now, and the next pull finds it.
    try {
      const summary = await getMessageSummary(accessToken, sent.id);
      const [message] = mergeMailboxMessages([{ mailbox: sender, messages: [summary] }]);
      return NextResponse.json({ message });
    } catch (error) {
      console.error("Gmail send: sent, but could not read the email back:", error);
      return NextResponse.json({ message: null });
    }
  } catch (error: any) {
    if (error instanceof Response) return error;
    if (error instanceof GmailApiError) {
      return NextResponse.json(
        { error: `Gmail could not send it: ${error.message}` },
        { status: 502 },
      );
    }
    console.error("Gmail send error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
