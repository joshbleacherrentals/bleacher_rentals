"use client";

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import { MessageSquare } from "lucide-react";
import { displayName, useRoadmapUsers } from "@/app/roadmap/_lib/hooks/useRoadmapUsers";
import { createErrorToast } from "@/components/toasts/ErrorToast";
import { createSuccessToast } from "@/components/toasts/SuccessToast";
import { usePermissionsStore } from "@/features/userAccess/state/usePermissionsStore";
import { leaveEventChat, markEventConversationUnread } from "../db/conversationActions";
import { useEventChatConversations } from "../hooks/useEventChatConversations";
import { useInternalChatCapabilities } from "../hooks/useInternalChatCapabilities";
import { EventChatConversationListItem } from "./EventChatConversationListItem";
import { EventChatMembersModal } from "./EventChatMembersModal";

type Props = {
  selectedEventUuid: string | null;
};

export function InternalMessagesSidebar({ selectedEventUuid }: Props) {
  const router = useRouter();
  const { conversations } = useEventChatConversations();
  const { userMap } = useRoadmapUsers();
  const userId = usePermissionsStore((s) => s.userId);
  // The list holds only the conversations the user is subscribed to, so every row is "a chat the
  // user is in" — the same answer useEventChatMemberAccess gives inside one.
  const { manageChatMembers: canManageMembers } = useInternalChatCapabilities(true);

  const [membersEventUuid, setMembersEventUuid] = useState<string | null>(null);
  const [busyEventUuid, setBusyEventUuid] = useState<string | null>(null);

  const handleLeaveChat = useCallback(
    async (eventUuid: string) => {
      if (!userId || busyEventUuid) return;

      setBusyEventUuid(eventUuid);
      try {
        await leaveEventChat(eventUuid, userId, displayName(userMap.get(userId)));
        createSuccessToast(["You left the chat."]);
        if (selectedEventUuid === eventUuid) {
          router.push("/messages/internal");
        }
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        createErrorToast(["Failed to leave chat", message]);
      } finally {
        setBusyEventUuid(null);
      }
    },
    [busyEventUuid, router, selectedEventUuid, userId, userMap],
  );

  const handleMarkUnread = useCallback(
    async (eventUuid: string) => {
      if (!userId || busyEventUuid) return;

      setBusyEventUuid(eventUuid);
      try {
        await markEventConversationUnread(eventUuid, userId);
        createSuccessToast(["Chat marked as unread."]);
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        createErrorToast(["Failed to mark chat as unread", message]);
      } finally {
        setBusyEventUuid(null);
      }
    },
    [busyEventUuid, userId],
  );

  return (
    <>
      <aside className="w-72 flex-shrink-0 border-r border-gray-200 flex flex-col min-h-0 bg-gray-50">
        <div className="px-4 py-3 border-b border-gray-200 bg-white flex-shrink-0">
          <h2 className="text-sm font-semibold text-gray-900">Internal chats</h2>
          <p className="text-xs text-gray-500 mt-0.5">Events you are subscribed to</p>
        </div>

        <div className="flex-1 overflow-y-auto min-h-0">
          {conversations.length === 0 ? (
            <div className="flex flex-col items-center justify-center px-4 py-12 text-center text-gray-400">
              <MessageSquare className="size-8 mb-2" strokeWidth={1.5} />
              <p className="text-sm">No conversations yet</p>
              <p className="text-xs mt-1">Join a chat from an event&apos;s Messages tab</p>
            </div>
          ) : (
            conversations.map((conversation) => (
              <EventChatConversationListItem
                key={conversation.eventUuid}
                conversation={conversation}
                isActive={selectedEventUuid === conversation.eventUuid}
                canManageMembers={canManageMembers}
                actionsDisabled={busyEventUuid === conversation.eventUuid}
                onLeaveChat={() => void handleLeaveChat(conversation.eventUuid)}
                onChatMembers={() => setMembersEventUuid(conversation.eventUuid)}
                onMarkUnread={() => void handleMarkUnread(conversation.eventUuid)}
              />
            ))
          )}
        </div>
      </aside>

      {membersEventUuid && (
        <EventChatMembersModal
          eventUuid={membersEventUuid}
          open={Boolean(membersEventUuid)}
          onOpenChange={(open) => {
            if (!open) setMembersEventUuid(null);
          }}
        />
      )}
    </>
  );
}
