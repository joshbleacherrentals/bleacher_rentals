import { resolvePaymentSchedule } from "../utils/resolvePaymentSchedule";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../../../../database.types";
import type { Currency } from "../types/quoteTypes";
import { resolveOfficeCurrency } from "../utils/resolveOfficeCurrency";
import { allocatePayments, type AllocatablePayment } from "../utils/allocatePayments";
import { computeAmountDue } from "../utils/computeAmountDue";

/**
 * What a quote is worth and what it still owes — resolved on the server, from
 * the database, with nothing taken from the caller.
 *
 * `/quote/[id]` is unauthenticated, so `POST /api/payments/create-checkout` is
 * reachable by anyone who knows an event id. Every figure a Checkout session is
 * built from therefore has to be derived here rather than trusted from the
 * request body: the currency the charge is made in, and the ceiling the amount
 * is allowed to reach.
 *
 * The money is read through the same `allocatePayments` / `computeAmountDue`
 * pair every screen uses, so the server can never disagree with the balance the
 * client was just shown. See docs/specs/payment-accounting-truth.md §3.6.
 */
export type EventPaymentContext = {
  /** The quote's currency: the office's, never the request's. */
  currency: Currency;
  totalCents: number;
  paidCents: number;
  /** The most this event may still be charged for. */
  remainingCents: number;
};

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * The quote's currency is the currency of the office that sells it — the same
 * rule `useSalesOffices` applies in the UI, run against the same two inputs
 * (the office's QuickBooks connection, and its province as a fallback).
 *
 * An event without an office cannot be quoted, so that path is defensive only.
 *
 * Exported because the quote document (public page, PDF, email) has to display
 * the same currency the payment is charged in.
 */
export async function resolveEventCurrency(
  supabase: SupabaseClient<Database>,
  salesOfficeUuid: string | null,
): Promise<Currency> {
  if (!salesOfficeUuid) return resolveOfficeCurrency(null, null);

  const { data: office } = await supabase
    .from("SalesOffices")
    .select("quickbook_uuid, address_uuid")
    .eq("id", salesOfficeUuid)
    .single();

  if (!office) return resolveOfficeCurrency(null, null);

  // QboConnections is server-only (it holds tokens), which is exactly why this
  // resolution cannot live in the client hook alone.
  const [qbo, address] = await Promise.all([
    office.quickbook_uuid
      ? supabase
          .from("QboConnections")
          .select("currency")
          .eq("id", office.quickbook_uuid)
          .maybeSingle()
      : Promise.resolve({ data: null }),
    office.address_uuid
      ? supabase
          .from("Addresses")
          .select("state_province")
          .eq("id", office.address_uuid)
          .maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  return resolveOfficeCurrency(qbo.data?.currency ?? null, address.data?.state_province ?? null);
}

export async function loadEventPaymentContext(
  supabase: SupabaseClient<Database>,
  eventId: string,
  today: string = todayIso(),
): Promise<EventPaymentContext | null> {
  const { data: event } = await supabase
    .from("Events")
    .select("sales_office_uuid, tax_percent, tax_amount_cents")
    .eq("id", eventId)
    .single();

  if (!event) return null;

  const [currency, lineItemResult, installmentResult, paymentResult] = await Promise.all([
    resolveEventCurrency(supabase, event.sales_office_uuid),
    supabase
      .from("EventLineItems")
      .select("quantity, value_cents")
      .eq("event_uuid", eventId)
      .eq("deleted", false),
    supabase
      .from("PaymentInstallments")
      .select("id, due_date, percentage_bps")
      .eq("event_uuid", eventId),
    supabase
      .from("PaymentHistory")
      .select("id, installment_id, amount_cents, currency, status, paid_at, created_at")
      .eq("event_uuid", eventId),
  ]);

  if (lineItemResult.error || installmentResult.error || paymentResult.error)
    throw new Error("Could not load payment data.");

  // Totals are computed exactly as buildQuoteDocumentData computes them, so the
  // ceiling here is the same number the client is looking at.
  const lineTotals = (lineItemResult.data ?? []).map(
    (li) => (li.quantity ?? 1) * (li.value_cents ?? 0),
  );
  const subtotalCents = lineTotals.filter((t) => t >= 0).reduce((sum, t) => sum + t, 0);
  const discountsCents = lineTotals.filter((t) => t < 0).reduce((sum, t) => sum + t, 0);
  const taxableAmount = subtotalCents + discountsCents;
  const taxPercent = event.tax_percent ?? 0;
  const taxAmountCents = event.tax_amount_cents ?? Math.round(taxableAmount * (taxPercent / 100));
  const totalCents = taxableAmount + taxAmountCents;

  const payments: AllocatablePayment[] = (paymentResult.data ?? []).map((p) => ({
    id: p.id,
    installmentId: p.installment_id,
    amountCents: p.amount_cents ?? 0,
    currency: p.currency ?? "",
    status: p.status ?? "",
    paidAt: p.paid_at,
    createdAt: p.created_at ?? "",
  }));

  const allocation = allocatePayments(
    resolvePaymentSchedule(
      (installmentResult.data ?? []).map((i) => ({
        id: i.id,
        dueDate: i.due_date ?? "",
        percentageBps: i.percentage_bps ?? 0,
      })),
      Math.round(totalCents),
    ),
    payments,
    currency,
  );

  const { paidCents, remainingCents } = computeAmountDue({ allocation, totalCents, today });

  return { currency, totalCents, paidCents, remainingCents };
}
