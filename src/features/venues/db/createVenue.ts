import { db } from "@/components/providers/SystemProvider";
import { typedExecute } from "@/lib/powersync/typedQuery";
import { createErrorToast } from "@/components/toasts/ErrorToast";
import type { VenueAddressFields, VenueFull } from "../types";

type CreateVenueParams = {
  name: string;
  address: VenueAddressFields;
};

/**
 * Creates a Venue's own private Addresses row plus the Venues row that owns
 * it (see docs/specs/venue-history.md §1.1) — this Addresses row is never
 * shared with anything else, so future edits to it only ever affect this one
 * Venue.
 */
export async function createVenue(params: CreateVenueParams): Promise<VenueFull> {
  try {
    const addressUuid = crypto.randomUUID();
    await typedExecute(
      db
        .insertInto("Addresses")
        .values({
          id: addressUuid,
          street: params.address.street,
          city: params.address.city,
          state_province: params.address.stateProvince,
          zip_postal: params.address.zipPostal || null,
          latitude: params.address.lat ?? null,
          longitude: params.address.lng ?? null,
          country: params.address.country ?? null,
          place_id: params.address.placeId ?? null,
        })
        .compile(),
    );

    const venueId = crypto.randomUUID();
    await typedExecute(
      db
        .insertInto("Venues")
        .values({
          id: venueId,
          name: params.name,
          address_uuid: addressUuid,
          deleted: 0,
        })
        .compile(),
    );

    return { id: venueId, name: params.name, address: params.address };
  } catch (e) {
    createErrorToast(["Failed to create venue.", e instanceof Error ? e.message : ""]);
    throw e;
  }
}
