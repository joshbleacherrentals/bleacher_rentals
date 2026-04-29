"use client";

import { db } from "@/components/providers/SystemProvider";
import { expect, useTypedQuery } from "@/lib/powersync/typedQuery";
import { useMemo } from "react";

type Row = {
  id: string;
  message_id: string | null;
  user_uuid: string | null;
  read_at: string | null;
};

export type ReadReceiptMap = Map<string, string[]>;

export function useReadReceiptsForTask(taskId: string | null) {
  const safeId = taskId ?? "__none__";

  const compiled = useMemo(
    () =>
      db
        .selectFrom("RoadmapTaskMessageReadReceipts as rr")
        .innerJoin("RoadmapTaskMessages as m", "m.id", "rr.message_id")
        .select([
          "rr.id as id",
          "rr.message_id as message_id",
          "rr.user_uuid as user_uuid",
          "rr.read_at as read_at",
        ])
        .where("m.task_id", "=", safeId)
        .compile(),
    [safeId]
  );

  const { data } = useTypedQuery(compiled, expect<Row>());

  const receiptsByMessage = useMemo<ReadReceiptMap>(() => {
    const map = new Map<string, string[]>();
    for (const r of data ?? []) {
      if (!r.message_id || !r.user_uuid) continue;
      const existing = map.get(r.message_id) ?? [];
      existing.push(r.user_uuid);
      map.set(r.message_id, existing);
    }
    return map;
  }, [data]);

  return { receiptsByMessage };
}
