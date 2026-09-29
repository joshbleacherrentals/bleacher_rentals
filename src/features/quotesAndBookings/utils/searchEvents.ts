import { DateTime } from "luxon";
import type { AccountsReceivableEvent, QuotesBookingsEvent } from "../types";
import type { Currency } from "../types/quoteTypes";
import { eventSubtotalCents, eventTaxCents } from "./eventAmounts";
import { formatMoney } from "./formatMoney";

function formatDate(dateString: string | null): string {
  if (!dateString) return "";
  const date = DateTime.fromISO(dateString);
  if (!date.isValid) return "";
  return date.toFormat("MMM d, yyyy");
}

function formatCurrency(cents: number | null): string {
  if (cents === null) return "";
  return `$${(cents / 100).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ",")}`;
}

/**
 * A query that reads as an amount, reduced to bare digits: "24600", "24,600",
 * "$24,600.00" and "C$24 600" all become "24600…". The table prints amounts
 * with separators, but people type them without, so amounts are matched on
 * this form. `null` when the query is not a number at all.
 */
function amountQuery(query: string): string | null {
  const bare = query.toLowerCase().replace(/c?\$|,|\s/g, "");
  return /^\d[\d.]*$|^\.\d+$/.test(bare) ? bare : null;
}

/** Whether an amount, as plain dollars ("24600.00"), contains the digits of `amountQuery`. */
function amountMatches(cents: number, bare: string): boolean {
  return (cents / 100).toFixed(2).includes(bare);
}

export function searchEvents<T extends QuotesBookingsEvent>(events: T[], query: string): T[] {
  if (!query.trim()) return events;
  const q = query.toLowerCase();
  // Quotes print the number as "Invoice #: 242136735", so a pasted "#242136735" should match too.
  const invoiceQuery = q.trim().replace(/^#\s*/, "");
  const bareAmount = amountQuery(query);

  return events.filter((e) => {
    const fields = [
      // Event name
      e.event_name,
      // Account Manager
      e.account_manager_first_name,
      e.account_manager_last_name,
      e.account_manager_email,
      e.account_manager_first_name && e.account_manager_last_name
        ? `${e.account_manager_first_name} ${e.account_manager_last_name}`
        : null,
      // Dates — raw ISO
      e.event_start,
      e.event_end,
      e.created_at,
      // Dates — formatted (e.g. "Sep 18, 2025")
      formatDate(e.event_start),
      formatDate(e.event_end),
      formatDate(e.created_at),
      // Address
      e.address_street,
      e.address_city,
      e.address_state,
      // Contact
      e.contact_first_name,
      e.contact_last_name,
      e.contact_email,
      e.contact_first_name ? `${e.contact_first_name} ${e.contact_last_name ?? ""}`.trim() : null,
      // Company
      e.company_name,
      // Amounts — total, plus the subtotal and tax shown in the table
      e.contract_revenue_cents !== null ? formatCurrency(e.contract_revenue_cents) : null,
      e.contract_revenue_cents !== null ? formatCurrency(eventSubtotalCents(e)) : null,
      e.tax_amount_cents !== null ? formatCurrency(eventTaxCents(e)) : null,
    ];

    if (
      invoiceQuery &&
      e.invoice_number !== null &&
      String(e.invoice_number).includes(invoiceQuery)
    ) {
      return true;
    }
    // The same amounts as above, however the number was typed.
    if (bareAmount) {
      const amounts = [
        ...(e.contract_revenue_cents !== null
          ? [e.contract_revenue_cents, eventSubtotalCents(e)]
          : []),
        ...(e.tax_amount_cents !== null ? [eventTaxCents(e)] : []),
      ];
      if (amounts.some((cents) => amountMatches(cents, bareAmount))) return true;
    }
    return fields.some((f) => f && String(f).toLowerCase().includes(q));
  });
}

/**
 * The AR tabs' search: everything `searchEvents` matches, plus Amount Due and
 * Remaining Balance — as the table prints them ("$5,763.00", "C$987.75") or
 * typed without separators ("5763", "$5763"). All Events has no balances, so
 * it keeps `searchEvents` alone.
 */
export function searchReceivables<T extends AccountsReceivableEvent>(
  rows: T[],
  query: string,
  currencyOf: (row: T) => Currency,
): T[] {
  const q = query.trim().toLowerCase();
  if (!q) return rows;
  const matched = new Set(searchEvents(rows, query));
  const bareAmount = amountQuery(query);

  return rows.filter((row) => {
    if (matched.has(row)) return true;
    return [row.amount_due_cents, row.remaining_balance_cents].some(
      (cents) =>
        formatMoney(cents, currencyOf(row)).toLowerCase().includes(q) ||
        (bareAmount !== null && amountMatches(cents, bareAmount)),
    );
  });
}
