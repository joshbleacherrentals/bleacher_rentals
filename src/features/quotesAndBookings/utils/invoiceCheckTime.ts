import { DateTime } from "luxon";

/**
 * What the Billing tab says about when the quote's QuickBooks invoice was last checked, so that a
 * check that did not run is not mistaken for a clean invoice. Times are shown in the viewer's local
 * time.
 * Spec: docs/specs/qbo-invoice-08-view-and-check.md §4 (the check time)
 */

export type InvoiceCheckDescription = {
  /** The last attempt failed: the first line is drawn in red. */
  failed: boolean;
  lines: string[];
};

/** A timestamp as milliseconds, or null when it is missing or not a time. */
function toMillis(value: string | null | undefined): number | null {
  if (!value) return null;
  const millis = Date.parse(value);
  return Number.isNaN(millis) ? null : millis;
}

const formatTime = (millis: number) =>
  DateTime.fromMillis(millis).setLocale("en").toFormat("d LLL yyyy, HH:mm");

/**
 * A failure later than the check time (or with no check time) is the news; a failure at or before
 * the check time has been made up for by it and is not shown.
 */
export function describeInvoiceCheck(
  checkedAt: string | null | undefined,
  failedAt: string | null | undefined,
): InvoiceCheckDescription {
  const checked = toMillis(checkedAt);
  const failed = toMillis(failedAt);

  if (failed !== null && (checked === null || failed > checked)) {
    return {
      failed: true,
      lines: [
        `The last check failed (${formatTime(failed)}). Press Check again.`,
        ...(checked !== null ? [`Last successful check ${formatTime(checked)}`] : []),
      ],
    };
  }
  if (checked !== null) return { failed: false, lines: [`Checked ${formatTime(checked)}`] };
  return { failed: false, lines: ["Not checked yet"] };
}
