"use client";

import { db } from "@/components/providers/SystemProvider";
import { expect, useTypedQuery } from "@/lib/powersync/typedQuery";
import { useMemo, useCallback, useRef } from "react";
import { setTyping } from "../db/typingIndicators";

type Row = {
  id: string;
  task_id: string | null;
  user_uuid: string | null;
  is_typing: number | null;
  updated_at: string | null;
};

const STALE_THRESHOLD_MS = 10_000;

export function useTypingIndicators(taskId: string | null, currentUserUuid: string | null) {
  const safeId = taskId ?? "__none__";

  const compiled = useMemo(
    () =>
      db
        .selectFrom("RoadmapTaskTypingIndicators")
        .select(["id", "task_id", "user_uuid", "is_typing", "updated_at"])
        .where("task_id", "=", safeId)
        .compile(),
    [safeId]
  );

  const { data } = useTypedQuery(compiled, expect<Row>());

  const typingUserUuids = useMemo(() => {
    const now = Date.now();
    return (data ?? [])
      .filter((r) => {
        if (!r.is_typing || r.user_uuid === currentUserUuid) return false;
        if (!r.updated_at) return false;
        const age = now - new Date(r.updated_at).getTime();
        return age < STALE_THRESHOLD_MS;
      })
      .map((r) => r.user_uuid ?? "");
  }, [data, currentUserUuid]);

  return { typingUserUuids };
}

export function useTypingEmitter(taskId: string | null, userUuid: string | null) {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isTypingRef = useRef(false);

  const emitTyping = useCallback(() => {
    if (!taskId || !userUuid) return;

    if (!isTypingRef.current) {
      isTypingRef.current = true;
      setTyping(taskId, userUuid, true);
    }

    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      isTypingRef.current = false;
      setTyping(taskId, userUuid, false);
    }, 2000);
  }, [taskId, userUuid]);

  const stopTyping = useCallback(() => {
    if (!taskId || !userUuid) return;
    if (timerRef.current) clearTimeout(timerRef.current);
    if (isTypingRef.current) {
      isTypingRef.current = false;
      setTyping(taskId, userUuid, false);
    }
  }, [taskId, userUuid]);

  return { emitTyping, stopTyping };
}
