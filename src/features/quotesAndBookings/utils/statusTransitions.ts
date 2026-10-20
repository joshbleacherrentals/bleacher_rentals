import type { QuoteStatus } from "../types/quoteTypes";

/**
 * How a quote's status may move. The stored values are `draft`, `quoted`, `booked`,
 * `unsigned_changes` and `lost`; people see the labels below.
 *
 * - `draft` is a quote that has not been sent. Once it is `quoted` or later it never goes back.
 * - `quoted` is set by sending the quote, or by hand.
 * - `booked` is set when the client signs, or by hand.
 * - `unsigned_changes` is set only by the database, when a booked quote's contract is edited and
 *   its signature is invalidated (migration 20261018150000). It can only become `booked` or `lost`.
 * - `lost` is allowed from anywhere.
 */

export const STATUS_LABELS: Record<QuoteStatus, string> = {
  draft: "New",
  quoted: "Quote Sent",
  booked: "Quote Signed",
  unsigned_changes: "Unsigned Changes",
  lost: "Lost",
};

const ORDER: QuoteStatus[] = ["draft", "quoted", "booked", "unsigned_changes", "lost"];

const isStatus = (value: string | null | undefined): value is QuoteStatus =>
  ORDER.includes(value as QuoteStatus);

/** The label for a stored status; an unknown or missing one is shown as it is. */
export function statusLabel(status: string | null | undefined): string {
  return isStatus(status) ? STATUS_LABELS[status] : (status ?? "Unknown");
}

/** Whether a quote may be changed from `from` to `to`. `from` is null for a quote not saved yet. */
export function canTransition(from: string | null | undefined, to: QuoteStatus): boolean {
  if (from === to) return true;
  if (to === "unsigned_changes") return false;
  if (to === "lost") return true;
  if (!isStatus(from)) return true;
  if (from === "unsigned_changes") return to === "booked";
  if (to === "draft") return false;
  return true;
}

/** The statuses offered for a quote saved as `from`, in display order. */
export function allowedStatuses(from: string | null | undefined): QuoteStatus[] {
  return ORDER.filter((status) => canTransition(from, status));
}

/** Throws the message to show when the change is not allowed. */
export function assertStatusTransition(from: string | null | undefined, to: QuoteStatus): void {
  if (canTransition(from, to)) return;
  throw new Error(`A quote that is ${statusLabel(from)} cannot be changed to ${statusLabel(to)}.`);
}
