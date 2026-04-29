"use client";

import { useEffect, useRef, useState, useMemo, useCallback } from "react";
import { Bell, BellOff, Check, CheckCheck, Send, UserPlus, X } from "lucide-react";
import { PrimaryButton } from "@/components/PrimaryButton";
import { createErrorToast } from "@/components/toasts/ErrorToast";
import { createSuccessToast } from "@/components/toasts/SuccessToast";
import { useMessagesForTask } from "../hooks/useMessages";
import { useSubscriptionsForTask, useIsSubscribed } from "../hooks/useSubscriptions";
import { useTypingIndicators, useTypingEmitter } from "../hooks/useTypingIndicators";
import { useReadReceiptsForTask } from "../hooks/useReadReceipts";
import { useRoadmapCurrentUserUuid } from "../hooks/useRoadmapCurrentUserUuid";
import { useRoadmapUsers, displayName, initials } from "../hooks/useRoadmapUsers";
import { useRoadmapAccessLevel } from "../hooks/useRoadmapAccessLevel";
import { STATUSES } from "@/features/manageTeam/constants";
import { sendTaskMessage } from "../db/messages";
import { subscribeToTask, unsubscribeFromTask, markMessagesRead } from "../db/subscriptions";

type Props = {
  taskId: string;
  /** When true, renders in a compact fixed-height panel suitable for embedding in a modal */
  compact?: boolean;
};

export function TaskChat({ taskId, compact = false }: Props) {
  const { messages } = useMessagesForTask(taskId);
  const { subscriptions } = useSubscriptionsForTask(taskId);
  const { userUuid } = useRoadmapCurrentUserUuid();
  const { userMap } = useRoadmapUsers();
  const { receiptsByMessage } = useReadReceiptsForTask(taskId);
  const isSubscribed = useIsSubscribed(taskId, userUuid);
  const { typingUserUuids } = useTypingIndicators(taskId, userUuid);
  const { emitTyping, stopTyping } = useTypingEmitter(taskId, userUuid);
  const { isAdmin } = useRoadmapAccessLevel();

  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);
  const [subLoading, setSubLoading] = useState(false);
  const [addingPeople, setAddingPeople] = useState(false);
  const [peopleSearch, setPeopleSearch] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);
  const addPeopleRef = useRef<HTMLDivElement>(null);
  const prevMessageCountRef = useRef(0);

  useEffect(() => {
    if (messages.length > prevMessageCountRef.current) {
      bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    }
    prevMessageCountRef.current = messages.length;
  }, [messages.length]);

  useEffect(() => {
    if (!taskId || !userUuid) return;
    markMessagesRead(taskId, userUuid);
  }, [taskId, userUuid, messages.length]);

  // Close "Add People" dropdown on outside click
  useEffect(() => {
    if (!addingPeople) return;
    function handleClick(e: MouseEvent) {
      if (addPeopleRef.current && !addPeopleRef.current.contains(e.target as Node)) {
        setAddingPeople(false);
        setPeopleSearch("");
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [addingPeople]);

  const subscribedUuids = useMemo(
    () => new Set(subscriptions.map((s) => s.user_uuid).filter(Boolean) as string[]),
    [subscriptions],
  );

  const addableUsers = useMemo(() => {
    const search = peopleSearch.toLowerCase();
    return Array.from(userMap.values())
      .filter((u) => u.status_uuid === STATUSES.active)
      .filter((u) => !subscribedUuids.has(u.id))
      .filter((u) => !search || displayName(u).toLowerCase().includes(search))
      .sort((a, b) => displayName(a).localeCompare(displayName(b)));
  }, [userMap, subscribedUuids, peopleSearch]);

  const postSystemMessage = useCallback(
    async (text: string) => {
      if (!userUuid) return;
      await sendTaskMessage({ taskId, userUuid, body: text, isSystem: true });
    },
    [taskId, userUuid],
  );

  const handleSend = useCallback(async () => {
    if (!body.trim() || !userUuid || !taskId) return;
    setSending(true);
    stopTyping();
    const trimmedBody = body.trim();
    try {
      await sendTaskMessage({ taskId, userUuid, body: trimmedBody });
      setBody("");

      // Fire-and-forget email notification to all other subscribers
      const recipientUuids = subscriptions
        .map((s) => s.user_uuid)
        .filter((uuid) => uuid && uuid !== userUuid);
      if (recipientUuids.length > 0) {
        fetch("/api/roadmap/task-message-notify", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            taskId,
            senderUserUuid: userUuid,
            senderName: displayName(userMap.get(userUuid)),
            messageBody: trimmedBody,
          }),
        }).catch(() => {});
      }
    } catch (err: any) {
      createErrorToast(["Send failed", err.message ?? String(err)]);
    } finally {
      setSending(false);
    }
  }, [body, userUuid, taskId, stopTyping, subscriptions, userMap]);

  const handleToggleSubscribe = useCallback(async () => {
    if (!taskId || !userUuid) return;
    setSubLoading(true);
    try {
      if (isSubscribed) {
        await unsubscribeFromTask(taskId, userUuid);
        await postSystemMessage(`${displayName(userMap.get(userUuid))} left the chat.`);
        createSuccessToast(["Unsubscribed from task updates"]);
      } else {
        await subscribeToTask(taskId, userUuid);
        createSuccessToast(["Subscribed to task updates"]);
      }
    } catch (err: any) {
      createErrorToast(["Failed", err.message ?? String(err)]);
    } finally {
      setSubLoading(false);
    }
  }, [taskId, userUuid, isSubscribed, userMap, postSystemMessage]);

  const handleAddPerson = useCallback(
    async (targetUuid: string) => {
      setAddingPeople(false);
      setPeopleSearch("");
      try {
        await subscribeToTask(taskId, targetUuid);
        const actor = displayName(userMap.get(userUuid ?? ""));
        const target = displayName(userMap.get(targetUuid));
        await postSystemMessage(`${actor} added ${target} to the conversation.`);
      } catch (err: any) {
        createErrorToast(["Failed to add person", err.message ?? String(err)]);
      }
    },
    [taskId, userUuid, userMap, postSystemMessage],
  );

  const handleRemovePerson = useCallback(
    async (targetUuid: string) => {
      try {
        await unsubscribeFromTask(taskId, targetUuid);
        const actor = displayName(userMap.get(userUuid ?? ""));
        const target = displayName(userMap.get(targetUuid));
        await postSystemMessage(`${actor} removed ${target} from the chat.`);
      } catch (err: any) {
        createErrorToast(["Failed to remove", err.message ?? String(err)]);
      }
    },
    [taskId, userUuid, userMap, postSystemMessage],
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
    },
    [handleSend],
  );

  const typingNames = useMemo(
    () => typingUserUuids.map((uuid) => displayName(userMap.get(uuid))).filter(Boolean),
    [typingUserUuids, userMap],
  );

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Header */}
      <div className="flex items-center justify-between mb-2 flex-shrink-0">
        <span className="text-sm font-medium text-gray-700">Discussion</span>
        <div className="flex items-center gap-2">
          {subscriptions.length > 0 && (
            <div className="flex items-center -space-x-1.5">
              {subscriptions.map((sub) => {
                const user = userMap.get(sub.user_uuid ?? "");
                const isCurrentUser = sub.user_uuid === userUuid;
                const canRemove = isAdmin && !isCurrentUser;
                return (
                  <div key={sub.id} className="relative group flex-shrink-0">
                    <div
                      className="size-6 rounded-full flex items-center justify-center text-[10px] font-medium text-white ring-2 ring-white"
                      style={{ backgroundColor: isCurrentUser ? "#4a90d9" : "#6b7280" }}
                    >
                      {initials(user)}
                    </div>
                    {/* Name tooltip */}
                    <div className="absolute top-full left-1/2 -translate-x-1/2 mt-1.5 px-2 py-1 rounded bg-gray-800 text-white text-[11px] whitespace-nowrap pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity duration-75 z-50">
                      {displayName(user) ?? "Unknown"}
                      <div className="absolute bottom-full left-1/2 -translate-x-1/2 border-4 border-transparent border-b-gray-800" />
                    </div>
                    {/* Admin remove button */}
                    {canRemove && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleRemovePerson(sub.user_uuid!);
                        }}
                        className="absolute -top-1 -right-1 size-3.5 rounded-full bg-red-500 text-white hidden group-hover:flex items-center justify-center z-10"
                        title={`Remove ${displayName(user)}`}
                      >
                        <X className="size-2.5" />
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* Add People button */}
          <div className="relative" ref={addPeopleRef}>
            <button
              type="button"
              onClick={() => setAddingPeople((v) => !v)}
              className="px-2 py-1 rounded border text-xs flex items-center gap-1 cursor-pointer border-gray-300 hover:bg-gray-50"
              title="Add people to conversation"
            >
              <UserPlus className="size-3" />
              Add
            </button>
            {addingPeople && (
              <div className="absolute right-0 top-full mt-1 w-56 bg-white border rounded shadow-lg z-50">
                <div className="p-2 border-b">
                  <input
                    autoFocus
                    type="text"
                    placeholder="Search people…"
                    value={peopleSearch}
                    onChange={(e) => setPeopleSearch(e.target.value)}
                    className="w-full px-2 py-1 text-xs border rounded focus:outline-none focus:ring-1 focus:ring-blue-400"
                  />
                </div>
                <ul className="max-h-48 overflow-y-auto py-1">
                  {addableUsers.length === 0 ? (
                    <li className="px-3 py-2 text-xs text-gray-400 italic">
                      {peopleSearch ? "No matches" : "Everyone is already in this conversation."}
                    </li>
                  ) : (
                    addableUsers.map((u) => (
                      <li key={u.id}>
                        <button
                          type="button"
                          onClick={() => handleAddPerson(u.id)}
                          className="w-full text-left px-3 py-1.5 text-xs hover:bg-gray-50 flex items-center gap-2"
                        >
                          <span className="size-5 rounded-full bg-gray-300 flex items-center justify-center text-[9px] font-semibold text-gray-700 flex-shrink-0">
                            {initials(u)}
                          </span>
                          {displayName(u)}
                        </button>
                      </li>
                    ))
                  )}
                </ul>
              </div>
            )}
          </div>

          <button
            type="button"
            onClick={handleToggleSubscribe}
            disabled={subLoading}
            className={`px-2 py-1 rounded border text-xs flex items-center gap-1 cursor-pointer ${
              isSubscribed
                ? "border-greenAccent bg-green-50 text-green-700 hover:bg-green-100"
                : "border-gray-300 hover:bg-gray-50"
            }`}
          >
            {isSubscribed ? (
              <>
                <BellOff className="size-3" />
                Unsubscribe
              </>
            ) : (
              <>
                <Bell className="size-3" />
                Subscribe
              </>
            )}
          </button>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto border rounded mb-2 p-3 space-y-3 bg-white min-h-0">
        {messages.length === 0 ? (
          <p className="text-sm text-gray-400 italic text-center py-6">
            No messages yet. Start the conversation.
          </p>
        ) : (
          messages.map((msg) => {
            // System event — render as centred italic line
            if (msg.is_system) {
              return (
                <div key={msg.id} className="flex justify-center py-0.5">
                  <span className="text-[11px] text-gray-400 italic">{msg.body}</span>
                </div>
              );
            }

            const isMe = msg.user_uuid === userUuid;
            const user = userMap.get(msg.user_uuid);
            const readers = receiptsByMessage.get(msg.id) ?? [];
            const readByOthers = readers.filter((uuid) => uuid !== msg.user_uuid);

            return (
              <div key={msg.id} className={`flex gap-2 ${isMe ? "flex-row-reverse" : "flex-row"}`}>
                {/* Avatar */}
                <div
                  className="size-7 rounded-full flex items-center justify-center text-xs font-medium text-white flex-shrink-0"
                  style={{ backgroundColor: isMe ? "#4a90d9" : "#6b7280" }}
                >
                  {initials(user)}
                </div>

                {/* Bubble */}
                <div className={`max-w-[80%] ${isMe ? "items-end" : "items-start"}`}>
                  <div
                    className={`flex items-baseline gap-2 mb-0.5 ${isMe ? "flex-row-reverse" : ""}`}
                  >
                    <span className="text-xs font-medium text-gray-700">
                      {isMe ? "You" : displayName(user)}
                    </span>
                    <span className="text-[10px] text-gray-400">
                      {new Date(msg.created_at).toLocaleTimeString(undefined, {
                        hour: "numeric",
                        minute: "2-digit",
                      })}
                    </span>
                  </div>
                  <div
                    className={`px-3 py-2 rounded-lg text-sm whitespace-pre-wrap ${
                      isMe
                        ? "bg-blue-100 text-gray-900 rounded-tr-none"
                        : "bg-gray-100 text-gray-900 rounded-tl-none"
                    }`}
                  >
                    {msg.body}
                  </div>
                  {isMe && (
                    <div className={`flex items-center gap-1 mt-0.5 ${isMe ? "justify-end" : ""}`}>
                      {readByOthers.length > 0 ? (
                        <span className="text-[10px] text-blue-500 flex items-center gap-0.5">
                          <CheckCheck className="size-3" />
                          Read by {readByOthers.length}
                        </span>
                      ) : (
                        <span className="text-[10px] text-gray-400 flex items-center gap-0.5">
                          <Check className="size-3" />
                          Sent
                        </span>
                      )}
                    </div>
                  )}
                </div>
              </div>
            );
          })
        )}

        {/* Typing indicator */}
        {typingNames.length > 0 && (
          <div className="flex items-center gap-2 text-xs text-gray-500 italic">
            <div className="flex gap-0.5">
              <span
                className="animate-bounce size-1.5 rounded-full bg-gray-400"
                style={{ animationDelay: "0ms" }}
              />
              <span
                className="animate-bounce size-1.5 rounded-full bg-gray-400"
                style={{ animationDelay: "150ms" }}
              />
              <span
                className="animate-bounce size-1.5 rounded-full bg-gray-400"
                style={{ animationDelay: "300ms" }}
              />
            </div>
            {typingNames.join(", ")} {typingNames.length === 1 ? "is" : "are"} typing…
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* Compose */}
      <div className="flex gap-2 mb-2 flex-shrink-0">
        <textarea
          value={body}
          onChange={(e) => {
            setBody(e.target.value);
            emitTyping();
          }}
          onKeyDown={handleKeyDown}
          placeholder="Type a message… (Enter to send, Shift+Enter for new line)"
          rows={2}
          className="flex-1 px-3 py-2 border rounded text-sm resize-none focus:outline-none focus:ring-2 focus:ring-greenAccent"
        />
        <PrimaryButton onClick={handleSend} loading={sending} disabled={!body.trim()}>
          <Send className="size-4" />
        </PrimaryButton>
      </div>
    </div>
  );
}
