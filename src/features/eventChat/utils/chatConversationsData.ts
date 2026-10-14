import type { Kysely } from "kysely";
import type { PowerSyncDB } from "@/lib/powersync/AppSchema";

/**
 * The data behind `useEventChatConversations`, as five small queries and plain JS rules instead
 * of three queries with up to five JOINs each. Spec:
 * docs/specs/slow-local-db-step1-split-watchers.md.
 *
 * The rules below return what the three old queries returned (same rows, same NULL behaviour);
 * `chatConversationsData.differential.test.ts` checks that against the old SQL.
 *
 * This module never imports `SystemProvider`, so it runs in Node tests: the builder takes the
 * Kysely instance as a parameter. It is deliberately independent of the notifications hook's
 * module: each hook has its own copy of these rules and of the small queries, so that either
 * commit reverts alone.
 */

export type SubscriptionPart = {
  event_uuid: string | null;
  unread: number | null;
};

export type EventPart = {
  id: string;
  event_name: string | null;
  deleted: number | null;
};

export type MessagePart = {
  id: string;
  event_uuid: string | null;
  user_uuid: string | null;
  created_at: string | null;
};

export type ReceiptPart = {
  message_id: string | null;
};

export type MentionPart = {
  message_id: string | null;
};

export type ChatConversationsParts = {
  subscriptions: SubscriptionPart[];
  events: EventPart[];
  messages: MessagePart[];
  receipts: ReceiptPart[];
  mentions: MentionPart[];
};

/** One subscribed chat with at least one message, as the old conversations query returned it. */
export type ConversationRow = {
  eventUuid: string;
  eventName: string | null;
  /** NULL only when no message of the event has a `created_at`. */
  latestMessageAt: string | null;
};

/**
 * The five small queries for one user. Every one is bound to the user's id, directly or through
 * the subquery of the user's own subscriptions, so none of them reads another user's rows. There
 * is no JOIN: events and messages are selected with `where ... in (subquery)`.
 */
export function buildChatConversationsQueries(db: Kysely<PowerSyncDB>, userUuid: string) {
  /** The events the user is subscribed to. */
  const subscribedEvents = () =>
    db
      .selectFrom("EventSubscriptions as es")
      .select("es.event_uuid")
      .where("es.user_uuid", "=", userUuid);

  return {
    subscriptions: db
      .selectFrom("EventSubscriptions as es")
      .select(["es.event_uuid", "es.unread"])
      .where("es.user_uuid", "=", userUuid)
      .compile(),

    events: db
      .selectFrom("Events as e")
      .select(["e.id", "e.event_name", "e.deleted"])
      .where("e.id", "in", subscribedEvents())
      .compile(),

    messages: db
      .selectFrom("EventMessages as m")
      .select(["m.id", "m.event_uuid", "m.user_uuid", "m.created_at"])
      .where("m.event_uuid", "in", subscribedEvents())
      .compile(),

    receipts: db
      .selectFrom("EventMessageReadReceipts as rr")
      .select("rr.message_id")
      .where("rr.user_uuid", "=", userUuid)
      .compile(),

    mentions: db
      .selectFrom("EventMessageMentions as men")
      .select("men.message_id")
      .where("men.mentioned_user_uuid", "=", userUuid)
      .compile(),
  };
}

/**
 * `m.user_uuid != me` in the old SQL: NULL when the author is NULL, which is not true, so a
 * message with no author is never "from someone else".
 */
function isFromSomeoneElse(message: MessagePart, me: string): boolean {
  return message.user_uuid !== null && message.user_uuid !== me;
}

function messagesByEventOf(messages: MessagePart[]): Map<string, MessagePart[]> {
  const byEvent = new Map<string, MessagePart[]>();
  for (const message of messages) {
    if (message.event_uuid === null) continue;
    const list = byEvent.get(message.event_uuid);
    if (list) list.push(message);
    else byEvent.set(message.event_uuid, [message]);
  }
  return byEvent;
}

function receiptIdsOf(parts: ChatConversationsParts): Set<string> {
  const read = new Set<string>();
  for (const receipt of parts.receipts) {
    if (receipt.message_id !== null) read.add(receipt.message_id);
  }
  return read;
}

/**
 * The subscribed, non-deleted events that have at least one message. `latestMessageAt` is the
 * text maximum of `created_at` over all the event's messages (any author), ignoring NULL.
 *
 * Inner joins dropped a subscription with no event id or whose event is not synced locally, and
 * `e.deleted = 0` is false for a NULL flag; the same rows are dropped here.
 */
export function conversationRows(parts: ChatConversationsParts, me: string): ConversationRow[] {
  void me; // the parts are already the user's own; kept so the three rules share one signature
  const eventById = new Map(parts.events.map((event) => [event.id, event]));
  const messagesByEvent = messagesByEventOf(parts.messages);
  const rows = new Map<string, ConversationRow>();

  for (const subscription of parts.subscriptions) {
    if (subscription.event_uuid === null) continue;
    const event = eventById.get(subscription.event_uuid);
    if (!event || event.deleted !== 0) continue;

    for (const message of messagesByEvent.get(subscription.event_uuid) ?? []) {
      let row = rows.get(subscription.event_uuid);
      if (!row) {
        row = {
          eventUuid: subscription.event_uuid,
          eventName: event.event_name,
          latestMessageAt: null,
        };
        rows.set(subscription.event_uuid, row);
      }
      if (
        message.created_at !== null &&
        (row.latestMessageAt === null || message.created_at > row.latestMessageAt)
      ) {
        row.latestMessageAt = message.created_at;
      }
    }
  }

  return [...rows.values()];
}

/**
 * The events with something unread: among the messages of a subscribed, non-deleted event, one is
 * from someone else without a receipt of mine, or the subscription is flagged unread (then any
 * message of the event is enough). An event with no messages is never returned.
 */
export function unreadEventIds(parts: ChatConversationsParts, me: string): Set<string> {
  const eventById = new Map(parts.events.map((event) => [event.id, event]));
  const messagesByEvent = messagesByEventOf(parts.messages);
  const read = receiptIdsOf(parts);
  const eventIds = new Set<string>();

  for (const subscription of parts.subscriptions) {
    if (subscription.event_uuid === null) continue;
    const event = eventById.get(subscription.event_uuid);
    if (!event || event.deleted !== 0) continue;

    for (const message of messagesByEvent.get(subscription.event_uuid) ?? []) {
      const unread = isFromSomeoneElse(message, me) && !read.has(message.id);
      if (unread || subscription.unread === 1) {
        eventIds.add(subscription.event_uuid);
        break;
      }
    }
  }
  return eventIds;
}

/**
 * The events with an unread message that mentions me: the mentioned message is from someone else,
 * has no receipt of mine, and sits in a non-deleted event I am subscribed to. A mention whose
 * message is not synced is dropped, as the inner join dropped it.
 */
export function unreadMentionEventIds(parts: ChatConversationsParts, me: string): Set<string> {
  const eventById = new Map(parts.events.map((event) => [event.id, event]));
  const messageById = new Map(parts.messages.map((message) => [message.id, message]));
  const subscribed = new Set<string>();
  for (const subscription of parts.subscriptions) {
    if (subscription.event_uuid !== null) subscribed.add(subscription.event_uuid);
  }
  const read = receiptIdsOf(parts);

  const eventIds = new Set<string>();
  for (const mention of parts.mentions) {
    if (mention.message_id === null) continue;
    const message = messageById.get(mention.message_id);
    if (!message || message.event_uuid === null) continue;
    if (!subscribed.has(message.event_uuid)) continue;
    if (eventById.get(message.event_uuid)?.deleted !== 0) continue;
    if (!isFromSomeoneElse(message, me) || read.has(message.id)) continue;
    eventIds.add(message.event_uuid);
  }
  return eventIds;
}
