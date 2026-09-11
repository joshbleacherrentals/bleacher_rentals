/**
 * See docs/specs/venue-history.md — "Auto-fill, never overwrite": selecting a
 * contact fills the venue field only if it is currently empty, from that
 * contact's default_venue_uuid. Never overwrites a venue that's already set,
 * and never writes anything back onto the contact.
 */
export function resolveVenueOnContactSelect<T extends { id: string }>(
  currentVenueId: string | null,
  contactDefaultVenueId: string | null,
  venues: T[],
): T | null {
  if (currentVenueId) return null;
  if (!contactDefaultVenueId) return null;
  return venues.find((v) => v.id === contactDefaultVenueId) ?? null;
}
