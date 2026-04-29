import { db } from "@/components/providers/SystemProvider";
import { typedExecute } from "@/lib/powersync/typedQuery";

export type SendMessageInput = {
  taskId: string;
  userUuid: string;
  body: string;
  isSystem?: boolean;
};

export async function sendTaskMessage(input: SendMessageInput): Promise<string> {
  const id = crypto.randomUUID();
  await typedExecute(
    db
      .insertInto("RoadmapTaskMessages")
      .values({
        id,
        task_id: input.taskId,
        user_uuid: input.userUuid,
        body: input.body,
        is_system: input.isSystem ? 1 : 0,
        created_at: new Date().toISOString(),
      })
      .compile(),
  );
  return id;
}

export async function deleteTaskMessage(messageId: string) {
  await typedExecute(db.deleteFrom("RoadmapTaskMessages").where("id", "=", messageId).compile());
}
