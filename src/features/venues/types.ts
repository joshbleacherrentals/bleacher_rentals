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
