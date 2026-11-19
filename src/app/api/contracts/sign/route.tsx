import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";
import { renderToBuffer } from "@react-pdf/renderer";
import { buildQuoteDocumentData } from "@/features/quotesAndBookings/pdf/quoteDocumentData";
import { QuotePdfDocument } from "@/features/quotesAndBookings/pdf/QuotePdfDocument";
import { logSingleChange } from "@/features/quotesAndBookings/db/logEventChanges";
import { sendTriggerEmail } from "@/features/automaticEmails/server/sendTriggerEmail";
import { QUOTE_SIGNED_CLIENT, QUOTE_SIGNED_AM } from "@/features/automaticEmails/triggers";

// Signing renders and uploads the signed PDF (~8 s), then sends the client and account-manager
// emails. On the 10 s default Vercel killed the request before the last email went out, so account
// managers silently stopped hearing about signatures. This raises the real limit for this route
// only, as create-bill does.
export const maxDuration = 60;

function getSupabaseAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { eventId, termsAndConditionsUuid, signerName, expectedContractHash } = body;

  if (!eventId || !termsAndConditionsUuid || !signerName?.trim()) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }
  if (typeof expectedContractHash !== "string") {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();
  const signedAt = new Date().toISOString();

  // Sign-time guard: never record a signature against changed contract terms. Compare the
  // hash the client reviewed to the live one; on mismatch abort before any write.
  // See docs/specs/quote-staleness-detection.md §9.
  const { data: eventRow, error: eventErr } = await supabase
    .from("Events")
    .select("contract_hash")
    .eq("id", eventId)
    .maybeSingle();

  if (eventErr || !eventRow) {
    return NextResponse.json({ error: "Event not found" }, { status: 404 });
  }

  const currentContractHash = eventRow.contract_hash ?? "";
  if (expectedContractHash !== currentContractHash) {
    return NextResponse.json({ error: "quote_changed" }, { status: 409 });
  }

  // Invalidate any existing active signature for this event
  await supabase
    .from("ContractSignatures")
    .update({ status: "invalidated", invalidated_at: new Date().toISOString() })
    .eq("event_uuid", eventId)
    .eq("status", "active");

  // Insert new active signature
  const { data, error } = await supabase
    .from("ContractSignatures")
    .insert({
      event_uuid: eventId,
      terms_and_conditions_uuid: termsAndConditionsUuid,
      signer_name: signerName.trim(),
      signed_at: signedAt,
      status: "active",
      signed_contract_hash: currentContractHash,
    })
    .select("id, signed_at")
    .single();

  if (error) {
    console.error("Failed to create contract signature:", error);
    return NextResponse.json({ error: "Failed to sign contract" }, { status: 500 });
  }

  // Update event status to "booked"
  const { data: oldEvent } = await supabase
    .from("Events")
    .select("event_status")
    .eq("id", eventId)
    .single();

  await supabase
    .from("Events")
    .update({ event_status: "booked", booked_at: signedAt })
    .eq("id", eventId);

  // Signing is part of what the public page shows — the signature and the new
  // event status both feed content_hash, which a trigger has just recomputed.
  // Read it here, immediately after the last write that can move it and before
  // the slow PDF/email work: the page adopts this as its staleness baseline, so
  // every millisecond between the write and this read is a window in which
  // someone else's edit would be adopted as the client's own.
  // See docs/specs/payment-does-not-invalidate-signature.md §8.
  const { data: freshened } = await supabase
    .from("Events")
    .select("content_hash")
    .eq("id", eventId)
    .single();

  await logSingleChange(supabase, eventId, null, "signature", null, signerName.trim(), "sign");
  await logSingleChange(
    supabase,
    eventId,
    null,
    "event_status",
    oldEvent?.event_status ?? null,
    "booked",
    "status_change",
  );

  // Generate and store the signed PDF. Keep the rendered doc + buffer around so
  // the automated email can reuse them without re-rendering.
  let docData: Awaited<ReturnType<typeof buildQuoteDocumentData>> | null = null;
  let signedPdfBuffer: Buffer | null = null;
  try {
    const origin = req.nextUrl.origin;
    docData = await buildQuoteDocumentData(eventId, origin);

    if (docData) {
      const buffer = await renderToBuffer(<QuotePdfDocument data={docData} />);
      signedPdfBuffer = Buffer.from(buffer);

      const storagePath = `${eventId}/${data.id}.pdf`;
      const { error: uploadError } = await supabase.storage
        .from("contracts")
        .upload(storagePath, buffer, {
          contentType: "application/pdf",
          upsert: true,
        });

      if (uploadError) {
        console.error("Failed to upload signed PDF:", uploadError);
      } else {
        await supabase
          .from("ContractSignatures")
          .update({ signed_pdf_path: storagePath })
          .eq("id", data.id);

        const pdfFileName = `Signed Contract - ${docData.quoteNumber}.pdf`;
        await supabase.from("EventFiles").insert({
          event_uuid: eventId,
          file_name: pdfFileName,
          storage_path: `contracts/${storagePath}`,
          mime_type: "application/pdf",
          file_size_bytes: buffer.byteLength,
          source: "signed_contract",
          uploaded_by: null,
        });
      }
    }
  } catch (e) {
    console.error("PDF generation failed (signature still saved):", e);
  }

  // Fire the automated "quote signed" emails to the client and the account
  // manager (best-effort — never block or fail signing on an email problem).
  if (docData) {
    for (const trigger of [QUOTE_SIGNED_CLIENT, QUOTE_SIGNED_AM]) {
      try {
        await sendTriggerEmail({ supabaseAdmin: supabase, trigger, eventId, docData });
      } catch (e) {
        console.error(`[automatic-emails] ${trigger} send failed:`, e);
      }
    }
  }

  return NextResponse.json({
    signatureId: data.id,
    signedAt: data.signed_at,
    contentHash: freshened?.content_hash ?? null,
  });
}
