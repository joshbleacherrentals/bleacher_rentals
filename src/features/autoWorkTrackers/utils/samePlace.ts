import { straightLineKm } from "./distance";
import { normalizeStreet } from "./discoverTrips";

/** Where something is, as far as it is known: its address row, coordinates and street text. */
export type Place = {
  addressUuid?: string | null;
  street: string | null;
  latitude?: number | null;
  longitude?: number | null;
};

/** Two places this close count as the same place (one venue's different address rows). */
export const SAME_PLACE_METERS = 200;

const hasCoords = (p: Place) => p.latitude != null && p.longitude != null;

/** Whether a place is known at all: it has coordinates or a street. */
export function isKnownPlace(p: Place): boolean {
  return hasCoords(p) || normalizeStreet(p.street) !== "";
}

/**
 * Whether two records point at the same place. The same address row is the same place; otherwise
 * two points within SAME_PLACE_METERS are; only when either has no coordinates does the street text
 * decide (normalized, and never two empty streets). Re-picking an address from Google changes its
 * text ("2371 Merrittville Highway" vs "2371 Merrittville Highway, Fonthill, ON, Canada"), so the
 * text alone is not trusted when there is better. Pure.
 */
export function samePlace(a: Place, b: Place): boolean {
  if (a.addressUuid && b.addressUuid && a.addressUuid === b.addressUuid) return true;
  if (hasCoords(a) && hasCoords(b)) {
    const km = straightLineKm(a, b);
    return km !== null && km * 1000 <= SAME_PLACE_METERS;
  }
  const sa = normalizeStreet(a.street);
  return sa !== "" && sa === normalizeStreet(b.street);
}
