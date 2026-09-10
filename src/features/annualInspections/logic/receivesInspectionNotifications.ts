import type { WebRole } from "@/features/userAccess/logic/determineAccess";

/**
 * Who is nagged about the queue: the sidebar badge and the highlight on the
 * rows that crossed a threshold since the last visit.
 *
 * Only the maintainer. Reading the queue and being chased by it are two
 * different things — an administrator can open the page and a viewer can read
 * it, but the inspections are the maintainer's job, and a badge that everyone
 * carries is a badge nobody looks at, which is the failure this whole feature
 * exists to avoid.
 *
 * Deliberately not `canOpenTheQueue`: those lists differ, and the day someone
 * conflates them the badge comes back for admins.
 */
export function receivesInspectionNotifications(roles: WebRole[]): boolean {
  return roles.includes("maintainer");
}
