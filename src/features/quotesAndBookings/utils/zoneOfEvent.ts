import { readLeadSubmission } from "./leadSubmissionView";

/**
 * Which zone an event belongs to, for the Quotes & Bookings zone filter. Zones are made of whole
 * states and provinces (`ZoneStateProvinces`), and a state belongs to one zone only.
 *
 * The state comes from the event's address first, which for a quote with a venue is the venue's
 * address (the database copies it onto the event), so what staff corrected wins. Only a quote with
 * no state on its address falls back to the state the person typed in the website form.
 */

/** The zone filter's value for events whose state is missing or in no zone. */
/** What the zone is worked out from. */
type EventLocation = { address_state: string | null; lead_submission?: string | null };

export const UNKNOWN_ZONE = "unknown";

/**
 * A zone filter value that no event has: "I work no zone". It lets a filter say "nothing" where an
 * empty list would mean "every zone".
 */
export const NO_ZONES = "no-zones";

const DISTRICT_OF_COLUMBIA = new Set([
  "dc",
  "d.c.",
  "washington dc",
  "washington d.c.",
  "washington, dc",
  "washington, d.c.",
  "district of columbia",
]);

/** A state or province as a lookup key: trimmed, lowercase, single-spaced, D.C. in one spelling. */
export function normalizeStateProvince(value: string | null | undefined): string {
  const key = (value ?? "").trim().toLowerCase().replace(/\s+/g, " ");
  return DISTRICT_OF_COLUMBIA.has(key) ? "district of columbia" : key;
}

/** state (normalized) → zone id, from the `ZoneStateProvinces` rows. */
export function buildZoneByState(
  rows: { state_province: string | null; zone_uuid: string | null }[],
): Map<string, string> {
  const map = new Map<string, string>();
  for (const row of rows) {
    const key = normalizeStateProvince(row.state_province);
    if (key && row.zone_uuid) map.set(key, row.zone_uuid);
  }
  return map;
}

/** The event's state or province: its address first, else the website form's, else null. */
export function stateOfEvent(event: EventLocation): string | null {
  const fromAddress = (event.address_state ?? "").trim();
  if (fromAddress) return fromAddress;
  const fromForm = readLeadSubmission(event.lead_submission)?.state_prov;
  return typeof fromForm === "string" && fromForm.trim() ? fromForm.trim() : null;
}

/** The event's zone id, or null when it has no state or its state is in no zone. */
export function zoneOfEvent(event: EventLocation, zoneByState: Map<string, string>): string | null {
  const state = normalizeStateProvince(stateOfEvent(event));
  return (state && zoneByState.get(state)) || null;
}
