export type VenueAddressFields = {
  street: string;
  city: string;
  stateProvince: string;
  zipPostal: string;
  lat?: number;
  lng?: number;
  placeId?: string;
  country?: string;
};

export type VenueFull = {
  id: string;
  name: string;
  address: VenueAddressFields;
};

/**
 * The value VenuePicker/VenueCard work with. "venue" = linked to an
 * existing/new Venue record; "empty" = nothing picked yet.
 *
 * "manual" (a hand-typed address with no Venue behind it) is legacy only —
 * VenuePicker no longer has any interactive path that produces it. It still
 * exists in the type because some already-saved events have exactly this
 * shape; VenueCard still renders it (plain address, no bold name, no edit
 * affordance) so those events don't show as blank, and re-saving one
 * unchanged keeps working. See docs/specs/venue-history.md §2.3.
 */
export type VenuePickerValue =
  | { mode: "venue"; venueId: string; name: string; address: VenueAddressFields }
  | { mode: "manual"; venueId: null; address: VenueAddressFields }
  | { mode: "empty"; venueId: null; address: null };
