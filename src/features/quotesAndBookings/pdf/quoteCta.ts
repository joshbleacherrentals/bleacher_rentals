/**
 * The one next step the customer's page puts in front of them:
 *   approve — the quote is not signed yet, so the next step is the Approve & Sign tab
 *   pay     — signed, and something is still owed, so the next step is the Pay Invoice tab
 *   paid    — signed and every installment is covered: nothing to click, just a note
 *   null    — nothing to ask for (no contract to sign, or nothing to pay)
 *
 * Everything here is known on the server before the page paints, so the right button is there on
 * first paint. `paymentSchedule[].status` is derived from the money received, never the stored flag
 * (docs/specs/payment-accounting-truth.md). With no schedule the balance is only known to the Pay
 * tab, so a signed quote still asks for payment.
 */
export type QuoteCta = "approve" | "pay" | "paid" | null;

export function determineQuoteCta({
  signed,
  hasContract,
  paymentSchedule,
  totalCents,
}: {
  signed: boolean;
  /** A terms and conditions template is assigned, so there is something to sign. */
  hasContract: boolean;
  paymentSchedule: ReadonlyArray<{ status: "unpaid" | "partial" | "paid" }>;
  totalCents: number;
}): QuoteCta {
  if (!signed) return hasContract ? "approve" : null;
  if (totalCents <= 0) return null;
  if (paymentSchedule.length > 0 && paymentSchedule.every((i) => i.status === "paid")) {
    return "paid";
  }
  return "pay";
}
