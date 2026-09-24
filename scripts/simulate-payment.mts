#!/usr/bin/env tsx
/**
 * Simulate a completed Stripe payment against the local app.
 *
 * Builds a `checkout.session.completed` event, signs it with the local
 * STRIPE_WEBHOOK_SECRET exactly as Stripe would, and posts it to
 * /api/stripe/webhook. No Stripe account, no connected account, no tunnel — the
 * route cannot tell it apart from the real thing.
 *
 * This is the fast way to exercise the money logic (allocation, reconciliation,
 * the Billing tab, the PDF) with amounts that are awkward to produce by hand:
 * a $1 payment against a $2,700 installment, a payment with no schedule at all,
 * two part-payments that add up, an overpayment, a wrong-currency payment.
 *
 * Usage:
 *   npm run simulate:payment -- --event=<eventUuid> --amount=1.00
 *   npm run simulate:payment -- --event=<uuid> --amount=27.00 --installment=auto
 *   npm run simulate:payment -- --event=<uuid> --amount=100 --currency=CAD
 *   npm run simulate:payment -- --event=<uuid> --show          (report only)
 *
 * Flags:
 *   --event=<uuid>        required — the Events row to pay against
 *   --amount=<dollars>    required unless --show
 *   --installment=auto    target the earliest installment that isn't covered
 *   --installment=<uuid>  target a specific installment
 *   --installment=none    send no target (the default; what a no-schedule quote does)
 *   --currency=USD|CAD    default USD
 *   --payer="Jane Doe"    default "Dev Tester"
 *   --email=<address>     default dev@example.com
 *   --url=<origin>        default http://localhost:3000
 *   --show                print the event's schedule and payments, change nothing
 *
 * Note: the webhook also fires the "payment made" automatic emails. They are
 * skipped unless an office/trigger binding is active locally, but if you have
 * real Postmark credentials in .env.local, check that before running this
 * against an event with a live contact address.
 */

import { createClient } from "@supabase/supabase-js";
import Stripe from "stripe";
import { readFileSync } from "fs";
import { join } from "path";
import { randomUUID } from "crypto";
import type { Database } from "../database.types.js";

// ── Env ───────────────────────────────────────────────────────────────
try {
  const envFile = readFileSync(join(process.cwd(), ".env.local"), "utf-8");
  for (const line of envFile.split("\n")) {
    const match = line.match(/^([^#=]+)=(.*)$/);
    if (match && !process.env[match[1].trim()]) {
      process.env[match[1].trim()] = match[2].trim();
    }
  }
} catch {
  console.warn("⚠️  Could not load .env.local");
}

// ── Args ──────────────────────────────────────────────────────────────
const args = new Map<string, string>();
for (const arg of process.argv.slice(2)) {
  const [key, value = "true"] = arg.replace(/^--/, "").split("=");
  args.set(key, value);
}

const eventId = args.get("event");
const showOnly = args.get("show") === "true";
const origin = args.get("url") ?? "http://localhost:3000";
const currency = (args.get("currency") ?? "USD").toUpperCase();
const payerName = args.get("payer") ?? "Dev Tester";
const payerEmail = args.get("email") ?? "dev@example.com";
const installmentArg = args.get("installment") ?? "none";

function fail(message: string): never {
  console.error(`\n✖ ${message}\n`);
  process.exit(1);
}

if (!eventId) fail("--event=<uuid> is required. Run with --show to inspect an event first.");

const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
if (!webhookSecret) fail("STRIPE_WEBHOOK_SECRET is missing from .env.local");

const supabase = createClient<Database>(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

const money = (cents: number, cur = currency) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: cur }).format(cents / 100);

// ── Report ────────────────────────────────────────────────────────────
async function report(label: string) {
  const [{ data: terms }, { data: payments }, resolved] = await Promise.all([
    supabase
      .from("PaymentInstallments")
      .select("id, due_date, percentage_bps, currency")
      .eq("event_uuid", eventId!)
      .order("due_date"),
    supabase
      .from("PaymentHistory")
      .select("id, installment_id, amount_cents, currency, status, paid_at")
      .eq("event_uuid", eventId!)
      .order("created_at"),
    supabase.rpc("resolve_payment_schedule", { p_event_id: eventId! }),
  ]);
  if (resolved.error) throw resolved.error;
  const amounts = new Map((resolved.data ?? []).map((i) => [i.id, i.amount_cents]));
  const installments = (terms ?? []).map((i) => ({ ...i, amount_cents: amounts.get(i.id) ?? 0 }));

  console.log(`\n── ${label} ───────────────────────────────`);

  console.log("\nSchedule:");
  if (!installments?.length) {
    console.log("  (no installments — a payment here lands as unapplied money)");
  } else {
    for (const i of installments) {
      console.log(
        `  ${i.due_date}  ${money(i.amount_cents, i.currency).padStart(12)}  ${i.percentage_bps / 100}%  ${i.id}`,
      );
    }
  }

  console.log("\nPayments:");
  if (!payments?.length) {
    console.log("  (none)");
  } else {
    for (const p of payments) {
      const target = p.installment_id ? `→ ${p.installment_id.slice(0, 8)}` : "→ untargeted";
      console.log(
        `  ${money(p.amount_cents, p.currency).padStart(12)}  ${String(p.status).padEnd(
          10,
        )}  ${target}`,
      );
    }
    // Totalled per currency — adding CAD cents to a USD total is exactly the
    // silent FX error this whole change exists to prevent.
    const totals = new Map<string, number>();
    for (const p of payments) {
      if (p.status !== "succeeded") continue;
      const cur = p.currency ?? "USD";
      totals.set(cur, (totals.get(cur) ?? 0) + p.amount_cents);
    }
    for (const [cur, total] of totals) {
      console.log(`  ${"total".padStart(12)}  ${money(total, cur)}`);
    }
  }
  console.log("");

  return { installments: installments ?? [], payments: payments ?? [] };
}

// ── Main ──────────────────────────────────────────────────────────────
const before = await report("Before");

if (showOnly) process.exit(0);

const amountArg = args.get("amount");
if (!amountArg) fail("--amount=<dollars> is required (e.g. --amount=1.00)");
const amountCents = Math.round(parseFloat(amountArg) * 100);
if (!Number.isFinite(amountCents) || amountCents <= 0) fail(`Bad --amount: ${amountArg}`);

let installmentId = "";
if (installmentArg === "auto") {
  // Earliest installment that still owes something, by the same ordering the
  // app uses. Falls back to no target when the schedule is fully covered.
  const paidByInstallment = new Map<string, number>();
  for (const p of before.payments) {
    if (p.status !== "succeeded" || !p.installment_id) continue;
    paidByInstallment.set(
      p.installment_id,
      (paidByInstallment.get(p.installment_id) ?? 0) + p.amount_cents,
    );
  }
  const target = before.installments.find(
    (i) => (paidByInstallment.get(i.id) ?? 0) < i.amount_cents,
  );
  if (!target) {
    console.log("ℹ️  Every installment is already covered — sending an untargeted payment.");
  } else {
    installmentId = target.id;
    console.log(`ℹ️  Targeting installment ${target.id} (due ${target.due_date}).`);
  }
} else if (installmentArg !== "none") {
  installmentId = installmentArg;
}

const sessionId = `cs_test_sim_${randomUUID().replace(/-/g, "")}`;

const event = {
  id: `evt_test_sim_${randomUUID().replace(/-/g, "").slice(0, 16)}`,
  object: "event",
  type: "checkout.session.completed",
  api_version: "2024-06-20",
  created: Math.floor(Date.now() / 1000),
  livemode: false,
  data: {
    object: {
      id: sessionId,
      object: "checkout.session",
      // Deliberately null: a fake pi_ id would send the route to the real
      // Stripe API for a receipt it can never fetch. Null keeps this offline.
      payment_intent: null,
      amount_total: amountCents,
      currency: currency.toLowerCase(),
      customer_email: null,
      customer_details: { email: payerEmail },
      payment_method_types: ["card"],
      metadata: {
        eventId,
        installmentId,
        payerName,
        stripeConnectionId: "",
      },
    },
  },
};

const payload = JSON.stringify(event);
const signature = Stripe.webhooks.generateTestHeaderString({ payload, secret: webhookSecret });

console.log(
  `→ POST ${origin}/api/stripe/webhook — ${money(amountCents)} ${currency}` +
    (installmentId ? ` against ${installmentId.slice(0, 8)}` : " (untargeted)"),
);

const response = await fetch(`${origin}/api/stripe/webhook`, {
  method: "POST",
  headers: { "Content-Type": "application/json", "stripe-signature": signature },
  body: payload,
});

const body = await response.text();
console.log(`← ${response.status} ${body}`);

if (!response.ok) {
  fail("The webhook rejected the event. Is `npm run dev` running on that origin?");
}

await report("After");
