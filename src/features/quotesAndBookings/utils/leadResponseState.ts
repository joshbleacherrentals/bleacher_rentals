import type { QuoteStatus } from "../types/quoteTypes";
import { allowedStatuses, statusLabel } from "./statusTransitions";

/**
 * A website request that is still a draft has two extra states, worked out from the event and not
 * stored as a status: `awaiting_response` (nobody has answered it yet) and `responded`
 * (`Events.hide_lead_alert` is on). Everything else shows its stored status.
 */
export type LeadResponseState = "awaiting_response" | "responded";
export type DisplayState = QuoteStatus | LeadResponseState;

export const LEAD_STATE_LABELS: Record<LeadResponseState, string> = {
  awaiting_response: "Fresh Inbound",
  responded: "Responded",
};

export function displayState(event: {
  status: string | null;
  hasLeadSubmission: boolean;
  hideLeadAlert: boolean;
}): DisplayState | null {
  if (event.status === "draft" && event.hasLeadSubmission) {
    return event.hideLeadAlert ? "responded" : "awaiting_response";
  }
  return (event.status as QuoteStatus | null) ?? null;
}

export const isLeadResponseState = (state: string | null): state is LeadResponseState =>
  state === "awaiting_response" || state === "responded";

export function displayStateLabel(state: string | null): string {
  return isLeadResponseState(state) ? LEAD_STATE_LABELS[state] : statusLabel(state);
}

/**
 * What the status button lists. A website request that is still a draft offers the other lead state
 * and then the real statuses it may become (not "New", which is what it already is).
 */
export function displayStateOptions(state: string | null): DisplayState[] {
  if (state === "awaiting_response") {
    return ["responded", ...allowedStatuses("draft").filter((s) => s !== "draft")];
  }
  if (state === "responded") {
    return ["awaiting_response", ...allowedStatuses("draft").filter((s) => s !== "draft")];
  }
  return allowedStatuses(state);
}
