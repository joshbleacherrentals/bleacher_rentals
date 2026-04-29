import { db } from "@/components/providers/SystemProvider";
import { typedExecute } from "@/lib/powersync/typedQuery";
import { autoSubscribeBacklogTask } from "./subscriptions";
import type { TaskStatus } from "../types";

export type SaveTaskInput = {
  taskId: string | null;
  sprintId: string | null;
  featureId: string | null;
  title: string;
  description: string | null;
  status: TaskStatus;
  createdByUserUuid: string | null;
  isBacklog?: boolean;
  developerUuid?: string | null;
};

export async function saveTask(input: SaveTaskInput): Promise<string> {
  if (input.taskId) {
    const compiled = db
      .updateTable("RoadmapTasks")
      .set({
        sprint_id: input.sprintId,
        feature_id: input.featureId,
        title: input.title,
        description: input.description,
        status: input.status,
        is_backlog: input.isBacklog ? 1 : 0,
        developer_uuid: input.developerUuid ?? null,
      })
      .where("id", "=", input.taskId)
      .compile();
    await typedExecute(compiled);
    return input.taskId;
  }

  const id = crypto.randomUUID();
  const compiled = db
    .insertInto("RoadmapTasks")
    .values({
      id,
      created_at: new Date().toISOString(),
      sprint_id: input.sprintId,
      feature_id: input.featureId,
      title: input.title,
      description: input.description,
      status: input.status,
      sort_order: 0,
      created_by_user_uuid: input.createdByUserUuid,
      is_backlog: input.isBacklog ? 1 : 0,
      developer_uuid: input.developerUuid ?? null,
    })
    .compile();
  await typedExecute(compiled);

  if (input.isBacklog) {
    await autoSubscribeBacklogTask(id);
  }

  return id;
}

export async function deleteTask(taskId: string) {
  await typedExecute(
    db
      .updateTable("RoadmapTasks")
      .set({ deleted_at: new Date().toISOString() })
      .where("id", "=", taskId)
      .compile(),
  );
}

export async function restoreTask(taskId: string) {
  await typedExecute(
    db.updateTable("RoadmapTasks").set({ deleted_at: null }).where("id", "=", taskId).compile(),
  );
}

export async function setTaskStatus(taskId: string, status: TaskStatus) {
  await typedExecute(
    db.updateTable("RoadmapTasks").set({ status }).where("id", "=", taskId).compile(),
  );
}
