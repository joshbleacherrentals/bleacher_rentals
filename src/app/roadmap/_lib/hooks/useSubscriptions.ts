"use client";

import { db } from "@/components/providers/SystemProvider";
import { expect, useTypedQuery } from "@/lib/powersync/typedQuery";
import { useMemo } from "react";

type Row = {
  id: string;
  task_id: string | null;
  user_uuid: string | null;
  created_at: string | null;
};

export function useSubscriptionsForTask(taskId: string | null) {
  const safeId = taskId ?? "__none__";

  const compiled = useMemo(
    () =>
      db
        .selectFrom("RoadmapTaskSubscriptions")
        .select(["id", "task_id", "user_uuid", "created_at"])
        .where("task_id", "=", safeId)
        .compile(),
    [safeId],
  );

  const { data, isLoading } = useTypedQuery(compiled, expect<Row>());

  const subscriptions = useMemo(
    () =>
      (data ?? []).map((r) => ({
        id: r.id,
        task_id: r.task_id ?? "",
        user_uuid: r.user_uuid ?? "",
        created_at: r.created_at ?? "",
      })),
    [data],
  );

  return { subscriptions, isLoading };
}

export function useIsSubscribed(taskId: string | null, userUuid: string | null) {
  const { subscriptions } = useSubscriptionsForTask(taskId);
  return useMemo(
    () => subscriptions.some((s) => s.user_uuid === userUuid),
    [subscriptions, userUuid],
  );
}

export function useMySubscribedTaskIds(userUuid: string | null) {
  const safeUuid = userUuid ?? "__none__";

  const compiled = useMemo(
    () =>
      db
        .selectFrom("RoadmapTaskSubscriptions")
        .select(["task_id"])
        .where("user_uuid", "=", safeUuid)
        .compile(),
    [safeUuid],
  );

  const { data } = useTypedQuery(compiled, expect<{ task_id: string | null }>());

  return useMemo(
    () => new Set((data ?? []).map((r) => r.task_id).filter(Boolean) as string[]),
    [data],
  );
}

/** Returns a map of taskId → userUuid[] for ALL tasks in the local DB. */
export function useAllTaskSubscriptionsMap(): Map<string, string[]> {
  const compiled = useMemo(
    () => db.selectFrom("RoadmapTaskSubscriptions").select(["task_id", "user_uuid"]).compile(),
    [],
  );

  const { data } = useTypedQuery(
    compiled,
    expect<{ task_id: string | null; user_uuid: string | null }>(),
  );

  return useMemo(() => {
    const map = new Map<string, string[]>();
    for (const r of data ?? []) {
      if (!r.task_id || !r.user_uuid) continue;
      const existing = map.get(r.task_id) ?? [];
      existing.push(r.user_uuid);
      map.set(r.task_id, existing);
    }
    return map;
  }, [data]);
}
