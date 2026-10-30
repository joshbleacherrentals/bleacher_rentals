/**
 * What the info icons on the tabs of /accountant say. Managers read these to learn what a
 * tab lists and what its columns mean, so the wording is fixed.
 */
export const RECEIVABLES_HELP = {
  ar: "Lists events with an amount due that should have been paid by today.",
  arDeposits: "Lists events with an amount due that is scheduled to be paid after today.",
  needAttention:
    "Lists quotes whose QuickBooks invoice no longer matches the quote. The Reason column shows what differs.",
  amountDue: "The amount that should have been paid by today based on the payment schedule.",
  remainingBalance:
    "The total amount the customer still owes for the event, including future payments.",
} as const;
