import type { GenerateWorkTrackersResult } from "../api/generateWorkTrackers";

type Unassigned = GenerateWorkTrackersResult["unassigned"][number];

const REASON_TEXT: Record<Unassigned["reason"], string> = {
  no_window: "events are back to back",
  outside_week: "no free day in this week",
  no_free_driver_day: "no driver free on those days",
};

/**
 * One line saying which trips got no driver and day (so no work tracker was made), grouped by why:
 * "3 trips not created: no driver free on those days (2), events are back to back (1)."
 */
export function summarizeUnassigned(unassigned: Unassigned[]): string {
  const counts = new Map<Unassigned["reason"], number>();
  for (const u of unassigned) counts.set(u.reason, (counts.get(u.reason) ?? 0) + 1);
  const parts = [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([reason, n]) => `${REASON_TEXT[reason]} (${n})`);
  return `${unassigned.length} trip${unassigned.length === 1 ? "" : "s"} not created: ${parts.join(", ")}.`;
}
