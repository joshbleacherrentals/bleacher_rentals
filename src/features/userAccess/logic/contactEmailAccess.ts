import type { WebRole } from "./determineAccess";

/**
 * Roles that may pull a contact's emails from Gmail: an admin, an account manager and an
 * accountant, the same people who can send email. Pulling saves emails onto the contact, which a
 * viewer's read-only access does not cover. The server checks this on every pull
 * (requireContactEmailPuller).
 */
export function canPullContactEmails(roles: readonly WebRole[]): boolean {
  return (
    roles.includes("admin") || roles.includes("account_manager") || roles.includes("accountant")
  );
}

/**
 * Roles that may open a contact's email, which is read from Gmail the moment it is opened: the
 * ones that can pull, and a viewer, who can read Companies & Contacts. Nobody else has that page.
 * The server checks this on every open (requireContactEmailReader).
 */
export function canOpenContactEmails(roles: readonly WebRole[]): boolean {
  return canPullContactEmails(roles) || roles.includes("viewer");
}

export const CANNOT_PULL_CONTACT_EMAILS_MESSAGE =
  "You don't have permission to pull emails from Gmail. Only admins, account managers and accountants can.";

export const CANNOT_OPEN_CONTACT_EMAILS_MESSAGE =
  "You don't have permission to open contact emails. Only admins, account managers, accountants and viewers can.";
