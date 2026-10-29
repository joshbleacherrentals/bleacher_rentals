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
import {
  checkOwnUnsentEmail,
  findEmailRow,
  recordFailedEmail,
  recordSentEmail,
  ROW_WAIT,
  sentEmailColumns,
} from "@/features/gmail-integration/server/unsentEmail";
import { isCompanyEmail } from "@/features/quotesAndBookings/utils/companyEmail";
import { NOT_COMPANY_EMAIL_MESSAGE } from "@/features/userAccess/logic/canSendEmail";
import { requireEmailSender } from "@/features/userAccess/logic/requireEmailSender";
import { createServerSupabaseClient } from "@/utils/supabase/getClerkSupabaseServerClient";
import { createServiceRoleClient } from "@/utils/supabase/server";
import { NextRequest, NextResponse } from "next/server";

/**
 * Sends an email from the signed-in user's own mailbox, through domain-wide delegation.
 *
 * The page has already saved the reply when Send was pressed, as an EmailMessages row with status
 * 'sending' (see createPendingEmail), and the request carries that row's id as `emailMessageUuid`.
 * This route sends the email and then updates that row rather than creating one: it marks it
 * 'success' and fills in what only Gmail knows (its ids, its snippet, its date). If the email
 * cannot be sent it marks the row 'error' with the reason, which the email then shows. A signed-in
 * user cannot do either themselves; that is why it is done here.
 *
 * Who may call it: an admin, an account manager or an accountant (requireEmailSender), whose
 * account email is on the company domain. The sender is read from the signed-in user's row, never
 * from the request, so nobody can send as someone else, and only the sender's own email still
 * 'sending' is ever updated.
 *
 * In the development environment (NEXT_PUBLIC_ENVIRONMENT=development, the one behind the green
 * banner) every recipient, To, Cc and Bcc, must be on the DevAllowedEmails list, or nothing is
 * sent. That keeps testing from emailing real people. Everywhere else the check does nothing.
 *
 *   POST /api/gmail/send
 *   { emailMessageUuid: string, to: string[], cc?: string[], bcc?: string[], subject: string,
 *     text: string, inReplyTo?: string, references?: string, thread?: { mailbox, threadId } }
 *   -> { ok: true, recorded: boolean }  (recorded is false when its row could not be updated)
 */
export async function POST(req: NextRequest) {
  // Set once the sender is known. Refuses a request, and marks the saved email failed with the
  // reason, so the email itself says why it was not sent.
  let refuse: ((message: string, status: number) => Promise<NextResponse>) | null = null;

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

    const admin = await createServiceRoleClient();
    refuse = async (message, status) => {
      try {
        await recordFailedEmail(admin, {
          id: request.emailMessageUuid,
          sender,
          reason: message,
          wait: ROW_WAIT,
        });
      } catch (error) {
        console.error("Gmail send: could not mark the email as failed:", error);
      }
      return NextResponse.json({ error: message }, { status });
    };

    // A second request for an email that was already sent, or one that is not this user's, is
    // refused before anything is sent. A row that has not reached the database yet (the page
    // uploads it in the background) is fine: it is looked for again once the email is sent.
    const existing = await findEmailRow(admin, request.emailMessageUuid);
    const problem = existing ? checkOwnUnsentEmail(existing, sender) : null;
    if (problem) return NextResponse.json({ error: problem }, { status: 409 });

    // Before anything is asked of Google. A blocked address stops the whole send, not just itself.
    const guarded = await guardEmailRecipients(admin, {
      to: request.to.join(", "),
      cc: request.cc.join(", "),
      bcc: request.bcc.join(", "),
    });
    if (guarded.blocked.length > 0) {
      return refuse(
        `You cannot send to external emails in development: ${guarded.blocked.join(", ")}. ` +
          `Only addresses on the Allowed Emails list can be emailed here; add them at ${ALLOWED_EMAILS_PATH}.`,
        403,
      );
    }

    let accessToken: string;
    try {
      accessToken = await getDelegatedAccessToken({
        subject: sender,
        // Reading is for fetching the sent email back, so its row can be filled in.
        scopes: [GMAIL_SEND_SCOPE, GMAIL_READONLY_SCOPE],
      });
    } catch (error: any) {
      // Google's wording is for whoever sets the service account up, so it goes to the log; the
      // person at the screen is told what it means for them.
      console.error(`Gmail send: no delegated token for ${sender}:`, error);
      return refuse(
        `Couldn't send as ${sender}: Google did not allow the app to send from that mailbox. ` +
          "That is a setup problem, not something you did wrong. Ask a developer to check it.",
        502,
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

    // The email is sent. Nothing below may make it look unsent: a failure from here on is logged,
    // never reported as a failed send, or the writer would send it again.
    let columns: Record<string, unknown> = {
      google_id: sent.id,
      google_thread_id: sent.threadId,
    };
    try {
      const summary = await getMessageSummary(accessToken, sent.id);
      const [email] = mergeMailboxMessages([{ mailbox: sender, messages: [summary] }]);
      columns = sentEmailColumns(email);
    } catch (error) {
      console.error("Gmail send: sent, but could not read the email back:", error);
    }

    try {
      const outcome = await recordSentEmail(admin, {
        id: request.emailMessageUuid,
        sender,
        columns,
        wait: ROW_WAIT,
      });
      if (outcome === "missing") {
        console.error(
          `Gmail send: sent, but there was no unsent email ${request.emailMessageUuid} to update.`,
        );
      }
      return NextResponse.json({ ok: true, recorded: outcome !== "missing" });
    } catch (error) {
      console.error("Gmail send: sent, but could not update its row:", error);
      return NextResponse.json({ ok: true, recorded: false });
    }
  } catch (error: any) {
    if (error instanceof Response) return error;

    const gmail = error instanceof GmailApiError;
    if (!gmail) console.error("Gmail send error:", error);
    const message = gmail ? `Gmail could not send it: ${error.message}` : error.message;
    const status = gmail ? 502 : 500;
    return refuse ? refuse(message, status) : NextResponse.json({ error: message }, { status });
  }
}
