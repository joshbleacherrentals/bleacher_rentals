"use client";

import { useMemo } from "react";
import { useDashboardPowerSync } from "@/features/dashboard/db/hooks/powersync/useDashboardPowerSync";
import { useLogisticsPlans } from "@/features/scheduleValidator/hooks/useLogisticsPlans";
import { buildGridRows, type GridRow } from "../utils/rows";

/**
 * The Event Dashboard's rows for a zone and week: the events starting that week, each followed by
 * its bleachers as the dashboard knows them (events, work trackers, maintenance). Empty until a zone
 * is chosen. Loading the dashboard's data also fills its shared stores, as on the Dashboard page.
 */
export function useEventDashboardRows(
  zoneId: string,
  weekStart: string,
): { rows: GridRow[]; isLoading: boolean } {
  const { bleachers } = useDashboardPowerSync({ onlyShowMyEvents: false });
  const { events, isLoading } = useLogisticsPlans(weekStart, zoneId || undefined);

  const rows = useMemo(
    () => (zoneId ? buildGridRows(events, bleachers) : []),
    [zoneId, events, bleachers],
  );
  return { rows, isLoading };
}
