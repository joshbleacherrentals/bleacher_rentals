import { DateTime } from "luxon";
import { QuotesBookingsEvent } from "../types";
import { eventSubtotalCents, eventTaxCents } from "./eventAmounts";

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

export function searchEvents(events: QuotesBookingsEvent[], query: string): QuotesBookingsEvent[] {
  if (!query.trim()) return events;
  const q = query.toLowerCase();
  // Quotes print the number as "Invoice #: 242136735", so a pasted "#242136735" should match too.
  const invoiceQuery = q.trim().replace(/^#\s*/, "");

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
    return fields.some((f) => f && String(f).toLowerCase().includes(q));
  });
}
