import type { QuotesBookingsFilters } from "../types";
import { NO_ZONES, UNKNOWN_ZONE } from "./zoneOfEvent";

/**
 * The zones with no active account manager: nobody works them, so their requests have no owner
 * by zone (today, Zone 6). Worked out from the data, so assigning someone to a zone takes it off
 * this list by itself.
 */
export function unstaffedZoneIds(allZoneIds: string[], staffedZoneIds: string[]): string[] {
  const staffed = new Set(staffedZoneIds);
  return allZoneIds.filter((id) => !staffed.has(id));
}

/**
 * The zones the Inbound Leads template narrows to, for whoever clicks it:
 * - an account manager gets the zones they are assigned to;
 * - an admin gets the requests nobody owns by zone: "Zone Unknown" and the unstaffed zones;
 * - someone who is both gets both lists;
 * - anyone else (neither) gets no zone filter, so every zone.
 * An account manager with no zones who is not an admin gets `NO_ZONES`, which matches nothing,
 * because an empty list would show everything.
 */
export function inboundLeadsZones(user: {
  isAdmin: boolean;
  isAccountManager: boolean;
  accountManagerZoneIds: string[];
  unstaffedZoneIds: string[];
}): string[] {
  if (!user.isAdmin && !user.isAccountManager) return [];

  const zones = new Set<string>();
  if (user.isAccountManager) user.accountManagerZoneIds.forEach((id) => zones.add(id));
  if (user.isAdmin) {
    zones.add(UNKNOWN_ZONE);
    user.unstaffedZoneIds.forEach((id) => zones.add(id));
  }
  return zones.size > 0 ? [...zones] : [NO_ZONES];
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
