import { canEditOwnedEntity } from "./canEditOwnedEntity";

/**
 * Who may change the colour and the bleachers of an event on the dashboard
 * (docs/specs/dashboard-events-read-only.md, D5).
 *
 * It is exactly the `canEdit` the event form computed before the dashboard became read-only: only
 * an admin or an account manager, and then `canEditOwnedEntity` for an existing event. Pure, so the
 * PixiJS grid reads the same answer as the React form.
 */
export function canEditEvent(input: {
  isAdmin: boolean;
  isAccountManager: boolean;
  accountManagerZoneIds: string[];
  leadZoneIds: string[];
  userId: string | null;
  /** `Events.created_by_user_uuid` as loaded (`originalOwnerUserUuid`); null when unknown. */
  originalOwnerUserUuid: string | null;
  /** Zones of the bleachers on the event right now. */
  eventBleacherZoneIds: string[];
}): boolean {
  if (!input.isAdmin && !input.isAccountManager) return false;

  return canEditOwnedEntity({
    isAdmin: input.isAdmin,
    isNew: false,
    isAccountManager: input.isAccountManager,
    accountManagerZoneIds: input.accountManagerZoneIds,
    leadZoneIds: input.leadZoneIds,
    createdByUserId: input.originalOwnerUserUuid,
    userId: input.userId,
    eventBleacherZoneIds: input.eventBleacherZoneIds,
  });
}
