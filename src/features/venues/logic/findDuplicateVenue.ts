import type { VenueAddressFields, VenueFull } from "../types";
import { venueAddressKey } from "./venueAddressKey";

/**
 * The other venue (if any) that already sits at this exact address.
 * `venues` should already exclude soft-deleted rows (useVenuesAll does) so a
 * deleted venue's address is free to reuse. Pass `excludeVenueId` when
 * checking an in-place edit, so a venue never collides with itself.
 */
export function findDuplicateVenue(
  venues: VenueFull[],
  address: VenueAddressFields,
  excludeVenueId?: string | null,
): VenueFull | null {
  const key = venueAddressKey(address);
  return venues.find((v) => v.id !== excludeVenueId && venueAddressKey(v.address) === key) ?? null;
}
