/**
 * Who gets what on the Work Trackers pages. docs/specs/accountant-work-trackers.md
 *
 * Pure on purpose: each rule here is something a test pins down, because the neighbouring
 * rules are the kind that drift (an inline `isAdmin || isAccountManager` on one page and a
 * different one on the next).
 */

/** Opening a week's driver list: admins, account managers and — to read and pay — accountants. */
export function canOpenWorkTrackerWeek(access: {
  isAdmin: boolean;
  isAccountManager: boolean;
  isAccountant: boolean;
}): boolean {
  return access.isAdmin || access.isAccountManager || access.isAccountant;
}

/**
 * "See All Drivers" is permanently on. An accountant has no zones, so "my drivers" would be an
 * empty list, and they pay every driver. (An admin sees everyone too, but keeps the switch they
 * already have — it is not touched here.)
 */
export function seesAllDriversAlways(access: { isAccountant: boolean }): boolean {
  return access.isAccountant;
}

/**
 * The Release All button: releases a driver's draft work trackers to the driver, so it is a write
 * on work trackers. Only an admin or a zone lead may. `isAccountant` is deliberately not an
 * input — the Accountant role cannot release work trackers (spec §0), and leaving it out of the
 * signature means no future caller can pass it in as a way through.
 */
export function canReleaseAllDrafts(access: { isAdmin: boolean; leadZoneIds: string[] }): boolean {
  return access.isAdmin || access.leadZoneIds.length > 0;
}
