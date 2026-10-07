"use client";
import { useMemo } from "react";
import { usePermissionsStore } from "@/features/userAccess/state/usePermissionsStore";
import {
  getInternalChatCapabilities,
  type InternalChatCapabilities,
} from "@/features/userAccess/logic/getInternalChatCapabilities";

/**
 * "Can I do X in the internal chat?" The one place in the chat that reads the permissions store's
 * roles: the header's bell, the chat layout, the conversation list and a chat's own access all call
 * this and read the answers, so no chat component asks who the user is.
 *
 * Pass `isSubscribed` for one event's chat (whether the user is in it); the pages that only ask
 * whether the chat is open to the user pass nothing.
 */
export function useInternalChatCapabilities(isSubscribed = false): InternalChatCapabilities {
  const roles = usePermissionsStore((state) => state.roles);

  return useMemo(() => getInternalChatCapabilities({ roles, isSubscribed }), [roles, isSubscribed]);
}
