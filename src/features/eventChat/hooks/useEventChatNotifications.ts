"use client";

import { useMemo } from "react";
import { db } from "@/components/providers/SystemProvider";
import { expect, useTypedQuery } from "@/lib/powersync/typedQuery";
import { usePermissionsStore } from "@/features/userAccess/state/usePermissionsStore";
import {
  buildChatNotificationsQueries,
  unreadChats,
  unreadMentionEventIds,
  type EventPart,
  type MentionPart,
  type MessagePart,
  type ReceiptPart,
  type SubscriptionPart,
  type UnreadChat,
} from "../utils/chatNotificationsData";

/** One row per event in the notifications modal (not per message). */
export type EventChatNotification = {
  eventUuid: string;
  eventName: string;
  latestMessageAt: string;
  /** True when an unread message @mentions the current user. */
  hasUnreadMention: boolean;
};

const NO_CHATS: UnreadChat[] = [];
const NO_EVENT_IDS: ReadonlySet<string> = new Set();

/**
 * Unread internal chat notifications for the current user.
 *
 * Rules:
 * - Only subscribed events (EventSubscriptions) can notify.
 * - One notification per chat, regardless of how many unread messages.
 * - Unread = message from someone else with no read receipt for this user.
 * - hasUnreadMention = an unread message that @mentions the user (EventMessageMentions).
 * - Clears reactively when the user opens the chat (markEventMessagesRead).
 *
 * Five small queries, one per table, and the rules in `chatNotificationsData.ts`, instead of two
 * queries with four and five JOINs: the JOINs re-ran on every commit to any of their tables, and
 * this hook is mounted in the Header on every page
 * (docs/specs/slow-local-db-step1-split-watchers.md).
 */
export function useEventChatNotifications() {
  const userUuid = usePermissionsStore((s) => s.userId);
  const safeUuid = userUuid ?? "__none__";

  const queries = useMemo(() => buildChatNotificationsQueries(db, safeUuid), [safeUuid]);

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

  const unreadRows = useMemo(
    () => (parts ? unreadChats(parts, safeUuid) : NO_CHATS),
    [parts, safeUuid],
  );
  const mentionEventIds = useMemo(
    () => (parts ? unreadMentionEventIds(parts, safeUuid) : NO_EVENT_IDS),
    [parts, safeUuid],
  );

  const notifications = useMemo<EventChatNotification[]>(() => {
    const items = unreadRows
      .filter((row) => row.eventUuid && row.latestMessageAt)
      .map((row) => ({
        eventUuid: row.eventUuid as string,
        eventName: row.eventName?.trim() || "Untitled event",
        latestMessageAt: row.latestMessageAt as string,
        hasUnreadMention: mentionEventIds.has(row.eventUuid as string),
      }));

    // @mention chats first, then most recent activity.
    return items.sort((a, b) => {
      if (a.hasUnreadMention !== b.hasUnreadMention) {
        return a.hasUnreadMention ? -1 : 1;
      }
      return b.latestMessageAt.localeCompare(a.latestMessageAt);
    });
  }, [mentionEventIds, unreadRows]);

  const unreadChatCount = notifications.length;
  const unreadMentionCount = notifications.filter((n) => n.hasUnreadMention).length;

  return { notifications, unreadChatCount, unreadMentionCount };
}
