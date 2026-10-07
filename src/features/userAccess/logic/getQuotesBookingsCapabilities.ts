import { canAccessPath } from "../accessConfig";
import { canEditOwnedEntity } from "./canEditOwnedEntity";
import type { WebRole } from "./determineAccess";
import { getInternalChatCapabilities } from "./getInternalChatCapabilities";

/** Every role the app knows. `satisfies` makes a new WebRole fail to compile until it is listed. */
const KNOWN_ROLES = {
  admin: true,
  account_manager: true,
  developer: true,
  viewer: true,
  driver: true,
  maintainer: true,
  accountant: true,
} satisfies Record<WebRole, true>;

const isKnownRole = (role: string): role is WebRole => Object.hasOwn(KNOWN_ROLES, role);

/**
 * "Can this user do X?" for the quote card (/quotes-bookings/{id}) and the list
 * (/quotes-bookings) — the one place that answers it. Components read the answers and never ask
 * who the user is.
 *
 * Roles are additive: a user holding several gets what any of them gives. A role this function
 * does not know gets nothing. docs/specs/accountant-quotes-03-capabilities.md
 */
export type QuotesBookingsCapabilities = {
  /** The list's "+ Create Quote". */
  createQuote: boolean;
  /** The card's Edit and Delete, for one quote. The owner rule applies to an account manager. */
  manageQuote: boolean;
  /**
   * Send To Client. Any admin or account manager, on any quote: review-gating was disabled per
   * boss feedback, so it does not follow the owner rule.
   */
  sendToClient: boolean;
  /**
   * "+ Record Payment", and with it Edit and Delete on a manual payment: drawn when true, not drawn
   * when false — there is no disabled state. An admin or an accountant, on any quote: the database
   * refuses every other role, so none is shown the button
   * (docs/specs/accountant-quotes-06-am-read-only-payments.md,
   * docs/specs/accountant-quotes-10-accountant-writes-payments.md).
   */
  recordPayment: boolean;
  /**
   * The QuickBooks Invoice checkbox. Bookkeeping, so not tied to the quote's owner: an admin, an
   * account manager or an accountant, on any quote.
   */
  setQuickBooksFlag: boolean;
  /**
   * The Messages tab's internal chat. Delegates to getInternalChatCapabilities, so the rule — an
   * admin, an account manager or an accountant — lives in one place
   * (docs/specs/accountant-quotes-11-accountant-internal-chat.md).
   */
  useInternalChat: boolean;
  /** Open in Dashboard. */
  openInDashboard: boolean;
};

export function getQuotesBookingsCapabilities(input: {
  roles: WebRole[];
  userId: string | null;
  leadZoneIds: string[];
  accountManagerZoneIds: string[];
  /** The quote on the card. The list has none and reads only `createQuote`. */
  quote?: {
    createdByUserId?: string | null;
    /** Zones of the bleachers on the quote; the card passes none today. */
    eventBleacherZoneIds?: string[];
  };
}): QuotesBookingsCapabilities {
  const { userId, leadZoneIds, accountManagerZoneIds, quote } = input;
  // A role this function does not know gives nothing (and must not reach the access config).
  const roles = input.roles.filter(isKnownRole);

  const isAdmin = roles.includes("admin");
  const isAccountManager = roles.includes("account_manager");
  const isStaff = isAdmin || isAccountManager;
  const isAccountant = roles.includes("accountant");

  const manageQuote = canEditOwnedEntity({
    isAdmin,
    isNew: false,
    // Without this a caller who is neither admin nor account manager would fall to the shared
    // function's last branch ("non-AM callers, backwards compat") and be allowed.
    canCreate: isStaff,
    isAccountManager,
    leadZoneIds,
    accountManagerZoneIds,
    createdByUserId: quote?.createdByUserId,
    assignedUserId: quote?.createdByUserId,
    userId,
    eventBleacherZoneIds: quote?.eventBleacherZoneIds,
  });

  return {
    createQuote: isStaff,
    manageQuote,
    sendToClient: isStaff,
    // Who the database lets write PaymentHistory (payment_history_insert and _update): an admin or
    // an accountant, not tied to the quote's owner and not to manageQuote.
    recordPayment: isAdmin || isAccountant,
    // The one cell the accountant has: the database lets them change Events.is_qbo and no other
    // column (docs/specs/accountant-quotes-05-is-qbo-column.md).
    setQuickBooksFlag: isStaff || isAccountant,
    useInternalChat: getInternalChatCapabilities({ roles, isSubscribed: false }).useInternalChat,
    openInDashboard: canAccessPath(roles, "/dashboard"),
  };
}
