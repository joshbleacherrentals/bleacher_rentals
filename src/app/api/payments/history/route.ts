import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";

function getSupabaseAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

export async function GET(req: NextRequest) {
  const eventId = req.nextUrl.searchParams.get("eventId");

  if (!eventId) {
    return NextResponse.json({ error: "Missing eventId" }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();

  // The client never learns that a payment was deleted: a deleted row is not returned, and the column
  // list below carries no deletion column (docs/specs/accountant-quotes-08-payments-readers-skip-deleted.md).
  const { data, error } = await supabase
    .from("PaymentHistory")
    .select(
      "id, installment_id, amount_cents, currency, status, payment_method_type, payer_name, payer_email, stripe_receipt_url, paid_at, created_at",
    )
    .eq("event_uuid", eventId)
    .is("deleted_at", null)
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data ?? []);
}
