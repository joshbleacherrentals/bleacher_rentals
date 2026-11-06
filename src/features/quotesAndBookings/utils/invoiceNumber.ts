/**
 * Pure helpers for invoice-number display and quote routing.
 */

/** Every invoice number is written with at least this many digits (`000000042`). */
const INVOICE_NUMBER_DIGITS = 9;

/**
 * The invoice number as a person sees it: the stored number padded with zeros to nine digits.
 * The database keeps a plain number; this is the one place that adds the zeros, so a list, a PDF
 * and the Stripe label all read the same. QuickBooks is the exception: it gets the plain number
 * (`43`, not `000000043`), so it matches the database. A number of ten digits or more is not cut.
 * Null for a missing number (null, undefined, 0).
 * Spec: docs/specs/invoice-number-02-nine-digit-format.md
 */
export function formatInvoiceNumber(invoiceNumber: number | null | undefined): string | null {
  if (!invoiceNumber) return null;
  return String(invoiceNumber).padStart(INVOICE_NUMBER_DIGITS, "0");
}

/** Returns the display string for a quote: invoice number if available, fallback to eventId (UUID). */
export function resolveInvoiceDisplay(
  invoiceNumber: number | null | undefined,
  eventId: string,
): string {
  return formatInvoiceNumber(invoiceNumber) ?? eventId;
}

/**
 * Builds the public-facing quote URL. The slug is the event UUID only — invoice
 * numbers are enumerable, so they are never used in public URLs (they remain a
 * display label). See docs/specs/payment-history-security.md.
 */
export function buildPublicQuoteUrl(appOrigin: string, eventId: string): string {
  return `${appOrigin}/quote/${eventId}`;
}
