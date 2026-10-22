/**
 * A document reads "Invoice" once the event is booked, and "Quote" for any other status
 * (draft, quoted, lost, unsigned changes). The event's status decides it, not the signature.
 */
export function isInvoiceStatus(status: string | null | undefined): boolean {
  return status?.toLowerCase() === "booked";
}
