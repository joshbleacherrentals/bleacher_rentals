import type { WebRole } from "./determineAccess";

/** Roles allowed to read the QuickBooks connections: the vendor modal of the Team page needs them. */
export function hasAdminOrAccountantRole(roles: WebRole[]): boolean {
  return roles.includes("admin") || roles.includes("accountant");
}
