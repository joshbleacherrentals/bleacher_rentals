import type { Transaction } from "@powersync/web";
import { db } from "@/components/providers/SystemProvider";
import { typedWriteTransaction } from "@/lib/powersync/typedQuery";
import { markEventChatUnread } from "./subscriptions";

export { clearEventChatUnread, markEventChatUnread } from "./subscriptions";

/** A system message ("X added Y to the conversation.") and the user it is posted as. */
export type ChatSystemMessage = { userUuid: string; body: string };

/** Inserts the same EventMessages row `sendEventMessage` writes for a system message. */
async function insertSystemMessage(
  tx: Transaction,
  eventUuid: string,
  message: ChatSystemMessage,
): Promise<void> {
  const insert = db
    .insertInto("EventMessages")
    .values({
      id: crypto.randomUUID(),
      event_uuid: eventUuid,
      user_uuid: message.userUuid,
      body: message.body,
      is_system: 1,
      reply_to_message_id: null,
      created_at: new Date().toISOString(),
    })
    .compile();
  await tx.execute(insert.sql, [...insert.parameters]);
}

/**
 * Adds a user to an event chat and posts the system message, in one write transaction: both are
 * written or neither (they used to be three separate calls, so the subscription could be written
 * and the message fail). Idempotent like `subscribeToEvent`: a user who is already subscribed
 * keeps the subscription, and the message is still posted. Returns the subscription row id.
 */
export async function addEventChatMember(
  eventUuid: string,
  targetUserUuid: string,
  message: ChatSystemMessage | null,
): Promise<string> {
  return typedWriteTransaction(async (tx) => {
    const lookup = db
      .selectFrom("EventSubscriptions")
      .select(["id"])
      .where("event_uuid", "=", eventUuid)
      .where("user_uuid", "=", targetUserUuid)
      .limit(1)
      .compile();
    const existing = await tx.getAll<{ id: string }>(lookup.sql, [...lookup.parameters]);

    let subscriptionId: string;
    if (existing.length > 0) {
      subscriptionId = existing[0].id;
    } else {
      subscriptionId = crypto.randomUUID();
      const insert = db
        .insertInto("EventSubscriptions")
        .values({
          id: subscriptionId,
          event_uuid: eventUuid,
          user_uuid: targetUserUuid,
          created_at: new Date().toISOString(),
          unread: 0,
        })
        .compile();
      await tx.execute(insert.sql, [...insert.parameters]);
    }

    if (message) await insertSystemMessage(tx, eventUuid, message);
    return subscriptionId;
  });
}

/**
 * Removes a user from an event chat and posts the system message, in one write transaction:
 * both are written or neither. A user who is not subscribed loses nothing, and the message is
 * still posted, as before.
 */
export async function removeEventChatMember(
  eventUuid: string,
  targetUserUuid: string,
  message: ChatSystemMessage | null,
): Promise<void> {
  await typedWriteTransaction(async (tx) => {
    const remove = db
      .deleteFrom("EventSubscriptions")
      .where("event_uuid", "=", eventUuid)
      .where("user_uuid", "=", targetUserUuid)
      .compile();
    await tx.execute(remove.sql, [...remove.parameters]);

    if (message) await insertSystemMessage(tx, eventUuid, message);
  });
}

/** Unsubscribe the current user and post a system leave message. */
export async function leaveEventChat(eventUuid: string, userUuid: string, actorName: string) {
  await removeEventChatMember(eventUuid, userUuid, {
    userUuid,
    body: `${actorName} left the chat.`,
  });
}

/** Sets the subscription unread flag (reusable from chat menu or sidebar PKM). */
export async function markEventConversationUnread(eventUuid: string, userUuid: string) {
  await markEventChatUnread(eventUuid, userUuid);
}
