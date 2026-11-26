import type { WebRole } from "./determineAccess";

/**
 * Roles allowed to read the list of QuickBooks connections: the four that edit vendors, because
 * the vendor window picks a connection (docs/specs/vendors-page.md D14).
 *
 * Not `hasAdminOrAccountantRole`: the QuickBooks items and invoice routes use that one and must
 * keep it.
 */
export function hasQboConnectionsReaderRole(roles: WebRole[]): boolean {
  return (
    roles.includes("admin") ||
    roles.includes("accountant") ||
    roles.includes("account_manager") ||
    roles.includes("maintainer")
  );
}
