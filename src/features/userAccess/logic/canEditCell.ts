import { isBleacherOwnedByAM } from "./isBleacherOwnedByAM";

/**
 * Pure function: determines if the current user can edit a dashboard cell.
 *
 * - Admin: always true
 * - AM: true only when the bleacher is in one of their assigned zones
 * - Maintainer: true on an empty cell, or on a note they wrote themselves
 *   (docs/specs/maintainer-dashboard-cells.md). The database enforces the same rule.
 * - Viewer (none of the above): always false
 *
 * A user holding several roles gets the union of the rules.
 */
export function canEditCell(params: {
  isAdmin: boolean;
  isAccountManager: boolean;
  accountManagerZoneIds: string[];
  bleacherUuid: string | null;
  bleacher: {
    zoneUuid: string | null | undefined;
  } | null;
  isMaintainer?: boolean;
  currentUserUuid?: string | null;
  /** The note already in the cell; null or absent when the cell is empty. */
  block?: { createdByUserUuid: string | null } | null;
}): boolean {
  const {
    isAdmin,
    isAccountManager,
    accountManagerZoneIds,
    bleacherUuid,
    bleacher,
    isMaintainer = false,
    currentUserUuid = null,
    block = null,
  } = params;

  if (isAdmin) return true;

  if (isAccountManager && bleacherUuid && bleacher) {
    const ownsBleacher = isBleacherOwnedByAM({
      bleacherZoneUuid: bleacher.zoneUuid,
      accountManagerZoneIds,
    });
    if (ownsBleacher) return true;
  }

  if (isMaintainer && bleacherUuid) {
    if (!block) return true;
    // Strict equality on a real uuid: an old note (null author) or a client that has not
    // synced the author column yet (undefined) never matches.
    return currentUserUuid != null && block.createdByUserUuid === currentUserUuid;
  }

  return false;
}
