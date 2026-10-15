"use client";

import { useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { createErrorToast } from "@/components/toasts/ErrorToast";
import { createSuccessToast } from "@/components/toasts/SuccessToast";
import { addEventChatMember, removeEventChatMember } from "../db/conversationActions";
import {
  chatUserDisplayName,
  chatUserInitials,
  useChatEligibleUsers,
  type ChatEligibleUser,
} from "../hooks/useChatEligibleUsers";
import { useEventSubscriptions } from "../hooks/useEventSubscriptions";
import { usePermissionsStore } from "@/features/userAccess/state/usePermissionsStore";
import { displayName, useRoadmapUsers } from "@/app/roadmap/_lib/hooks/useRoadmapUsers";

type Props = {
  eventUuid: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export function EventChatMembersModal({ eventUuid, open, onOpenChange }: Props) {
  const { users } = useChatEligibleUsers();
  const { subscribedUserIds } = useEventSubscriptions(eventUuid);
  const { userMap } = useRoadmapUsers();
  const currentUserUuid = usePermissionsStore((s) => s.userId);

  const [busyUserId, setBusyUserId] = useState<string | null>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const pendingScrollTopRef = useRef<number | null>(null);

  const saveListScroll = () => {
    if (listRef.current) {
      pendingScrollTopRef.current = listRef.current.scrollTop;
    }
  };

  // Members first, then everyone else — both groups sorted by name.
  const sortedUsers = useMemo(() => {
    const members: ChatEligibleUser[] = [];
    const nonMembers: ChatEligibleUser[] = [];
    for (const user of users) {
      if (subscribedUserIds.has(user.userUuid)) {
        members.push(user);
      } else {
        nonMembers.push(user);
      }
    }
    const byName = (a: ChatEligibleUser, b: ChatEligibleUser) =>
      chatUserDisplayName(a).localeCompare(chatUserDisplayName(b));
    return [...members.sort(byName), ...nonMembers.sort(byName)];
  }, [users, subscribedUserIds]);

  // Re-sorting moves added users to the members section — restore scroll position.
  useLayoutEffect(() => {
    const el = listRef.current;
    const top = pendingScrollTopRef.current;
    if (!el || top === null) return;

    el.scrollTop = top;
    pendingScrollTopRef.current = null;
  }, [sortedUsers]);

  // The system message is posted as the signed-in user; without one there is none to post.
  const systemMessage = (text: string) =>
    currentUserUuid ? { userUuid: currentUserUuid, body: text } : null;

  const handleAdd = async (target: ChatEligibleUser) => {
    saveListScroll();
    setBusyUserId(target.userUuid);
    try {
      const actor = displayName(userMap.get(currentUserUuid ?? ""));
      await addEventChatMember(
        eventUuid,
        target.userUuid,
        systemMessage(`${actor} added ${chatUserDisplayName(target)} to the conversation.`),
      );
      createSuccessToast([`${chatUserDisplayName(target)} added to the chat.`]);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      createErrorToast(["Failed to add member", message]);
    } finally {
      setBusyUserId(null);
    }
  };

  const handleKick = async (target: ChatEligibleUser) => {
    saveListScroll();
    setBusyUserId(target.userUuid);
    try {
      const actor = displayName(userMap.get(currentUserUuid ?? ""));
      await removeEventChatMember(
        eventUuid,
        target.userUuid,
        systemMessage(`${actor} removed ${chatUserDisplayName(target)} from the chat.`),
      );
      createSuccessToast([`${chatUserDisplayName(target)} removed from the chat.`]);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      createErrorToast(["Failed to remove member", message]);
    } finally {
      setBusyUserId(null);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Chat members</DialogTitle>
          <DialogDescription>
            Add or remove admins and account managers from this internal discussion.
          </DialogDescription>
        </DialogHeader>

        <ul ref={listRef} className="max-h-80 overflow-y-auto divide-y border rounded-md">
          {sortedUsers.length === 0 ? (
            <li className="px-4 py-6 text-sm text-gray-400 text-center">
              No eligible users found.
            </li>
          ) : (
            sortedUsers.map((user) => {
              const isMember = subscribedUserIds.has(user.userUuid);
              const isBusy = busyUserId === user.userUuid;

              return (
                <li
                  key={user.userUuid}
                  className="flex items-center justify-between gap-3 px-4 py-3"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="size-8 rounded-full bg-gray-200 flex items-center justify-center text-xs font-semibold text-gray-700 flex-shrink-0">
                      {chatUserInitials(user)}
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-gray-900 truncate">
                        {chatUserDisplayName(user)}
                        {user.isAdmin && (
                          <span className="ml-1.5 text-[10px] uppercase text-gray-400 font-normal">
                            Admin
                          </span>
                        )}
                      </p>
                      {user.email && <p className="text-xs text-gray-500 truncate">{user.email}</p>}
                    </div>
                  </div>

                  {isMember ? (
                    <button
                      type="button"
                      disabled={isBusy}
                      onClick={() => void handleKick(user)}
                      className="px-3 py-1 text-xs font-medium text-red-600 border border-red-200 rounded hover:bg-red-50 disabled:opacity-50 cursor-pointer flex-shrink-0"
                    >
                      {isBusy ? "…" : "Kick"}
                    </button>
                  ) : (
                    <button
                      type="button"
                      disabled={isBusy}
                      onClick={() => void handleAdd(user)}
                      className="px-3 py-1 text-xs font-medium text-darkBlue border border-gray-300 rounded hover:bg-gray-50 disabled:opacity-50 cursor-pointer flex-shrink-0"
                    >
                      {isBusy ? "…" : "Add"}
                    </button>
                  )}
                </li>
              );
            })
          )}
        </ul>
      </DialogContent>
    </Dialog>
  );
}
