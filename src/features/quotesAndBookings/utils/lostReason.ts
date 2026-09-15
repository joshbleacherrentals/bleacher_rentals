/**
 * Why a quote/event was lost.
 *
 * Marking something Lost is the end of the line for that quote, so it is the
 * one moment where the reason can still be captured. Both places that can set
 * the status — the quote edit page and the dashboard event modal — import these
 * rules rather than restating them, so the two forms cannot drift apart.
 *
 * Mirrors the `public.event_lost_reason` Postgres enum.
 */
export type LostReason =
  | "out_of_service_area"
  | "sold_out"
  | "size_does_not_work"
  | "price_too_high"
  | "other";

export const LOST_REASON_OPTIONS: { label: string; value: LostReason }[] = [
  { label: "Out of service area", value: "out_of_service_area" },
  { label: "Sold out", value: "sold_out" },
  { label: "Size doesn't work (indoor)", value: "size_does_not_work" },
  { label: "Price too high", value: "price_too_high" },
  { label: "Other", value: "other" },
];

/** Human label for a stored value — null for events lost before this existed. */
export function lostReasonLabel(value: string | null | undefined): string | null {
  return LOST_REASON_OPTIONS.find((o) => o.value === value)?.label ?? null;
}

export type LostReasonInput = {
  status: string;
  lostReason: LostReason | null;
  lostReasonNote: string;
};

/**
 * Blocking validation for a save. An empty array means the save may proceed.
 *
 * Only a quote being saved as lost is held to this: any other status saves
 * freely and has its reason cleared by `normalizeLostFields`.
 */
export function validateLostReason(input: LostReasonInput): string[] {
  if (input.status !== "lost") return [];
  if (!input.lostReason) return ["Lost Reason is required when the status is Lost."];
  if (input.lostReason === "other" && !input.lostReasonNote.trim()) {
    return ["Lost Reason 'Other' needs a note explaining why."];
  }
  return [];
}

/**
 * What actually gets written to `Events`. A quote that is no longer lost carries
 * no reason, however long the form held one — so flipping the status back and
 * forth can never leave a stale reason behind on the row.
 */
export function normalizeLostFields(input: LostReasonInput): {
  lost_reason: LostReason | null;
  lost_reason_note: string | null;
} {
  if (input.status !== "lost" || !input.lostReason) {
    return { lost_reason: null, lost_reason_note: null };
  }
  const note = input.lostReason === "other" ? input.lostReasonNote.trim() : "";
  return { lost_reason: input.lostReason, lost_reason_note: note || null };
}

/**
 * One line for read-only views: the label, with the note spelled out behind
 * "Other". Events lost before this column existed read as "Not recorded" —
 * never as a blank, which would look like a bug rather than missing history.
 */
export function formatLostReason(
  reason: string | null | undefined,
  note: string | null | undefined,
): string {
  const label = lostReasonLabel(reason);
  if (!label) return "Not recorded";
  if (reason !== "other") return label;
  const trimmed = note?.trim();
  return trimmed ? `${label}: ${trimmed}` : label;
}
