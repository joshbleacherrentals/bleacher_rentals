import type { WebRole } from "./determineAccess";

/**
 * "Can this user do X in the internal chat?" — the one place that answers it, as
 * `getQuotesBookingsCapabilities` is for the quote card. The chat pages, the Messages tab, the bell
 * and the members controls read the answers and never ask who the user is.
 *
 * Roles are additive: a user holding several gets what any of them gives. A role this function does
 * not know gets nothing. `isSubscribed` is for one event's chat: whether the user is in it.
 * docs/specs/accountant-quotes-11-accountant-internal-chat.md §3
 */
export type InternalChatCapabilities = {
  /** Opens /messages/internal, the Messages tab of a quote and the chat bell in the header. */
  useInternalChat: boolean;
  /** Posts, edits their own messages, marks read, shows typing. */
  postInChat: boolean;
  /** The Join button: any admin, account manager or accountant. */
  joinChat: boolean;
  /** Leave chat, from a chat the user is in. */
  leaveChat: boolean;
  /**
   * Adds others to a chat and removes others from it, together. The accountant never does (D1): they
   * can join themselves and nobody else.
   */
  manageChatMembers: boolean;
};

export function getInternalChatCapabilities(input: {
  roles: WebRole[];
  isSubscribed: boolean;
}): InternalChatCapabilities {
  const { roles, isSubscribed } = input;

  const isAdmin = roles.includes("admin");
  const isAccountManager = roles.includes("account_manager");
  const isAccountant = roles.includes("accountant");
  const usesChat = isAdmin || isAccountManager || isAccountant;

  return {
    useInternalChat: usesChat,
    // An admin never has to join first; an account manager or an accountant writes only in a chat
    // they are in (a kicked one reads only).
    postInChat: isAdmin || (usesChat && isSubscribed),
    joinChat: usesChat,
    leaveChat: usesChat && isSubscribed,
    manageChatMembers: isAdmin || (isAccountManager && isSubscribed),
  };
}
