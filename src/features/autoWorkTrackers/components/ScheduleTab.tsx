"use client";

import { useZoneWeekParams } from "../hooks/useZoneWeekParams";
import { WeekGrid } from "./WeekGrid";

/**
 * The zone's bleachers laid out across the selected week, as on the dashboard (the tiles are blank
 * for now). The Create work trackers button lives in the page header, above the tabs.
 */
export function ScheduleTab() {
  const { zoneId, weekStart } = useZoneWeekParams();

  return zoneId ? <WeekGrid zoneId={zoneId} weekStart={weekStart} /> : null;
}
