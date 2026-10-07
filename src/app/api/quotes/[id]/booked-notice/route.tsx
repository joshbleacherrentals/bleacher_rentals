import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { createClient } from "@supabase/supabase-js";
import {
  sendTriggerEmail,
  FINANCE_EMAIL,
} from "@/features/automaticEmails/server/sendTriggerEmail";
import { QUOTE_SIGNED_AM } from "@/features/automaticEmails/triggers";

function getSupabaseAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

const SYNC_ATTEMPTS = 10;
const SYNC_DELAY_MS = 1000;

/**
 * Tells finance a quote was marked Booked by hand in the admin app.
 *
 * Uses the "Quote signed — notify account manager" template, addressed to finance instead. The
 * admin app writes the status locally first (PowerSync), so wait until Supabase has it — that
 * also means the email is built from what was actually saved, and a caller cannot use this
 * route to email finance about a quote that is not booked.
 */
export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const supabase = getSupabaseAdmin();

  let booked = false;
  for (let i = 0; i < SYNC_ATTEMPTS && !booked; i++) {
    const { data } = await supabase
      .from("Events")
      .select("event_status")
      .eq("id", id)
      .maybeSingle();
    booked = data?.event_status === "booked";
    if (!booked) await new Promise((r) => setTimeout(r, SYNC_DELAY_MS));
  }
  if (!booked) {
    return NextResponse.json({ error: "Quote is not booked" }, { status: 409 });
  }

  try {
    const result = await sendTriggerEmail({
      supabaseAdmin: supabase,
      trigger: QUOTE_SIGNED_AM,
      eventId: id,
      origin: _req.nextUrl.origin,
      recipientOverride: FINANCE_EMAIL,
    });
    return NextResponse.json(result, { status: result.sent ? 200 : 422 });
  } catch (e) {
    console.error("Booked notice to finance failed:", e);
    return NextResponse.json({ error: "Send failed" }, { status: 500 });
  }
}
