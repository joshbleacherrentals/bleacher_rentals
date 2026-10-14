import { db } from "@/components/providers/SystemProvider";
import { expect, typedGetAll, typedWriteTransaction } from "@/lib/powersync/typedQuery";
import { clearEventChatUnread } from "./subscriptions";

/** Prevents overlapping mark-read runs (e.g. scroll retry scheduling twice). */
const markReadInFlight = new Set<string>();

/**
 * The messages of the event that have no receipt of `userUuid` yet, the author's own and system
 * messages included.
 */
function messagesWithoutReceipt(eventUuid: string, userUuid: string) {
  return db
    .selectFrom("EventMessages as m")
    .select("m.id")
    .where("m.event_uuid", "=", eventUuid)
    .where((eb) =>
      eb.not(
        eb.exists(
          eb
            .selectFrom("EventMessageReadReceipts as rr")
            .select("rr.id")
            .whereRef("rr.message_id", "=", "m.id")
            .where("rr.user_uuid", "=", userUuid),
        ),
      ),
    )
    .compile();
}

/**
 * Marks all messages in an event chat as read for the current user.
 * Idempotent — safe to call multiple times; skips existing (message_id, user_uuid) pairs.
 * Also clears the subscription-level unread flag.
 *
 * Two write transactions however many messages are unread (it used to be one per message, plus a
 * re-check read for each): one for all the receipts, then one for the unread flag. They are kept
 * apart on purpose: the server refuses a duplicate receipt or a role without the insert right,
 * and the upload then discards the rest of that transaction, so the unread flag must not share
 * it (docs/specs/slow-local-db-step2-fewer-calls.md, D2).
 */
export async function markEventMessagesRead(eventUuid: string, userUuid: string) {
  const lockKey = `${eventUuid}:${userUuid}`;
  if (markReadInFlight.has(lockKey)) return;
  markReadInFlight.add(lockKey);

  try {
    const query = messagesWithoutReceipt(eventUuid, userUuid);

    // Most runs find nothing unread; a plain read avoids opening a write transaction for them.
    const unread = await typedGetAll(query, expect<{ id: string }>());

    if (unread.length > 0) {
      await typedWriteTransaction(async (tx) => {
        // Read again inside the transaction: the receipts of a run that finished meanwhile (this
        // tab or another) are visible here, and no receipt can be written between this read and
        // the inserts below. This replaces the per-message re-check of the old code.
        const missing = await tx.getAll<{ id: string }>(query.sql, [...query.parameters]);

        const now = new Date().toISOString();
        for (const message of missing) {
          const insert = db
            .insertInto("EventMessageReadReceipts")
            .values({
              id: crypto.randomUUID(),
              message_id: message.id,
              user_uuid: userUuid,
              read_at: now,
            })
            .compile();
          await tx.execute(insert.sql, [...insert.parameters]);
        }
      });
    }

    await clearEventChatUnread(eventUuid, userUuid);
  } finally {
    markReadInFlight.delete(lockKey);
  }
}
