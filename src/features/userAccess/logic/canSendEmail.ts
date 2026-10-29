import {
  COMPANY_EMAIL_DOMAIN,
  isCompanyEmail,
} from "@/features/quotesAndBookings/utils/companyEmail";
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

/** What someone whose role cannot send is told, on the buttons and in a refused request. */
export const CANNOT_SEND_EMAIL_MESSAGE =
  "You don't have permission to send emails. Only admins, account managers and accountants can.";

/**
 * What someone whose account is not on the company domain is told. An email goes out from the
 * sender's own company mailbox, so a personal address has nothing to send from.
 */
export const NOT_COMPANY_EMAIL_MESSAGE = `Emails are sent from your own company mailbox, and your account's email is not a ${COMPANY_EMAIL_DOMAIN} address.`;

/**
 * Why this person cannot send email, or null when they can: the role is checked first, then the
 * account's email. `email` is undefined while it is still loading, which is not held against
 * anyone; null is an account with no email, which cannot send.
 */
export function emailSendBlock({
  roles,
  email,
}: {
  roles: readonly WebRole[];
  email: string | null | undefined;
}): string | null {
  if (!canSendEmail(roles)) return CANNOT_SEND_EMAIL_MESSAGE;
  if (email !== undefined && !isCompanyEmail(email)) return NOT_COMPANY_EMAIL_MESSAGE;
  return null;
}
