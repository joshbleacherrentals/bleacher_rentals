import { db } from "@/components/providers/SystemProvider";
import { expect, typedExecute, typedGetAll } from "@/lib/powersync/typedQuery";

export async function setTyping(taskId: string, userUuid: string, isTyping: boolean) {
  const compiled = db
    .selectFrom("RoadmapTaskTypingIndicators")
    .select(["id"])
    .where("task_id", "=", taskId)
    .where("user_uuid", "=", userUuid)
    .limit(1)
    .compile();

  const rows = await typedGetAll(compiled, expect<{ id: string }>());

  if (rows.length > 0) {
    await typedExecute(
      db
        .updateTable("RoadmapTaskTypingIndicators")
        .set({
          is_typing: isTyping ? 1 : 0,
          updated_at: new Date().toISOString(),
        })
        .where("id", "=", rows[0].id)
        .compile()
    );
  } else {
    await typedExecute(
      db
        .insertInto("RoadmapTaskTypingIndicators")
        .values({
          id: crypto.randomUUID(),
          task_id: taskId,
          user_uuid: userUuid,
          is_typing: isTyping ? 1 : 0,
          updated_at: new Date().toISOString(),
        })
        .compile()
    );
  }
}
