import { db } from "@/components/providers/SystemProvider";
import { typedExecute } from "@/lib/powersync/typedQuery";
import { createErrorToast } from "@/components/toasts/ErrorToast";

/**
 * Soft-deletes a Venue — `useVenuesAll` (and so the search/create-duplicate
 * check) already filters `deleted = 0`, so this just makes the venue
 * unfindable/unpickable going forward. Events already linked to it keep
 * their `venue_uuid`/`address_uuid` untouched and keep displaying exactly
 * as before; nothing about their own data changes.
 */
export async function deleteVenue(venueId: string): Promise<void> {
  try {
    await typedExecute(
      db.updateTable("Venues").set({ deleted: 1 }).where("id", "=", venueId).compile(),
    );
  } catch (e) {
    createErrorToast(["Failed to delete venue.", e instanceof Error ? e.message : ""]);
    throw e;
  }
}
