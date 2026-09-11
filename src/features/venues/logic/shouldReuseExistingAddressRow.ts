/**
 * Safety-critical branch (docs/specs/venue-history.md §0.1): an event's
 * address_uuid can only be mutated in place when it is a row that event
 * privately owns. If the event was linked to a Venue, its address_uuid IS
 * that Venue's own private Addresses row — shared with every other event
 * still linked to it — so detaching must always create a brand-new row
 * instead of mutating the shared one.
 */
export function shouldReuseExistingAddressRow(
  existingAddressUuid: string | null,
  wasLinkedToVenue: boolean,
): boolean {
  return Boolean(existingAddressUuid) && !wasLinkedToVenue;
}
