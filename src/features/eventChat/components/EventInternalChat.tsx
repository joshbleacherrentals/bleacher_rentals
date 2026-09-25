"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Check, CheckCheck, UserPlus, X, ExternalLink } from "lucide-react";
import { createErrorToast } from "@/components/toasts/ErrorToast";
import { createSuccessToast } from "@/components/toasts/SuccessToast";
import { displayName, initials, useRoadmapUsers } from "@/app/roadmap/_lib/hooks/useRoadmapUsers";
import { usePermissionsStore } from "@/features/userAccess/state/usePermissionsStore";
import { sendEventMessage, updateEventMessage } from "../db/messages";
import { markEventMessagesRead } from "../db/readReceipts";
import { leaveEventChat, markEventConversationUnread } from "../db/conversationActions";
import { subscribeToEvent } from "../db/subscriptions";
import { useEventMessages } from "../hooks/useEventMessages";
import { useEventReadReceipts, type EventReadReceipt } from "../hooks/useReadReceipts";
import { useEventTypingEmitter, useEventTypingIndicators } from "../hooks/useTypingIndicators";
import { useEventChatMemberAccess } from "../hooks/useEventChatMemberAccess";
import { useMentionableChatMembers } from "../hooks/useMentionableChatMembers";
import { useEventMessageMentions } from "../hooks/useEventMessageMentions";
import { parseMentionedUserIds } from "../utils/mentions";
import { truncateReplyPreview, type EventChatReplyTarget } from "../utils/replyPreview";
import {
  countUnreadMessages,
  findFirstUnreadMessageId,
  isContainerNearBottom,
  scrollContainerToBottom,
  scrollContainerToElement,
  shouldShowNewMessagesDivider,
} from "../utils/unreadMessages";
import { EventMessageContextMenu } from "./EventMessageContextMenu";
import { EventMessageReadReceiptsDialog } from "./EventMessageReadReceiptsDialog";
import { EventChatMembersModal } from "./EventChatMembersModal";
import { EventChatMenuDropdown } from "./EventChatMenuDropdown";
import { EventChatComposer } from "./EventChatComposer";
import { EventChatReplyPreview } from "./EventChatReplyPreview";
import { EventMessageBody } from "./EventMessageBody";
import { EventMessageReplyQuote, replyQuotePreview } from "./EventMessageReplyQuote";
import { NewMessagesDivider } from "./NewMessagesDivider";
import { ScrollToBottomButton } from "./ScrollToBottomButton";

import { cn } from "@/lib/utils";

type Props = {
  eventUuid: string;
  className?: string;
  /** Close + menu actions for /messages/internal/[eventId] only. */
  showConversationActions?: boolean;
};

export function EventInternalChat({
  eventUuid,
  className,
  showConversationActions = false,
}: Props) {
  const router = useRouter();
  const { messages, isLoading: messagesLoading } = useEventMessages(eventUuid);
  const {
    receiptsByMessage,
    receiptDetailsByMessage,
    isLoading: receiptsLoading,
  } = useEventReadReceipts(eventUuid);
  const { userMap } = useRoadmapUsers();
  const userUuid = usePermissionsStore((s) => s.userId);
  const { canManageMembers, canWrite, isSubscribed } = useEventChatMemberAccess(eventUuid);
  const { members: mentionableMembers } = useMentionableChatMembers(eventUuid, userUuid);
  const { mentionsByMessage } = useEventMessageMentions(eventUuid);
  const { typingUserUuids } = useEventTypingIndicators(eventUuid, userUuid);
  const { emitTyping, stopTyping } = useEventTypingEmitter(eventUuid, userUuid);

  // The owner's subscription is created and kept by `events_auto_subscribe_owner`
  // (20260709120000), on insert, on owner change, and by that migration's
  // backfill. Re-asserting it from the client raced the trigger into a 23505 the
  // connector treats as fatal, and it also quietly undid "leave chat" for the
  // one person most likely to want it. An owner who left rejoins with the Join
  // button like anyone else.

  const [membersOpen, setMembersOpen] = useState(false);
  const [readReceiptsDialog, setReadReceiptsDialog] = useState<EventReadReceipt[] | null>(null);
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
  const [editBody, setEditBody] = useState("");
  const [replyTarget, setReplyTarget] = useState<EventChatReplyTarget | null>(null);
  const [highlightedMessageId, setHighlightedMessageId] = useState<string | null>(null);
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);
  const [savingEdit, setSavingEdit] = useState(false);
  const [joining, setJoining] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [markingUnread, setMarkingUnread] = useState(false);

  const highlightTimeoutRef = useRef<number | null>(null);

  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const prevCountRef = useRef(0);
  const initialScrollDoneRef = useRef(false);
  const [initialScrollDone, setInitialScrollDone] = useState(false);
  const markReadScheduledRef = useRef(false);
  const initialMessageCountRef = useRef<number | null>(null);

  const [isNearBottom, setIsNearBottom] = useState(true);
  const wasNearBottomRef = useRef(true);

  // Frozen on open — keeps divider visible for this session even after mark-as-read.
  const [openUnreadUi, setOpenUnreadUi] = useState<{
    anchorId: string | null;
    showDivider: boolean;
  } | null>(null);

  useEffect(() => {
    setOpenUnreadUi(null);
    initialScrollDoneRef.current = false;
    setInitialScrollDone(false);
    markReadScheduledRef.current = false;
    initialMessageCountRef.current = null;
    prevCountRef.current = 0;
    setIsNearBottom(true);
    wasNearBottomRef.current = true;
    setReadReceiptsDialog(null);
    setEditingMessageId(null);
    setEditBody("");
    setReplyTarget(null);
    setHighlightedMessageId(null);
    if (highlightTimeoutRef.current !== null) {
      window.clearTimeout(highlightTimeoutRef.current);
      highlightTimeoutRef.current = null;
    }
  }, [eventUuid]);

  useEffect(() => {
    return () => {
      if (highlightTimeoutRef.current !== null) {
        window.clearTimeout(highlightTimeoutRef.current);
      }
    };
  }, []);

  const unreadCount = useMemo(
    () => countUnreadMessages(messages, userUuid, receiptsByMessage),
    [messages, receiptsByMessage, userUuid],
  );

  const showScrollToBottomButton = initialScrollDone && !isNearBottom;

  const messagesById = useMemo(
    () => new Map(messages.map((message) => [message.id, message])),
    [messages],
  );

  const unreadAnchorId = openUnreadUi?.anchorId ?? null;
  const showDividerBefore = openUnreadUi?.showDivider ?? false;

  const scrollToInitialPosition = useCallback(() => {
    const container = scrollContainerRef.current;
    if (!container) return false;

    if (unreadAnchorId) {
      const divider = container.querySelector<HTMLElement>("[data-new-messages-divider]");
      if (divider) {
        scrollContainerToElement(container, divider);
        return true;
      }

      const messageEl = container.querySelector<HTMLElement>(`#event-msg-${unreadAnchorId}`);
      if (messageEl) {
        scrollContainerToElement(container, messageEl);
        return true;
      }
    }

    container.scrollTo({ top: container.scrollHeight, behavior: "instant" });
    return true;
  }, [unreadAnchorId]);

  // Pass 1: snapshot unread anchor after queries settle. Pass 2: scroll once divider is in DOM.
  useLayoutEffect(() => {
    if (initialScrollDoneRef.current) return;
    if (messagesLoading || receiptsLoading || !userUuid || messages.length === 0) return;

    if (openUnreadUi === null) {
      const anchorId = findFirstUnreadMessageId(messages, userUuid, receiptsByMessage);
      setOpenUnreadUi({
        anchorId,
        showDivider: shouldShowNewMessagesDivider(messages, anchorId),
      });
      return;
    }

    const runScroll = () => {
      if (initialScrollDoneRef.current) return;
      if (!scrollToInitialPosition()) return;

      initialScrollDoneRef.current = true;
      setInitialScrollDone(true);

      if (!markReadScheduledRef.current) {
        markReadScheduledRef.current = true;
        initialMessageCountRef.current = messages.length;
        window.setTimeout(() => {
          if (eventUuid && userUuid) void markEventMessagesRead(eventUuid, userUuid);
        }, 400);
      }
    };

    runScroll();
    const retry = window.setTimeout(runScroll, 100);
    return () => window.clearTimeout(retry);
  }, [
    eventUuid,
    messages,
    messages.length,
    messagesLoading,
    openUnreadUi,
    receiptsByMessage,
    receiptsLoading,
    scrollToInitialPosition,
    userUuid,
    unreadAnchorId,
  ]);

  // Track scroll position — auto-scroll only when pinned to bottom.
  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;

    const updateNearBottom = () => {
      const near = isContainerNearBottom(container);
      const becameNearBottom = near && !wasNearBottomRef.current;
      wasNearBottomRef.current = near;
      setIsNearBottom(near);

      if (becameNearBottom && initialScrollDoneRef.current && eventUuid && userUuid) {
        void markEventMessagesRead(eventUuid, userUuid);
      }
    };

    updateNearBottom();
    container.addEventListener("scroll", updateNearBottom, { passive: true });
    return () => container.removeEventListener("scroll", updateNearBottom);
  }, [eventUuid, messages.length, openUnreadUi, userUuid]);

  const handleScrollToBottom = useCallback(() => {
    const container = scrollContainerRef.current;
    if (!container) return;

    scrollContainerToBottom(container);
    setIsNearBottom(true);
    if (eventUuid && userUuid) void markEventMessagesRead(eventUuid, userUuid);
  }, [eventUuid, userUuid]);

  // New messages: auto-scroll + mark read only when already at the bottom.
  useEffect(() => {
    if (!initialScrollDoneRef.current) return;

    const container = scrollContainerRef.current;
    if (!container) return;

    if (messages.length > prevCountRef.current && isNearBottom) {
      scrollContainerToBottom(container);
      if (eventUuid && userUuid) void markEventMessagesRead(eventUuid, userUuid);
    }

    prevCountRef.current = messages.length;
  }, [eventUuid, isNearBottom, messages.length, userUuid]);

  const typingNames = typingUserUuids.map((uuid) => displayName(userMap.get(uuid))).filter(Boolean);

  const handleSend = useCallback(async () => {
    if (!body.trim() || !userUuid || !canWrite || sending) return;
    setSending(true);
    stopTyping();
    try {
      const trimmedBody = body.trim();
      const mentionedUserUuids = parseMentionedUserIds(trimmedBody, mentionableMembers);
      await sendEventMessage({
        eventUuid,
        userUuid,
        body: trimmedBody,
        mentionedUserUuids,
        replyToMessageId: replyTarget?.messageId ?? null,
      });
      setBody("");
      setReplyTarget(null);
      requestAnimationFrame(() => {
        const container = scrollContainerRef.current;
        if (container) scrollContainerToBottom(container);
      });

      // Fire-and-forget email notification for @mentioned users only.
      if (mentionedUserUuids.length > 0) {
        fetch("/api/events/event-message-mention-notify", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            eventUuid,
            senderUserUuid: userUuid,
            senderName: displayName(userMap.get(userUuid)),
            messageBody: trimmedBody,
            mentionedUserUuids,
          }),
        }).catch(() => {});
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      createErrorToast(["Send failed", message]);
    } finally {
      setSending(false);
    }
  }, [
    body,
    canWrite,
    eventUuid,
    mentionableMembers,
    replyTarget,
    sending,
    stopTyping,
    userMap,
    userUuid,
  ]);

  const jumpToMessage = useCallback((messageId: string) => {
    const container = scrollContainerRef.current;
    if (!container) return;

    const el = container.querySelector<HTMLElement>(`#event-msg-${messageId}`);
    if (!el) return;

    scrollContainerToElement(container, el, { smooth: true, offsetPx: 12 });
    setHighlightedMessageId(messageId);

    if (highlightTimeoutRef.current !== null) {
      window.clearTimeout(highlightTimeoutRef.current);
    }
    highlightTimeoutRef.current = window.setTimeout(() => {
      setHighlightedMessageId(null);
      highlightTimeoutRef.current = null;
    }, 1000);
  }, []);

  const cancelEdit = useCallback(() => {
    setEditingMessageId(null);
    setEditBody("");
  }, []);

  const startEdit = useCallback((messageId: string, messageBody: string) => {
    setReplyTarget(null);
    setEditingMessageId(messageId);
    setEditBody(messageBody);
  }, []);

  const startReply = useCallback(
    (messageId: string, authorUuid: string, messageBody: string) => {
      cancelEdit();
      setReplyTarget({
        messageId,
        authorName: authorUuid === userUuid ? "You" : displayName(userMap.get(authorUuid)),
        bodyPreview: truncateReplyPreview(messageBody),
      });
    },
    [cancelEdit, userMap, userUuid],
  );

  const handleSaveEdit = useCallback(async () => {
    if (!editingMessageId || !editBody.trim() || !userUuid || !canWrite) return;

    setSavingEdit(true);
    stopTyping();
    try {
      const trimmedBody = editBody.trim();
      const previousMentions = mentionsByMessage.get(editingMessageId) ?? [];
      const mentionedUserUuids = parseMentionedUserIds(trimmedBody, mentionableMembers);

      await updateEventMessage({
        messageId: editingMessageId,
        body: trimmedBody,
        mentionedUserUuids,
      });

      const newlyMentioned = mentionedUserUuids.filter(
        (uuid) => uuid !== userUuid && !previousMentions.includes(uuid),
      );
      if (newlyMentioned.length > 0) {
        fetch("/api/events/event-message-mention-notify", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            eventUuid,
            senderUserUuid: userUuid,
            senderName: displayName(userMap.get(userUuid)),
            messageBody: trimmedBody,
            mentionedUserUuids: newlyMentioned,
          }),
        }).catch(() => {});
      }

      cancelEdit();
      createSuccessToast(["Message updated."]);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      createErrorToast(["Edit failed", message]);
    } finally {
      setSavingEdit(false);
    }
  }, [
    cancelEdit,
    canWrite,
    editBody,
    editingMessageId,
    eventUuid,
    mentionableMembers,
    mentionsByMessage,
    stopTyping,
    userMap,
    userUuid,
  ]);

  const handleMarkUnread = useCallback(async () => {
    if (!userUuid || markingUnread) return;

    setMarkingUnread(true);
    try {
      await markEventConversationUnread(eventUuid, userUuid);
      createSuccessToast(["Chat marked as unread."]);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      createErrorToast(["Failed to mark chat as unread", message]);
    } finally {
      setMarkingUnread(false);
    }
  }, [eventUuid, markingUnread, userUuid]);

  const handleJoinChat = useCallback(async () => {
    if (!userUuid || joining) return;

    setJoining(true);
    try {
      await subscribeToEvent(eventUuid, userUuid);
      await sendEventMessage({
        eventUuid,
        userUuid,
        body: `${displayName(userMap.get(userUuid))} joined the chat.`,
        isSystem: true,
      });
      createSuccessToast(["You joined the chat."]);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      createErrorToast(["Failed to join chat", message]);
    } finally {
      setJoining(false);
    }
  }, [eventUuid, joining, userMap, userUuid]);

  const handleLeaveChat = useCallback(async () => {
    if (!userUuid || leaving || !isSubscribed) return;

    setLeaving(true);
    try {
      await leaveEventChat(eventUuid, userUuid, displayName(userMap.get(userUuid)));
      createSuccessToast(["You left the chat."]);
      setMembersOpen(false);
      if (showConversationActions) {
        router.push("/messages/internal");
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      createErrorToast(["Failed to leave chat", message]);
    } finally {
      setLeaving(false);
    }
  }, [eventUuid, isSubscribed, leaving, router, showConversationActions, userMap, userUuid]);

  return (
    <div
      className={cn(
        "flex flex-col h-[520px] min-h-0 border rounded-lg overflow-hidden bg-white",
        className,
      )}
    >
      <div className="px-4 py-3 border-b bg-gray-50 flex-shrink-0 flex items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-gray-800">Internal discussion</h3>
          <p className="text-xs text-gray-500 mt-0.5">
            Team-only chat for this event. Not visible to clients.
          </p>
        </div>
        <div className="flex items-center gap-1.5 flex-shrink-0">
          {showConversationActions && (
            <Link
              href={`/quotes-bookings/${eventUuid}`}
              className="p-2 rounded-md border border-gray-300 bg-white text-gray-600 hover:bg-gray-100 hover:text-gray-900 transition cursor-pointer"
              title="Open quote"
              aria-label="Open quote"
            >
              <ExternalLink className="size-4" />
            </Link>
          )}
          {isSubscribed ? (
            <EventChatMenuDropdown
              canManageMembers={canManageMembers}
              onChatMembers={() => setMembersOpen(true)}
              onLeaveChat={() => void handleLeaveChat()}
              onMarkUnread={() => void handleMarkUnread()}
              leaveDisabled={leaving}
              markUnreadDisabled={markingUnread}
            />
          ) : (
            <button
              type="button"
              onClick={() => void handleJoinChat()}
              disabled={joining}
              className="px-3 py-1.5 rounded-md border border-gray-300 bg-white text-sm font-medium text-gray-700 hover:bg-gray-100 hover:text-gray-900 transition cursor-pointer disabled:opacity-50 flex items-center gap-1.5"
            >
              <UserPlus className="size-4" />
              {joining ? "Joining…" : "Join chat"}
            </button>
          )}
          {showConversationActions && (
            <button
              type="button"
              onClick={() => router.push("/messages/internal")}
              className="p-2 rounded-md border border-gray-300 bg-white text-gray-600 hover:bg-gray-100 hover:text-gray-900 transition cursor-pointer"
              title="Close chat"
              aria-label="Close chat"
            >
              <X className="size-4" />
            </button>
          )}
        </div>
      </div>

      <div className="relative flex-1 min-h-0">
        <div ref={scrollContainerRef} className="absolute inset-0 overflow-y-auto p-4 space-y-3">
          {messages.length === 0 ? (
            <p className="text-sm text-gray-400 italic text-center py-8">
              No messages yet. Start the conversation.
            </p>
          ) : (
            messages.map((msg) => {
              const isUnreadAnchor = msg.id === unreadAnchorId;
              const showDivider = isUnreadAnchor && showDividerBefore;

              if (msg.is_system) {
                return (
                  <div key={msg.id}>
                    {showDivider && <NewMessagesDivider />}
                    <div className="flex justify-center py-0.5">
                      <span className="text-[11px] text-gray-400 italic">{msg.body}</span>
                    </div>
                  </div>
                );
              }

              const isMe = msg.user_uuid === userUuid;
              const user = userMap.get(msg.user_uuid);
              const readers = receiptsByMessage.get(msg.id) ?? [];
              const readByOthers = readers.filter((uuid) => uuid !== msg.user_uuid);
              const readReceipts = (receiptDetailsByMessage.get(msg.id) ?? []).filter(
                (r) => r.userUuid !== msg.user_uuid,
              );
              const mentionsMe =
                Boolean(userUuid) && (mentionsByMessage.get(msg.id)?.includes(userUuid!) ?? false);
              const iHaveRead = Boolean(userUuid && readers.includes(userUuid));
              const showMentionHighlight = mentionsMe && !isMe && !iHaveRead;
              const isHighlighted = highlightedMessageId === msg.id;
              const parentMessage = msg.reply_to_message_id
                ? messagesById.get(msg.reply_to_message_id)
                : undefined;

              return (
                <div key={msg.id} id={`event-msg-${msg.id}`}>
                  {showDivider && <NewMessagesDivider />}
                  <div className={`flex gap-2 ${isMe ? "flex-row-reverse" : "flex-row"}`}>
                    <div
                      className="size-7 rounded-full flex items-center justify-center text-xs font-medium text-white flex-shrink-0"
                      style={{ backgroundColor: isMe ? "#4a90d9" : "#6b7280" }}
                    >
                      {initials(user)}
                    </div>

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
                        {msg.edited_at && (
                          <span className="text-[10px] text-gray-400 italic">edited</span>
                        )}
                      </div>
                      <EventMessageContextMenu
                        isOwnMessage={isMe}
                        messageBody={msg.body}
                        onReply={() => startReply(msg.id, msg.user_uuid, msg.body)}
                        onEdit={isMe ? () => startEdit(msg.id, msg.body) : undefined}
                        onViewReadReceipts={
                          isMe ? () => setReadReceiptsDialog(readReceipts) : undefined
                        }
                      >
                        <div
                          className={`px-3 py-2 rounded-lg text-sm whitespace-pre-wrap cursor-default ${
                            editingMessageId === msg.id ? "ring-2 ring-blue-400" : ""
                          } ${
                            isHighlighted
                              ? "ring-2 ring-amber-400 transition-shadow duration-300"
                              : ""
                          } ${
                            isMe
                              ? "bg-blue-100 text-gray-900 rounded-tr-none"
                              : showMentionHighlight
                                ? "bg-amber-50 text-gray-900 rounded-tl-none ring-2 ring-amber-300"
                                : "bg-gray-100 text-gray-900 rounded-tl-none"
                          }`}
                        >
                          {msg.reply_to_message_id && (
                            <EventMessageReplyQuote
                              authorName={
                                parentMessage
                                  ? parentMessage.user_uuid === userUuid
                                    ? "You"
                                    : displayName(userMap.get(parentMessage.user_uuid))
                                  : "Deleted message"
                              }
                              bodyPreview={
                                parentMessage ? replyQuotePreview(parentMessage.body) : ""
                              }
                              isOwnBubble={isMe}
                              onJump={() => {
                                if (msg.reply_to_message_id) {
                                  jumpToMessage(msg.reply_to_message_id);
                                }
                              }}
                            />
                          )}
                          <EventMessageBody
                            body={msg.body}
                            members={mentionableMembers}
                            currentUserUuid={userUuid}
                          />
                        </div>
                      </EventMessageContextMenu>
                      {isMe && (
                        <div className="flex items-center gap-1 mt-0.5 justify-end">
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
                </div>
              );
            })
          )}

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

        {showScrollToBottomButton && (
          <ScrollToBottomButton unreadCount={unreadCount} onClick={handleScrollToBottom} />
        )}
      </div>

      {canWrite && editingMessageId ? (
        <EventChatComposer
          editing
          eventUuid={eventUuid}
          userUuid={userUuid}
          value={editBody}
          onChange={setEditBody}
          onSend={() => void handleSaveEdit()}
          onCancelEdit={cancelEdit}
          onTyping={emitTyping}
          sending={savingEdit}
        />
      ) : canWrite ? (
        <>
          {replyTarget && (
            <EventChatReplyPreview
              authorName={replyTarget.authorName}
              bodyPreview={replyTarget.bodyPreview}
              onCancel={() => setReplyTarget(null)}
            />
          )}
          <EventChatComposer
            eventUuid={eventUuid}
            userUuid={userUuid}
            value={body}
            onChange={setBody}
            onSend={() => void handleSend()}
            onTyping={emitTyping}
            sending={sending}
          />
        </>
      ) : (
        <div className="px-4 py-3 border-t bg-gray-50 text-xs text-gray-500 text-center flex-shrink-0">
          Join the chat to send messages.
        </div>
      )}

      {canManageMembers && (
        <EventChatMembersModal
          eventUuid={eventUuid}
          open={membersOpen}
          onOpenChange={setMembersOpen}
        />
      )}

      <EventMessageReadReceiptsDialog
        open={readReceiptsDialog !== null}
        onOpenChange={(open) => {
          if (!open) setReadReceiptsDialog(null);
        }}
        readers={readReceiptsDialog ?? []}
      />
    </div>
  );
}
