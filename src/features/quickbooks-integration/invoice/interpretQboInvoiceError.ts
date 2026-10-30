import type { QboErrorData } from "../interpretQboBillError";

/**
 * Turns a QuickBooks invoice-create fault into text for the accountant. Only the tax-calculation
 * fault is worded here; anything else returns QuickBooks' own Detail, then Message, so this is never
 * less informative than the raw fault. A platform error page (504 and the like) has no Fault: the
 * text parseQboApiResponse gave it is passed on.
 * Spec: docs/specs/qbo-invoice-04-create.md §7
 */

export type QboInvoiceErrorData = QboErrorData & { error?: unknown };

const FALLBACK = "Failed to create invoice in QuickBooks.";

export function interpretQboInvoiceError(
  errorData: QboInvoiceErrorData | null | undefined,
): string {
  const err = errorData?.Fault?.Error?.[0];
  if (!err) {
    return typeof errorData?.error === "string" ? errorData.error : FALLBACK;
  }

  const detail = err.Detail ?? err.Message;

  // code 6000 = QBO's generic "error while calculating tax" — for an invoice the address it
  // calculates from is the event's.
  if (err.code === "6000") {
    return `QuickBooks could not calculate the tax for this invoice${detail ? ` (${detail})` : ""}. Check the event address on the quote, then try again.`;
  }

  return detail ?? FALLBACK;
}
