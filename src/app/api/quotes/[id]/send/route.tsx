import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { renderToBuffer } from "@react-pdf/renderer";
import { createClient } from "@supabase/supabase-js";
import { buildQuoteDocumentData } from "@/features/quotesAndBookings/pdf/quoteDocumentData";
import { QuotePdfDocument } from "@/features/quotesAndBookings/pdf/QuotePdfDocument";
import {
  sendTriggerEmail,
  type EmailAttachment,
} from "@/features/automaticEmails/server/sendTriggerEmail";
import { parseSendBody } from "./parseSendBody";
import { QUOTE_SENT_CLIENT } from "@/features/automaticEmails/triggers";

function getSupabaseAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  // Auth check
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const body = await req.json().catch(() => null);
  const parsed = parseSendBody(body);
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }
  const input = parsed.input;

  const origin = req.nextUrl.origin;

  // Build data
  const data = await buildQuoteDocumentData(id, origin);
  if (!data) {
    return NextResponse.json({ error: "Quote not found" }, { status: 404 });
  }

  // Generate PDF
  const pdfBuffer = await renderToBuffer(<QuotePdfDocument data={data} />);

  // Send via the automatic-email template system.
  const supabaseAdmin = getSupabaseAdmin();

  // Files the browser added for this send are already in the event-files bucket with an EventFiles
  // row (the browser uploads them first: a file cannot travel in this request, the host limits its
  // size). They must belong to this event. Anything unreadable stops the send before any email.
  const addedAttachments: EmailAttachment[] = [];
  if (input.addedFileIds.length > 0) {
    const { data: rows } = await supabaseAdmin
      .from("EventFiles")
      .select("id, file_name, storage_path, mime_type")
      .eq("event_uuid", id)
      .in("id", input.addedFileIds);
    const byId = new Map((rows ?? []).map((r) => [r.id as string, r]));
    for (const fileId of input.addedFileIds) {
      const row = byId.get(fileId);
      const { data: blob } = row
        ? await supabaseAdmin.storage.from("event-files").download(row.storage_path)
        : { data: null };
      if (!row || !blob) {
        return NextResponse.json(
          { error: "An attached file could not be read. Remove it and add it again." },
          { status: 400 },
        );
      }
      addedAttachments.push({
        name: row.file_name,
        content: Buffer.from(await blob.arrayBuffer()),
        contentType: row.mime_type ?? "application/octet-stream",
      });
    }
  }

  const result = await sendTriggerEmail({
    supabaseAdmin,
    trigger: QUOTE_SENT_CLIENT,
    eventId: id,
    docData: data,
    origin,
    recipientOverride: input.to.join(","),
    cc: input.cc,
    bcc: input.bcc,
    subject: input.subject,
    omitAttachmentKeys: input.removedAttachmentKeys,
    attachments: [
      {
        name: `${data.quoteNumber}.pdf`,
        content: Buffer.from(pdfBuffer),
        contentType: "application/pdf",
      },
      ...addedAttachments,
    ],
  });

  if (!result.sent) {
    return NextResponse.json({ error: result.reason }, { status: 500 });
  }

  // Resolve the Clerk user id to the app Users.id uuid for EventFiles.uploaded_by.
  // NOTE: the "quote sent" EventChangeLog entry is written client-side via
  // PowerSync (logQuoteSentLocal) so it records the current logged-in sender and
  // follows the PowerSync-first rule — see docs/POWERSYNC_ARCHITECTURE.md.
  const { data: senderUser } = await supabaseAdmin
    .from("Users")
    .select("id")
    .eq("clerk_user_id", userId)
    .maybeSingle();
  const senderUserUuid = senderUser?.id ?? null;

  // Save sent quote PDF to event-files bucket
  try {
    const pdfFileName = `${data.quoteNumber}.pdf`;
    const storagePath = `${id}/sent-quote-${Date.now()}.pdf`;

    const { error: uploadError } = await supabaseAdmin.storage
      .from("event-files")
      .upload(storagePath, pdfBuffer, {
        contentType: "application/pdf",
        upsert: false,
      });

    if (!uploadError) {
      await supabaseAdmin.from("EventFiles").insert({
        event_uuid: id,
        file_name: pdfFileName,
        storage_path: storagePath,
        mime_type: "application/pdf",
        file_size_bytes: pdfBuffer.byteLength,
        source: "sent_quote",
        uploaded_by: senderUserUuid,
      });
    } else {
      console.error("Failed to store sent quote PDF:", uploadError);
    }
  } catch (e) {
    console.error("Failed to store sent quote PDF (email still sent):", e);
  }

  return NextResponse.json({ success: true, sentTo: input.to.join(",") });
}
