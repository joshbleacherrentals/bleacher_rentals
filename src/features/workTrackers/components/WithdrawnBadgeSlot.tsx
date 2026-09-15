"use client";

import { CountBadge } from "@/components/CountBadge";

/**
 * A fixed-width slot to the left of a row's content holding the count of
 * trackers the driver(s) on that row declined or abandoned.
 *
 * The slot keeps its width when the count is 0 and nothing is drawn, so the
 * labels of a list stay on one vertical line whether or not a given row has a
 * badge — the indent is the point, not a side effect.
 */
export function WithdrawnBadgeSlot({ count, label }: { count: number; label: string }) {
  return (
    <span className="flex w-7 shrink-0 items-center">
      {count > 0 && <CountBadge count={count} label={label} tone="red" testId="withdrawn-badge" />}
    </span>
  );
}
