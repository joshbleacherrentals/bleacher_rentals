import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { createClient } from "@supabase/supabase-js";
import { resolveTriggerEmail } from "@/features/automaticEmails/server/sendTriggerEmail";
import { QUOTE_SENT_CLIENT } from "@/features/automaticEmails/triggers";

// What the send route would email, without sending. Uses the same resolver as sending.
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const recipients = (req.nextUrl.searchParams.get("recipients") ?? "")
    .split(",")
    .map((e) => e.trim())
    .filter(Boolean);
  if (recipients.length === 0) {
    return NextResponse.json({ ok: false, reason: "At least one recipient email is required" });
  }

  const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  const resolved = await resolveTriggerEmail({
    supabaseAdmin,
    trigger: QUOTE_SENT_CLIENT,
    eventId: id,
    origin: req.nextUrl.origin,
    recipientOverride: [...new Set(recipients)].join(","),
  });
  if (!resolved.ok) return NextResponse.json({ ok: false, reason: resolved.reason });

  const { email } = resolved;

  // Template files live in a private bucket, so each gets a short-lived link the person can open.
  const templateFiles = await Promise.all(
    email.storedAttachmentRows.map(async (row) => {
      const { data } = await supabaseAdmin.storage
        .from("email-attachments")
        .createSignedUrl(row.storage_path, 60 * 60);
      return data?.signedUrl ? { name: row.file_name, url: data.signedUrl } : null;
    }),
  );

  return NextResponse.json({
    ok: true,
    from: email.from,
    to: email.to,
    subject: email.subject,
    htmlBody: email.htmlBody,
    attachments: [
      { name: `${email.docData.quoteNumber}.pdf`, url: `/api/quotes/${id}/pdf` },
      ...templateFiles.filter((f): f is { name: string; url: string } => f !== null),
    ],
  });
}
