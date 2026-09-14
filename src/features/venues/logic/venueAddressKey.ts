import type { VenueAddressFields } from "../types";

/**
 * A normalized (trimmed, lowercased) comparison key for "two venues cannot
 * have the exact same address" — street/city/state/zip only. Works for both
 * Google-Places-picked and hand-typed addresses, unlike comparing place_id
 * (only set for the former).
 */
export function venueAddressKey(address: VenueAddressFields): string {
  return [address.street, address.city, address.stateProvince, address.zipPostal]
    .map((part) => (part ?? "").trim().toLowerCase())
    .join("|");
}
