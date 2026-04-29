import { db } from "@/components/providers/SystemProvider";
import { expect, typedExecute, typedGetAll } from "@/lib/powersync/typedQuery";

export async function subscribeToTask(taskId: string, userUuid: string): Promise<string> {
  // Check first so this function is idempotent (safe to call even if already subscribed)
  const existing = await typedGetAll(
    db
      .selectFrom("RoadmapTaskSubscriptions")
      .select(["id"])
      .where("task_id", "=", taskId)
      .where("user_uuid", "=", userUuid)
      .limit(1)
      .compile(),
    expect<{ id: string }>(),
  );
  if (existing.length > 0) return existing[0].id;

  const id = crypto.randomUUID();
  await typedExecute(
    db
      .insertInto("RoadmapTaskSubscriptions")
      .values({
        id,
        task_id: taskId,
        user_uuid: userUuid,
        created_at: new Date().toISOString(),
      })
      .compile(),
  );
  return id;
}

/**
 * Subscribes all active developers who have auto_subscribe_to_new_tickets = true
 * to the given task. Called automatically when a new backlog ticket is created.
 */
export async function autoSubscribeBacklogTask(taskId: string): Promise<void> {
  const developers = await typedGetAll(
    db
      .selectFrom("Developers")
      .select(["user_uuid"])
      .where("is_active", "=", 1)
      .where("auto_subscribe_to_new_tickets", "=", 1)
      .compile(),
    expect<{ user_uuid: string | null }>(),
  );

  const now = new Date().toISOString();
  for (const dev of developers) {
    if (!dev.user_uuid) continue;
    // Check for existing subscription to stay idempotent
    const existing = await typedGetAll(
      db
        .selectFrom("RoadmapTaskSubscriptions")
        .select(["id"])
        .where("task_id", "=", taskId)
        .where("user_uuid", "=", dev.user_uuid)
        .limit(1)
        .compile(),
      expect<{ id: string }>(),
    );
    if (existing.length > 0) continue;

    await typedExecute(
      db
        .insertInto("RoadmapTaskSubscriptions")
        .values({
          id: crypto.randomUUID(),
          task_id: taskId,
          user_uuid: dev.user_uuid,
          created_at: now,
        })
        .compile(),
    );
  }
}

export async function unsubscribeFromTask(taskId: string, userUuid: string) {
  await typedExecute(
    db
      .deleteFrom("RoadmapTaskSubscriptions")
      .where("task_id", "=", taskId)
      .where("user_uuid", "=", userUuid)
      .compile(),
  );
}

export async function markMessagesRead(taskId: string, userUuid: string) {
  const compiled = db
    .selectFrom("RoadmapTaskMessages")
    .select(["id"])
    .where("task_id", "=", taskId)
    .compile();

  const messages = await typedGetAll(compiled, expect<{ id: string }>());

  const existingCompiled = db
    .selectFrom("RoadmapTaskMessageReadReceipts")
    .select(["message_id"])
    .where("user_uuid", "=", userUuid)
    .compile();
  const existing = await typedGetAll(existingCompiled, expect<{ message_id: string | null }>());
  const existingSet = new Set(existing.map((r) => r.message_id));

  const now = new Date().toISOString();
  for (const msg of messages) {
    if (existingSet.has(msg.id)) continue;
    await typedExecute(
      db
        .insertInto("RoadmapTaskMessageReadReceipts")
        .values({
          id: crypto.randomUUID(),
          message_id: msg.id,
          user_uuid: userUuid,
          read_at: now,
        })
        .compile(),
    );
  }
}
