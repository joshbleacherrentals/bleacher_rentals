"use client";

import { db } from "@/components/providers/SystemProvider";
import { expect, useTypedQuery } from "@/lib/powersync/typedQuery";
import { useMemo } from "react";
import type { TaskMessage } from "../types";

type Row = {
  id: string;
  task_id: string | null;
  user_uuid: string | null;
  body: string | null;
  created_at: string | null;
  is_system: number | null;
};

function toMessage(r: Row): TaskMessage {
  return {
    id: r.id,
    task_id: r.task_id ?? "",
    user_uuid: r.user_uuid ?? "",
    body: r.body ?? "",
    created_at: r.created_at ?? "",
    is_system: r.is_system === 1,
  };
}

export function useMessagesForTask(taskId: string | null) {
  const safeId = taskId ?? "__none__";

  const compiled = useMemo(
    () =>
      db
        .selectFrom("RoadmapTaskMessages")
        .select(["id", "task_id", "user_uuid", "body", "created_at", "is_system"])
        .where("task_id", "=", safeId)
        .orderBy("created_at", "asc")
        .compile(),
    [safeId],
  );

  const { data, isLoading, error } = useTypedQuery(compiled, expect<Row>());

  const messages = useMemo<TaskMessage[]>(() => (data ?? []).map(toMessage), [data]);

  return { messages, isLoading, error };
}
