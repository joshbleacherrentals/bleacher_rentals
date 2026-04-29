"use client";

import { db } from "@/components/providers/SystemProvider";
import { expect, useTypedQuery } from "@/lib/powersync/typedQuery";
import { sql } from "@powersync/kysely-driver";
import { useMemo } from "react";
import type { TaskRow, TaskStatus } from "../types";

type Row = {
  id: string;
  created_at: string | null;
  completed_at: string | null;
  deleted_at: string | null;
  sprint_id: string | null;
  feature_id: string | null;
  title: string | null;
  description: string | null;
  status: string | null;
  sort_order: number | null;
  created_by_user_uuid: string | null;
  is_backlog: number | null;
  developer_uuid: string | null;
};

function toTask(r: Row): TaskRow {
  return {
    id: r.id,
    created_at: r.created_at ?? "",
    completed_at: r.completed_at,
    deleted_at: r.deleted_at,
    sprint_id: r.sprint_id,
    feature_id: r.feature_id,
    title: r.title ?? "",
    description: r.description,
    status: (r.status as TaskStatus) ?? "to_do",
    sort_order: r.sort_order ?? 0,
    created_by_user_uuid: r.created_by_user_uuid,
    is_backlog: (r.is_backlog ?? 0) === 1,
    developer_uuid: r.developer_uuid,
  };
}

export function useBacklogTasks(showDeleted = false) {
  const compiled = useMemo(
    () =>
      db
        .selectFrom("RoadmapTasks")
        .select([
          "id",
          "created_at",
          "completed_at",
          "deleted_at",
          "sprint_id",
          "feature_id",
          "title",
          "description",
          "status",
          "sort_order",
          "created_by_user_uuid",
          "is_backlog",
          "developer_uuid",
        ])
        .where("is_backlog", "=", 1)
        .$if(!showDeleted, (qb) => qb.where("deleted_at", "is", null))
        .$if(showDeleted, (qb) => qb.where("deleted_at", "is not", null))
        .where((eb) =>
          eb.or([
            eb("completed_at", "is", null),
            eb("completed_at", ">", sql<string>`datetime('now', '-90 days')`),
          ]),
        )
        .orderBy("created_at", "desc")
        .compile(),
    [showDeleted],
  );

  const { data, isLoading, error } = useTypedQuery(compiled, expect<Row>());

  const tasks = useMemo<TaskRow[]>(() => (data ?? []).map(toTask), [data]);

  return { tasks, isLoading, error };
}
