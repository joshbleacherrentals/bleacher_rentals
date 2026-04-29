import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { createClient } from "@supabase/supabase-js";
import * as postmark from "postmark";

function getSupabaseAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

export async function POST(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { taskId, senderUserUuid, senderName, messageBody } = await req.json();

  if (!taskId || !senderUserUuid || !messageBody) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }

  const apiKey = process.env.POSTMARK_API_KEY;
  const fromEmail = process.env.POSTMARK_FROM_EMAIL;
  if (!apiKey || !fromEmail || apiKey === "your_postmark_api_key_here") {
    console.log("[notify] Postmark not configured");
    return NextResponse.json({ error: "Postmark not configured" }, { status: 500 });
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? new URL(req.url).origin;

  const supabase = getSupabaseAdmin();

  // Fetch the task to build the deep-link URL
  const { data: task, error: taskErr } = await supabase
    .from("RoadmapTasks")
    .select("id, title, sprint_id, is_backlog")
    .eq("id", taskId)
    .single();
  if (taskErr) console.log("[notify] task fetch error:", taskErr.message);
  else console.log("[notify] task:", task?.id, task?.title);

  // Build the link to the task modal
  let taskLink = `${appUrl}/roadmap/backlog?ticket=${taskId}`;
  if (task?.sprint_id) {
    const { data: sprint } = await supabase
      .from("RoadmapSprints")
      .select("id, quarter_id")
      .eq("id", task.sprint_id)
      .single();

    if (sprint?.quarter_id) {
      taskLink = `${appUrl}/roadmap/${sprint.quarter_id}/sprint/${sprint.id}?task=${taskId}`;
    }
  }

  // Fetch all subscribers for this task, excluding the sender
  const { data: subscriptions, error: subErr } = await supabase
    .from("RoadmapTaskSubscriptions")
    .select("user_uuid")
    .eq("task_id", taskId)
    .neq("user_uuid", senderUserUuid);
  if (subErr) console.log("[notify] subscriptions error:", subErr.message);
  console.log(
    "[notify] other subscribers:",
    subscriptions?.length ?? 0,
    subscriptions?.map((s) => s.user_uuid),
  );

  if (!subscriptions || subscriptions.length === 0) {
    return NextResponse.json({ sent: 0, reason: "no_other_subscribers" });
  }

  const recipientUuids = subscriptions.map((s) => s.user_uuid).filter(Boolean) as string[];

  // Fetch recipient emails from Users table
  const { data: users, error: usersErr } = await supabase
    .from("Users")
    .select("id, first_name, last_name, email")
    .in("id", recipientUuids);
  if (usersErr) console.log("[notify] users error:", usersErr.message);
  console.log(
    "[notify] users found:",
    users?.length ?? 0,
    users?.map((u) => ({ id: u.id, email: u.email })),
  );

  if (!users || users.length === 0) {
    return NextResponse.json({ sent: 0, reason: "no_users_found" });
  }

  const recipients = users.filter((u) => !!u.email);
  console.log("[notify] recipients with email:", recipients.length);
  if (recipients.length === 0) {
    return NextResponse.json({ sent: 0, reason: "no_emails_on_users" });
  }

  const taskTitle = task?.title ?? "a task";
  const client = new postmark.ServerClient(apiKey);

  const emailBody = `
<html>
  <body style="font-family: sans-serif; color: #1f2937; max-width: 600px; margin: 0 auto; padding: 24px;">
    <p style="font-size: 16px; margin-bottom: 8px;">
      <strong>${escapeHtml(senderName)}</strong> sent a message on
      <strong>${escapeHtml(taskTitle)}</strong>:
    </p>
    <blockquote style="border-left: 3px solid #d1d5db; margin: 16px 0; padding: 12px 16px; background: #f9fafb; color: #374151; border-radius: 4px;">
      ${escapeHtml(messageBody)}
    </blockquote>
    <a href="${taskLink}" style="display: inline-block; margin-top: 16px; padding: 10px 20px; background-color: #4a90d9; color: #ffffff; text-decoration: none; border-radius: 6px; font-size: 14px;">
      Reply on Roadmap
    </a>
    <p style="margin-top: 24px; font-size: 12px; color: #9ca3af;">
      You received this because you're subscribed to updates for this task.
    </p>
  </body>
</html>
  `.trim();

  const messages: postmark.Models.Message[] = recipients.map((user) => ({
    From: fromEmail,
    To: user.email!,
    Subject: `New message on: ${taskTitle}`,
    HtmlBody: emailBody,
    TextBody: `${senderName} said: ${messageBody}\n\nReply here: ${taskLink}`,
    MessageStream: "outbound",
  }));

  console.log("[notify] sending", messages.length, "emails via Postmark");
  await client.sendEmailBatch(messages);
  console.log("[notify] sent OK");

  return NextResponse.json({ sent: messages.length });
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
