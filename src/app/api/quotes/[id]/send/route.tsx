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
import {
  ACCEPTED_TYPES,
  EVENT_FILES_BUCKET,
  MAX_SIZE_MB,
  isOwnEventFilePath,
} from "@/features/quotesAndBookings/utils/eventFileUpload";
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

  // Files the browser added for this send are already in the event-files bucket (a file cannot
  // travel in this request, the host limits its size) but have NO EventFiles row yet: the rows are
  // inserted below, only after the email went out (spec D4, D14). Each file must live directly in
  // this event's folder and be readable. Anything else stops the send before any email.
  const addedAttachments: EmailAttachment[] = [];
  const addedBytes = new Map<string, number>();
  const refusal = (error: string) => NextResponse.json({ error }, { status: 400 });
  for (const file of input.addedFiles) {
    if (!isOwnEventFilePath(id, file.storagePath)) {
      return refusal("An attached file is not stored for this quote. Remove it and add it again.");
    }
    if (!ACCEPTED_TYPES.includes(file.mimeType)) {
      return refusal(`${file.name}: this file type cannot be attached.`);
    }
  }

  // A file that already has an EventFiles row (e.g. uploaded from the Files tab) must not get a
  // second row here: deleting either row would break the other. Refuse before anything is sent.
  if (input.addedFiles.length > 0) {
    const paths = input.addedFiles.map((f) => f.storagePath);
    const ids = input.addedFiles.map((f) => f.id);
    const [byPath, byId] = await Promise.all([
      supabaseAdmin.from("EventFiles").select("id").in("storage_path", paths),
      supabaseAdmin.from("EventFiles").select("id").in("id", ids),
    ]);
    if (byPath.error || byId.error) {
      console.error("Could not check the added files against Files:", byPath.error ?? byId.error);
      return NextResponse.json(
        { error: "The attached files could not be checked. Try again." },
        { status: 500 },
      );
    }
    if ((byPath.data?.length ?? 0) > 0 || (byId.data?.length ?? 0) > 0) {
      return refusal(
        "An attached file is already saved in Files. Remove it and add it again from your computer.",
      );
    }
  }

  for (const file of input.addedFiles) {
    const { data: blob } = await supabaseAdmin.storage
      .from(EVENT_FILES_BUCKET)
      .download(file.storagePath);
    if (!blob) {
      return refusal("An attached file could not be read. Remove it and add it again.");
    }
    const content = Buffer.from(await blob.arrayBuffer());
    if (content.byteLength > MAX_SIZE_MB * 1024 * 1024) {
      return refusal(`${file.name}: the file is larger than ${MAX_SIZE_MB} MB.`);
    }
    addedBytes.set(file.id, content.byteLength);
    addedAttachments.push({ name: file.name, content, contentType: file.mimeType });
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

  // Record the added files in Files now that the email is out. A failure here cannot undo the
  // send: log it (path included, so the object can be found) and carry on.
  for (const file of input.addedFiles) {
    try {
      // The browser may have timed out and deleted the object while this request was still
      // running; do not record a row that points at nothing.
      const slash = file.storagePath.lastIndexOf("/");
      const { data: found, error: listError } = await supabaseAdmin.storage
        .from(EVENT_FILES_BUCKET)
        .list(file.storagePath.slice(0, slash), {
          limit: 1,
          search: file.storagePath.slice(slash + 1),
        });
      if (!listError && !found?.some((o) => o.name === file.storagePath.slice(slash + 1))) {
        console.error(
          "Quote sent, but an added file is gone from storage, not recorded:",
          file.storagePath,
        );
        continue;
      }
      const { error } = await supabaseAdmin.from("EventFiles").insert({
        id: file.id,
        event_uuid: id,
        file_name: file.name,
        storage_path: file.storagePath,
        mime_type: file.mimeType,
        file_size_bytes: addedBytes.get(file.id) ?? file.sizeBytes,
        source: "email_attachment",
        uploaded_by: senderUserUuid,
      });
      if (error) {
        console.error("Quote sent, but recording an added file failed:", file.storagePath, error);
      }
    } catch (e) {
      console.error("Quote sent, but recording an added file failed:", file.storagePath, e);
    }
  }

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
