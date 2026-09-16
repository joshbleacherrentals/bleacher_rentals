"use client";

import type { AttentionReason } from "../util/attentionTrackers";

const REASON_LABELS: Record<AttentionReason, string> = {
  declined: "Needs attention: declined by the driver",
  abandoned: "Needs attention: abandoned by the driver",
  bleacher_swap: "Needs attention: driver took a different bleacher than assigned",
};

/**
 * The per-tracker counterpart of the red counts: a dot on the one row of a
 * driver's week that the count is about, with the reason on hover.
 */
export function AttentionMark({ reason }: { reason: AttentionReason | undefined }) {
  if (!reason) return null;
  const label = REASON_LABELS[reason];
  return (
    <span
      data-testid="attention-mark"
      data-reason={reason}
      role="img"
      aria-label={label}
      title={label}
      className="inline-block size-2.5 shrink-0 rounded-full bg-red-600"
    />
  );
}
