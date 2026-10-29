import type { WebRole } from "./determineAccess";

/**
 * Roles that may send email from the app: an admin, an account manager and an accountant. Nobody
 * else. The server checks this for every send (requireEmailSender); the Reply, Reply all and
 * Forward buttons read it too, to show themselves as unavailable.
 */
export function canSendEmail(roles: readonly WebRole[]): boolean {
  return (
    roles.includes("admin") || roles.includes("account_manager") || roles.includes("accountant")
  );
}

/** What someone who cannot send is told, on the buttons and in a refused request. */
export const CANNOT_SEND_EMAIL_MESSAGE =
  "You can't send emails with your permission level. Only admins, account managers and accountants can.";
