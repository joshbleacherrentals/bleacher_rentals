export type QboFaultError = {
  Message?: string;
  Detail?: string;
  code?: string;
  element?: string;
};

export type QboErrorData = {
  Fault?: { Error?: QboFaultError[]; type?: string };
};

/**
 * Turns a raw QuickBooks Bill-create/update failure into a message that
 * tells the user where in THIS app to go fix it, instead of just QBO's own
 * (accurate but app-agnostic) fault text. Every branch here matches a fault
 * shape actually seen while diagnosing real create-bill failures: a stale
 * vendor id, a stale work-tracker-type account id, and an invalid
 * connection-level tax code.
 *
 * Deliberately conservative: an unrecognized fault shape falls back to
 * QBO's own Detail/Message text rather than a made-up generic string, so
 * this can never be less informative than what shipped before it.
 */
export function interpretQboBillError(errorData: QboErrorData | null | undefined): string {
  const err = errorData?.Fault?.Error?.[0];
  if (!err) return "Failed to create bill in QuickBooks.";

  const detail = err.Detail ?? err.Message ?? "Unknown QuickBooks error.";

  // code 2500 = "Invalid Reference Id" — QBO names which field. We only
  // special-case the two that come from data this app itself maps
  // (vendor, work-tracker-type account); anything else falls through.
  if (err.code === "2500") {
    if (/Names element/i.test(detail)) {
      return `Vendor isn't linked correctly to QuickBooks (${detail}). Fix it in Manage Team → Edit Vendor, then try again.`;
    }
    if (/Accounts element/i.test(detail)) {
      return `A work tracker type's QuickBooks account no longer exists (${detail}). Fix it on /work-tracker-types for this connection, then try again.`;
    }
  }

  // code 6000 = QBO's generic "error while calculating tax" — in practice
  // this has meant the connection's default tax code isn't valid for a
  // Bill (Purchase) transaction on this QuickBooks company.
  if (err.code === "6000") {
    return `This connection's default tax code is invalid for bills (${detail}). Pick a different one on /quickbooks, then try again.`;
  }

  return detail;
}
