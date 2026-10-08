import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { createClient } from "@supabase/supabase-js";
import * as postmark from "postmark";
import { guardUserRecipients } from "@/features/devEmailAllowlist/server/guardRecipients";

function getSupabaseAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

type MentionNotifyBody = {
  eventUuid: string;
  senderUserUuid: string;
  senderName: string;
  messageBody: string;
  mentionedUserUuids: string[];
};

export async function POST(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const {
    eventUuid,
    senderUserUuid,
    senderName,
    messageBody,
    mentionedUserUuids,
  }: MentionNotifyBody = await req.json();

  if (!eventUuid || !senderUserUuid || !messageBody || !Array.isArray(mentionedUserUuids)) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }

  const recipientUuids = [...new Set(mentionedUserUuids)].filter(
    (uuid) => uuid && uuid !== senderUserUuid,
  );

  if (recipientUuids.length === 0) {
    return NextResponse.json({ sent: 0, reason: "no_mention_recipients" });
  }

  const apiKey = process.env.POSTMARK_API_KEY;
  const fromEmail = process.env.POSTMARK_FROM_EMAIL;
  if (!apiKey || !fromEmail || apiKey === "your_postmark_api_key_here") {
    console.log("[event-mention-notify] Postmark not configured");
    return NextResponse.json({ error: "Postmark not configured" }, { status: 500 });
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? new URL(req.url).origin;
  const supabase = getSupabaseAdmin();

  const { data: event, error: eventErr } = await supabase
    .from("Events")
    .select("id, event_name")
    .eq("id", eventUuid)
    .eq("deleted", 0)
    .single();

  if (eventErr) {
    console.log("[event-mention-notify] event fetch error:", eventErr.message);
    return NextResponse.json({ error: "Event not found" }, { status: 404 });
  }

  const eventName = event.event_name?.trim() || "Untitled event";
  const chatLink = `${appUrl}/quotes-bookings/${eventUuid}?tab=messages`;

  const { data: users, error: usersErr } = await supabase
    .from("Users")
    .select("id, first_name, last_name, email")
    .in("id", recipientUuids);

  if (usersErr) {
    console.log("[event-mention-notify] users error:", usersErr.message);
    return NextResponse.json({ error: "Failed to load recipients" }, { status: 500 });
  }

  const withEmail = (users ?? []).filter((user) => !!user.email);
  if (withEmail.length === 0) {
    return NextResponse.json({ sent: 0, reason: "no_emails_on_users" });
  }

  // Development only: drop anyone who is not on the allowed emails list.
  const { allowed: recipients, blocked } = await guardUserRecipients(supabase, withEmail);
  if (recipients.length === 0) {
    return NextResponse.json({ sent: 0, reason: "blocked_in_development", blocked });
  }

  console.log(
    "[event-mention-notify] recipients:",
    recipients.map((user) => ({ id: user.id, email: user.email })),
  );

  const safeSenderName = escapeHtml(senderName?.trim() || "Someone");
  const safeEventName = escapeHtml(eventName);
  const safeMessageBody = escapeHtml(messageBody.trim());

  const htmlBody = `
<html>
  <body style="font-family: sans-serif; color: #1f2937; max-width: 600px; margin: 0 auto; padding: 24px;">
    <p style="font-size: 16px; margin-bottom: 8px;">
      <strong>${safeSenderName}</strong> mentioned you in
      <strong>${safeEventName}</strong>:
    </p>
    <blockquote style="border-left: 3px solid #d1d5db; margin: 16px 0; padding: 12px 16px; background: #f9fafb; color: #374151; border-radius: 4px;">
      ${safeMessageBody}
    </blockquote>
    <a href="${chatLink}" style="display: inline-block; margin-top: 16px; padding: 10px 20px; background-color: #4a90d9; color: #ffffff; text-decoration: none; border-radius: 6px; font-size: 14px;">
      View message
    </a>
    <p style="margin-top: 24px; font-size: 12px; color: #9ca3af;">
      You received this because someone @mentioned you in an internal event chat message.
    </p>
  </body>
</html>
  `.trim();

  const textBody = `${senderName?.trim() || "Someone"} mentioned you in ${eventName}:\n\n${messageBody.trim()}\n\nView message: ${chatLink}`;

  const client = new postmark.ServerClient(apiKey);
  const messages: postmark.Models.Message[] = recipients.map((user) => ({
    From: fromEmail,
    To: user.email!,
    Subject: `You were mentioned in ${eventName}`,
    HtmlBody: htmlBody,
    TextBody: textBody,
    MessageStream: "outbound",
  }));

  console.log("[event-mention-notify] sending", messages.length, "emails via Postmark");
  const results = await client.sendEmailBatch(messages);

  const delivery = results.map((result, index) => ({
    email: messages[index]?.To ?? null,
    ok: result.ErrorCode === 0,
    errorCode: result.ErrorCode,
    message: result.Message,
    messageId: result.MessageID ?? null,
  }));

  const sent = delivery.filter((item) => item.ok).length;
  const failed = delivery.filter((item) => !item.ok);

  if (failed.length > 0) {
    console.error("[event-mention-notify] failed deliveries:", failed);
  }

  return NextResponse.json({ sent, failed: failed.length, delivery });
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
