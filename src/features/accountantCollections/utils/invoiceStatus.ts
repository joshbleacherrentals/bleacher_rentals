/**
 * The status in the header of the invoice page. Calculated, never stored.
 * docs/specs/accountant-collections-08-invoice-data.md §1 and §3. Spec 09 gives each one its label
 * and colour.
 *
 * The order of the rules: Lost, then anything that is not booked (a missing status included), then
 * the money of a booked event.
 */

export type InvoiceStatus = "paid" | "schedule" | "collections" | "cancelled" | "not_active";

export function invoiceStatus(input: {
  eventStatus: string | null;
  remainingCents: number;
  amountDueCents: number;
}): InvoiceStatus {
  if (input.eventStatus === "lost") return "cancelled";
  if (input.eventStatus !== "booked") return "not_active";
  // A booked event whose total is 0 has nothing remaining either, so it is Paid.
  if (input.remainingCents <= 0) return "paid";
  return input.amountDueCents > 0 ? "collections" : "schedule";
}
