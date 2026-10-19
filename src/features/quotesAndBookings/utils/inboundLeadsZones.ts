import type { QuotesBookingsFilters } from "../types";
import { UNKNOWN_ZONE } from "./zoneOfEvent";

/**
 * The zones the Inbound Leads template narrows to. An account manager works the requests in their
 * own zones, plus the ones whose zone could not be worked out ("Zone Unknown"), which every
 * account manager sees. An admin, or anyone who is not an account manager, sees every zone, which
 * is no zone filter at all.
 */
export function inboundLeadsZones(user: {
  isAdmin: boolean;
  isAccountManager: boolean;
  accountManagerZoneIds: string[];
}): string[] {
  if (user.isAdmin || !user.isAccountManager) return [];
  return [...new Set(user.accountManagerZoneIds), UNKNOWN_ZONE];
}

/** Whether two zone filters pick the same zones, in any order. */
export function sameZones(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((zone) => b.includes(zone));
}

/**
 * The filters the Inbound Leads template applies: website quotes not sent yet (still `draft`) in
 * the given zones (none = every zone). The template button and its count both use this, so the
 * number on the button is the number of rows the button shows.
 */
export function inboundLeadsFilters(zoneUuids: string[]): QuotesBookingsFilters {
  return {
    isOpen: false,
    statuses: ["draft"],
    createdFrom: null,
    createdTo: null,
    eventFrom: null,
    eventTo: null,
    bookedFrom: null,
    bookedTo: null,
    accountManagerUserUuid: null,
    inGoodShuffle: null,
    inQuickBooks: null,
    salesOfficeUuid: null,
    inbound: true,
    zoneUuids,
  };
}
