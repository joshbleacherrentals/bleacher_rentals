import { DateTime } from "luxon";
import { buildCsv, csvTextField, escapeCsvField } from "@/lib/csv";
import type { AccountsReceivableEvent, QuotesBookingsEvent } from "../types";
import type { Currency } from "../types/quoteTypes";
import { accountManagerName } from "../components/eventListCells";
import { eventSubtotalCents, eventTaxCents } from "./eventAmounts";
import { formatMoney } from "./formatMoney";
import { INVOICE_REASON_TEXT } from "./invoiceAttention";
import { formatInvoiceNumber } from "./invoiceNumber";
import type { NeedAttentionEvent } from "./needAttentionRows";

/**
 * The event lists as CSV files: the Quotes & Bookings list, and the AR Deposits and Need attention
 * tabs of the Accountant page. The same columns the table shows, one row per event, in the order the
 * list is in. Each cell is the text the table prints, so the file and the screen cannot disagree
 * (CAD stays "C$…" for the same reason the table marks it).
 */

/** The table's column headers, without the event count and the per-currency totals the screen adds. */
export const CSV_HEADERS = [
  "Event Name",
  "Status",
  "Account Manager",
  "Start Date",
  "Booked",
  "Created At",
  "Subtotal",
  "Tax",
] as const;

export const RECEIVABLES_CSV_HEADERS = [
  "Event Name",
  "Account Manager",
  "Start Date",
  "Invoice #",
  "Amount Due",
  "Remaining Balance",
] as const;

export const NEED_ATTENTION_CSV_HEADERS = [
  "Event Name",
  "Account Manager",
  "Start Date",
  "Invoice #",
  "Reason",
] as const;

/** What the status column says for an event; a deleted one reads Deleted whatever its status was. */
export function eventStatusLabel(event: Pick<QuotesBookingsEvent, "deleted" | "event_status">) {
  if (event.deleted === 1) return "Deleted";
  const status = event.event_status;
  if (!status) return "Unknown";
  return status.charAt(0).toUpperCase() + status.slice(1).toLowerCase();
}

/** Same format as the table's dates, but an empty cell where the table prints N/A or a dash. */
function dateField(value: string | null): string {
  if (!value) return "";
  const date = DateTime.fromISO(value);
  return date.isValid ? escapeCsvField(date.toFormat("MMM d, yyyy")) : "";
}

/** `#000000042` as the tabs print it; empty where they print a dash. */
function invoiceField(invoiceNumber: number | null): string {
  const formatted = formatInvoiceNumber(invoiceNumber);
  return formatted ? `#${formatted}` : "";
}

export function buildEventsCsv(
  events: readonly QuotesBookingsEvent[],
  currencyOf: (event: QuotesBookingsEvent) => Currency,
): string {
  return buildCsv(
    CSV_HEADERS,
    events.map((event) => {
      const currency = currencyOf(event);
      return [
        csvTextField(event.event_name ?? ""),
        escapeCsvField(eventStatusLabel(event)),
        csvTextField(accountManagerName(event)),
        dateField(event.event_start),
        dateField(event.booked_at),
        dateField(event.created_at),
        escapeCsvField(formatMoney(eventSubtotalCents(event), currency)),
        escapeCsvField(formatMoney(eventTaxCents(event), currency)),
      ];
    }),
  );
}

/** The AR Deposits tab. */
export function buildReceivablesCsv(
  events: readonly AccountsReceivableEvent[],
  currencyOf: (event: QuotesBookingsEvent) => Currency,
): string {
  return buildCsv(
    RECEIVABLES_CSV_HEADERS,
    events.map((event) => {
      const currency = currencyOf(event);
      return [
        csvTextField(event.event_name ?? ""),
        csvTextField(accountManagerName(event)),
        dateField(event.event_start),
        escapeCsvField(invoiceField(event.invoice_number)),
        escapeCsvField(formatMoney(event.amount_due_cents, currency)),
        escapeCsvField(formatMoney(event.remaining_balance_cents, currency)),
      ];
    }),
  );
}

/** The Need attention tab: every reason of an event in the one cell, as the tab prints them. */
export function buildNeedAttentionCsv(events: readonly NeedAttentionEvent[]): string {
  return buildCsv(
    NEED_ATTENTION_CSV_HEADERS,
    events.map((event) => [
      csvTextField(event.event_name ?? ""),
      csvTextField(accountManagerName(event)),
      dateField(event.event_start),
      escapeCsvField(invoiceField(event.invoice_number)),
      escapeCsvField(event.reasons.map((reason) => INVOICE_REASON_TEXT[reason].short).join(", ")),
    ]),
  );
}
