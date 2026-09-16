import { db } from "@/components/providers/SystemProvider";
import { typedExecute, typedGetAll, expect } from "@/lib/powersync/typedQuery";
import { createErrorToast } from "@/components/toasts/ErrorToast";
import type { VenueAddressFields } from "../types";

type AddressUuidRow = { address_uuid: string | null };

/**
 * Renames a Venue and/or edits its address IN PLACE. Because every event
 * linked to this Venue shares its address_uuid (see docs/specs/venue-history.md
 * §1.3), this updates that address for every one of them at once — this is
 * the one deliberate, explicit place that's allowed to happen (contrast with
 * detaching an event, which never touches the shared row). Callers must
 * confirm with the user first, showing how many other events are affected
 * (see countEventsForVenue).
 */
export async function updateVenue(
  venueId: string,
  params: { name: string; address: VenueAddressFields },
): Promise<void> {
  try {
    const rows = await typedGetAll(
      db.selectFrom("Venues").select(["address_uuid"]).where("id", "=", venueId).limit(1).compile(),
      expect<AddressUuidRow>(),
    );
    const addressUuid = rows[0]?.address_uuid;
    if (!addressUuid) {
      throw new Error("Venue has no address to update");
    }

    await typedExecute(
      db.updateTable("Venues").set({ name: params.name }).where("id", "=", venueId).compile(),
    );

    await typedExecute(
      db
        .updateTable("Addresses")
        .set({
          street: params.address.street,
          city: params.address.city,
          state_province: params.address.stateProvince,
          zip_postal: params.address.zipPostal || null,
          latitude: params.address.lat ?? null,
          longitude: params.address.lng ?? null,
          country: params.address.country ?? null,
          place_id: params.address.placeId ?? null,
        })
        .where("id", "=", addressUuid)
        .compile(),
    );
  } catch (e) {
    createErrorToast(["Failed to update venue.", e instanceof Error ? e.message : ""]);
    throw e;
  }
}
