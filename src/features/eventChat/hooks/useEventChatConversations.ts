"use client";

import { useMemo } from "react";
import { db } from "@/components/providers/SystemProvider";
import { expect, useTypedQuery } from "@/lib/powersync/typedQuery";
import { usePermissionsStore } from "@/features/userAccess/state/usePermissionsStore";
import {
  buildChatConversationsQueries,
  conversationRows,
  unreadEventIds,
  unreadMentionEventIds,
  type ConversationRow,
  type EventPart,
  type MentionPart,
  type MessagePart,
  type ReceiptPart,
  type SubscriptionPart,
} from "../utils/chatConversationsData";

export type EventChatConversation = {
  eventUuid: string;
  eventName: string;
  latestMessageAt: string;
  hasUnread: boolean;
  hasUnreadMention: boolean;
};

const NO_CONVERSATIONS: ConversationRow[] = [];
const NO_EVENT_IDS: ReadonlySet<string> = new Set();

/**
 * Subscribed event chats with at least one message — for /messages/internal sidebar.
 * Sorted: unread @mentions → other unread → read (by latest activity).
 *
 * Five small queries, one per table, and the rules in `chatConversationsData.ts`, instead of three
 * queries with up to five JOINs each (docs/specs/slow-local-db-step1-split-watchers.md).
 */
export function useEventChatConversations() {
  const userUuid = usePermissionsStore((s) => s.userId);
  const safeUuid = userUuid ?? "__none__";

  const queries = useMemo(() => buildChatConversationsQueries(db, safeUuid), [safeUuid]);

  const subscriptionsPart = useTypedQuery(queries.subscriptions, expect<SubscriptionPart>());
  const eventsPart = useTypedQuery(queries.events, expect<EventPart>());
  const messagesPart = useTypedQuery(queries.messages, expect<MessagePart>());
  const receiptsPart = useTypedQuery(queries.receipts, expect<ReceiptPart>());
  const mentionsPart = useTypedQuery(queries.mentions, expect<MentionPart>());

  // Nothing is returned until every part has loaded, and when any part fails, as while the old
  // queries loaded or failed: a half-loaded set is never read.
  const ready = [subscriptionsPart, eventsPart, messagesPart, receiptsPart, mentionsPart].every(
    (part) => !part.isLoading && !part.error,
  );
  const parts = useMemo(
    () =>
      ready
        ? {
            subscriptions: subscriptionsPart.data ?? [],
            events: eventsPart.data ?? [],
            messages: messagesPart.data ?? [],
            receipts: receiptsPart.data ?? [],
            mentions: mentionsPart.data ?? [],
          }
        : null,
    [
      ready,
      subscriptionsPart.data,
      eventsPart.data,
      messagesPart.data,
      receiptsPart.data,
      mentionsPart.data,
    ],
  );

  const rows = useMemo(
    () => (parts ? conversationRows(parts, safeUuid) : NO_CONVERSATIONS),
    [parts, safeUuid],
  );
  const unreadIds = useMemo(
    () => (parts ? unreadEventIds(parts, safeUuid) : NO_EVENT_IDS),
    [parts, safeUuid],
  );
  const mentionIds = useMemo(
    () => (parts ? unreadMentionEventIds(parts, safeUuid) : NO_EVENT_IDS),
    [parts, safeUuid],
  );

  const conversations = useMemo<EventChatConversation[]>(() => {
    const items = rows
      .filter((row) => row.eventUuid && row.latestMessageAt)
      .map((row) => ({
        eventUuid: row.eventUuid as string,
        eventName: row.eventName?.trim() || "Untitled event",
        latestMessageAt: row.latestMessageAt as string,
        hasUnread: unreadIds.has(row.eventUuid as string),
        hasUnreadMention: mentionIds.has(row.eventUuid as string),
      }));

    return items.sort((a, b) => {
      if (a.hasUnreadMention !== b.hasUnreadMention) {
        return a.hasUnreadMention ? -1 : 1;
      }
      if (a.hasUnread !== b.hasUnread) {
        return a.hasUnread ? -1 : 1;
      }
      return b.latestMessageAt.localeCompare(a.latestMessageAt);
    });
  }, [rows, unreadIds, mentionIds]);

  return { conversations };
}
