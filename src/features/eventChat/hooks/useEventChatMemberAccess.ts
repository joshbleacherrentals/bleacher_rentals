"use client";

import { usePermissionsStore } from "@/features/userAccess/state/usePermissionsStore";
import { useInternalChatCapabilities } from "./useInternalChatCapabilities";
import { useIsSubscribedToEvent } from "./useEventSubscriptions";

/**
 * Who can open the members modal, add/kick, and write messages — answered by
 * getInternalChatCapabilities (docs/specs/accountant-quotes-11-accountant-internal-chat.md §3).
 *
 * Admin: manage members even when not subscribed; can always write.
 * AM: must be subscribed to manage members or write; kicked AM can read only.
 * Accountant: must be subscribed to write; manages no members (they join and leave themselves).
 */
export function useEventChatMemberAccess(eventUuid: string) {
  const userId = usePermissionsStore((s) => s.userId);
  const isSubscribed = useIsSubscribedToEvent(eventUuid, userId);
  const { manageChatMembers, postInChat } = useInternalChatCapabilities(isSubscribed);

  const canManageMembers = manageChatMembers;
  const canWrite = postInChat;

  return {
    isSubscribed,
    canManageMembers,
    canWrite,
  };
}
