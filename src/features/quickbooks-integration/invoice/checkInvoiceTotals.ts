import { createClient } from "@supabase/supabase-js";
import type { Database } from "../../../../database.types";
import type { InvoiceSource } from "./invoiceTypes";
import { readQboInvoice } from "./qboInvoiceApi";

/**
 * The totals check: after the invoice is written (and on demand) the app reads it back and compares
 * QuickBooks' total and tax with the quote's, to the cent. A difference is stored on the quote as
 * `qbo_invoice_mismatch`. Server-only: it writes Events with the service role.
 * Spec: docs/specs/qbo-invoice-06-totals-check.md §3
 */

export type TotalsDifference = { field: "total" | "tax"; quoteCents: number; qboCents: number };

export type TotalsComparison = { matches: boolean; differences: TotalsDifference[] };

type Totals = { totalCents: number; taxCents: number };

export type TotalsCheckResult =
  | ({ status: "checked" } & TotalsComparison)
  /** QuickBooks no longer has the invoice; nothing was stored. */
  | { status: "missing" };

/** QuickBooks could not be reached or its answer could not be read: the database is not to blame. */
export class QboReadError extends Error {}

function getSupabaseAdmin() {
  return createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

const messageOf = (e: unknown) => (e instanceof Error ? e.message : String(e));

/** QuickBooks' decimal, a number or a string, as whole cents. */
export function dollarsToCents(value: number | string): number {
  const dollars = typeof value === "string" && value.trim() === "" ? Number.NaN : Number(value);
  if (!Number.isFinite(dollars)) {
    throw new Error(`QuickBooks sent an amount that is not a number: ${JSON.stringify(value)}`);
  }
  // Rounding takes the float noise out of the cents (19.99 * 100 is 1998.9999999999998).
  return Math.round(dollars * 100);
}

/** Zero tolerance: any difference, one cent included, is listed. */
export function compareInvoiceTotals(params: { quote: Totals; qbo: Totals }): TotalsComparison {
  const { quote, qbo } = params;
  const differences: TotalsDifference[] = [];
  if (quote.totalCents !== qbo.totalCents) {
    differences.push({ field: "total", quoteCents: quote.totalCents, qboCents: qbo.totalCents });
  }
  if (quote.taxCents !== qbo.taxCents) {
    differences.push({ field: "tax", quoteCents: quote.taxCents, qboCents: qbo.taxCents });
  }
  return { matches: differences.length === 0, differences };
}

/** The invoice's totals as QuickBooks calculated them; an invoice with no tax has a tax of 0. */
function qboTotalsOf(totals: {
  totalAmt: number | string | null;
  totalTax: number | string | null;
}) {
  if (totals.totalAmt === null) throw new Error("QuickBooks sent an invoice with no total.");
  return {
    totalCents: dollarsToCents(totals.totalAmt),
    taxCents: dollarsToCents(totals.totalTax ?? 0),
  };
}

/**
 * Reads the quote's invoice (`source.qboInvoiceId`, in `source.qboInvoiceConnectionId`: the connection
 * it was written in, not the office's current one), compares its total and tax with the quote's and
 * sets `Events.qbo_invoice_mismatch` to the result. An invoice QuickBooks no longer has is `missing`
 * and the flag stays as it is. A QuickBooks failure throws a QboReadError; the flag is left alone.
 */
export async function runTotalsCheck(
  eventId: string,
  source: InvoiceSource,
): Promise<TotalsCheckResult> {
  const { qboInvoiceId, qboInvoiceConnectionId } = source;
  if (!qboInvoiceId || !qboInvoiceConnectionId) {
    throw new Error("This quote has no QuickBooks invoice to check.");
  }

  let qbo: Totals;
  try {
    const invoice = await readQboInvoice(qboInvoiceConnectionId, qboInvoiceId);
    if (!invoice) return { status: "missing" };
    qbo = qboTotalsOf(invoice.totals);
  } catch (e) {
    throw new QboReadError(messageOf(e));
  }

  // The quote's total is the amount after discounts plus the tax (spec 03).
  const comparison = compareInvoiceTotals({
    quote: { totalCents: source.amountCents + source.taxCents, taxCents: source.taxCents },
    qbo,
  });

  const { error } = await getSupabaseAdmin()
    .from("Events")
    .update({ qbo_invoice_mismatch: !comparison.matches })
    .eq("id", eventId);
  if (error) throw new Error(`Failed to save the totals check: ${error.message}`);

  return { status: "checked", ...comparison };
}
