/**
 * Whether the signed-in user has access to the bleacher of a Dashboard row. Without it the row is
 * drawn grey. An administrator has every bleacher, and so does a maintainer: they look after the
 * condition of the whole fleet, add repairs and write notes in any empty cell, and only cannot book
 * it. An account manager has the bleachers of their own zones, and none that has no zone.
 * docs/specs/repairs-11-dashboard.md §11.
 */
export function canAccessBleacherRow(params: {
  isAdmin: boolean;
  isMaintainer: boolean;
  isAccountManager: boolean;
  accountManagerZoneIds: readonly string[];
  /** The zone the row stands in: the bleacher's own, or the zone a sub-rental row was borrowed into. */
  zoneUuid: string | null | undefined;
}): boolean {
  const { isAdmin, isMaintainer, isAccountManager, accountManagerZoneIds, zoneUuid } = params;
  if (isAdmin || isMaintainer) return true;
  return isAccountManager && !!zoneUuid && accountManagerZoneIds.includes(zoneUuid);
}
