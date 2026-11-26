import type { WebRole } from "./determineAccess";

/**
 * Who gets the Add button, the editing and the Restore button on the Vendors page: admin, account
 * manager, maintainer and accountant (docs/specs/vendors-page.md D5). A viewer reads only.
 *
 * It decides only whether the controls are shown. The database already lets these four write
 * vendors, and no new rule was added for the page (D6).
 */
export function canManageVendors(roles: WebRole[]): boolean {
  return (
    roles.includes("admin") ||
    roles.includes("account_manager") ||
    roles.includes("maintainer") ||
    roles.includes("accountant")
  );
}
