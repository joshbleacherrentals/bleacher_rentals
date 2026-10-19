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
