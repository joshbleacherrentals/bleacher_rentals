"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useCurrentUser } from "@/hooks/db/useCurrentUser";
import { useUserAccess } from "@/features/userAccess/client";
import {
  markInspectionQueueSeen,
  useInspectionQueue,
  type AnnualInspectionQueueRow,
} from "../db/annualInspections";
import { decorateQueue, type DecoratedQueueRow } from "../logic/decorateQueue";
import { todayLocal } from "../logic/dateOnly";
import { receivesInspectionNotifications } from "../logic/receivesInspectionNotifications";

/**
 * The queue as this reader should see it right now, with the highlight frozen
 * for the length of the visit.
 *
 * Opening the page stamps `inspection_queue_last_seen_at`, which is what makes
 * the badge go away — but the rows on screen must keep the highlight they were
 * opened with, or they would clear themselves out from under the person
 * reading them. So the last-seen value is captured once, before the stamp, and
 * every row on this visit is measured against that captured moment.
 *
 * Only a maintainer is measured at all. Everyone else who can open the queue —
 * an administrator, a viewer — reads it without a highlight and without
 * stamping anything, because being notified is the maintainer's job and a
 * notification everyone carries is one nobody reads.
 */
export function useAnnualInspectionQueue(): {
  rows: DecoratedQueueRow[];
  today: string;
} {
  const queue: AnnualInspectionQueueRow[] = useInspectionQueue();
  const { data: userData } = useCurrentUser();
  const user = userData?.[0] ?? null;
  const access = useUserAccess();
  const notified = access.status === "active" && receivesInspectionNotifications(access.roles);

  // `null` until the user row arrives; nothing is highlighted before then, so
  // a cold start cannot flash the whole fleet as new.
  const [openedWith, setOpenedWith] = useState<{ lastSeenAt: string | null } | null>(null);
  const hasStamped = useRef(false);

  useEffect(() => {
    if (!user || !notified || hasStamped.current) return;
    hasStamped.current = true;
    setOpenedWith({ lastSeenAt: user.inspection_queue_last_seen_at ?? null });
    void markInspectionQueueSeen(user.id);
  }, [user, notified]);

  const today = useMemo(() => todayLocal(), []);

  const rows = useMemo(() => {
    const decorated = decorateQueue(queue, today, openedWith?.lastSeenAt ?? null);
    if (openedWith && notified) return decorated;
    return decorated.map((row) => ({ ...row, isNew: false }));
  }, [queue, today, openedWith, notified]);

  return { rows, today };
}
