import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { Database } from "../../../../../database.types";
import { getEventStripeConfiguration } from "@/features/stripe-integration/getEventStripeConfiguration";
import { stripeForAccount } from "@/features/stripe-integration/util";
import { loadEventPaymentContext } from "@/features/quotesAndBookings/server/eventPaymentContext";
import { formatInvoiceNumber } from "@/features/quotesAndBookings/utils/invoiceNumber";

function getStripe() {
  return new Stripe(process.env.STRIPE_SECRET_KEY!);
}

function getSupabaseAdmin() {
  return createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

/** Plain-English money for an error a client reads on the public quote page. */
function formatMoney(cents: number, currency: string): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(cents / 100);
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  // `currency` is deliberately NOT read from the body. This endpoint sits behind
  // the public /quote/[id] page, so everything that decides what is charged —
  // the currency and the ceiling on the amount — is resolved server-side from
  // the quote itself. See docs/specs/payment-accounting-truth.md §3.6.
  const { eventId, installmentId, amountCents, payerName, language } = body;

  if (!eventId || !amountCents || !payerName) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();

  const { data: event } = await supabase
    .from("Events")
    .select("id, event_name, invoice_number")
    .eq("id", eventId)
    .single();

  if (!event) {
    return NextResponse.json({ error: "Event not found" }, { status: 404 });
  }

  // Resolve which connected Stripe account this event's payments route to
  // (event -> sales office -> Stripe connection). Payments are charged on the
  // office's own account, not the platform account.
  const stripeConfig = await getEventStripeConfiguration(supabase, eventId);
  if (!stripeConfig.ok) {
    return NextResponse.json({ error: stripeConfig.error }, { status: stripeConfig.status });
  }

  const origin = req.nextUrl.origin;
  const invoiceNumberText = formatInvoiceNumber(event.invoice_number);
  const invoiceLabel = invoiceNumberText ? `#${invoiceNumberText}` : event.id.slice(0, 8);

  if (typeof amountCents !== "number" || !Number.isInteger(amountCents) || amountCents < 50) {
    return NextResponse.json({ error: "Payment amount must be at least $0.50." }, { status: 400 });
  }

  // The quote's own currency and outstanding balance, read through the same
  // allocation the Pay tab renders — so the server cannot be talked into a
  // currency or an amount the client was never offered.
  const payment = await loadEventPaymentContext(supabase, eventId);
  if (!payment) {
    return NextResponse.json({ error: "Event not found" }, { status: 404 });
  }
  if (payment.remainingCents <= 0) {
    return NextResponse.json({ error: "This invoice is already paid in full." }, { status: 400 });
  }
  if (amountCents > payment.remainingCents) {
    return NextResponse.json(
      {
        error: `Payment amount exceeds the balance due of ${formatMoney(
          payment.remainingCents,
          payment.currency,
        )}.`,
      },
      { status: 400 },
    );
  }

  const stripe = getStripe();

  const session = await stripe.checkout.sessions.create(
    {
      payment_method_types: ["card"],
      mode: "payment",
      // Stripe's own checkout chrome follows the quote's language (fr-CA for a
      // French contact). Anything else falls back to Stripe's browser detection.
      locale: language === "fr" ? "fr-CA" : "auto",
      // Email is intentionally NOT prefilled: passing customer_email locks the
      // field on the Checkout page. We let the customer enter/edit it, then the
      // webhook sends the receipt to the address they actually submit.
      line_items: [
        {
          price_data: {
            currency: payment.currency.toLowerCase(),
            unit_amount: amountCents,
            product_data: {
              name: `Invoice ${invoiceLabel} — ${event.event_name ?? "Bleacher Rental"}`,
            },
          },
          quantity: 1,
        },
      ],
      metadata: {
        eventId,
        installmentId: installmentId ?? "",
        payerName,
        stripeConnectionId: stripeConfig.config.connectionId,
      },
      // Success gets its own standalone confirmation page (not the quote/pay
      // tab) so the "you're done" moment is unambiguous.
      success_url: `${origin}/quote/${eventId}/payment-success`,
      cancel_url: `${origin}/quote/${eventId}?payment=cancelled`,
    },
    // Create the session ON the office's connected account (direct charge), so
    // the funds land in that account rather than the platform account.
    stripeForAccount(stripeConfig.config.stripeAccountId),
  );

  return NextResponse.json({ url: session.url });
}
