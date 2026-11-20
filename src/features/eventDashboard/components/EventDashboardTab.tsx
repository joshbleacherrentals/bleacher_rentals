"use client";

import { useMemo } from "react";
import { useZoneWeekParams } from "@/features/autoWorkTrackers/hooks/useZoneWeekParams";
import { useEventDashboardRows } from "../hooks/useEventDashboardRows";
import type { EventDashboardData } from "../pixi/EventDashboard";
import { EventDashboardCanvas } from "./EventDashboardCanvas";

/** The dashboard's grid for the zone and week, grouped by the events that start that week. Read-only. */
export function EventDashboardTab() {
  const { zoneId, weekStart } = useZoneWeekParams();
  const { rows, isLoading } = useEventDashboardRows(zoneId, weekStart);

  const data = useMemo<EventDashboardData>(() => ({ rows, weekStart }), [rows, weekStart]);

  if (!zoneId) {
    return <p className="text-sm text-gray-500">Select a zone to see its events.</p>;
  }

  const status = isLoading ? "Loading…" : rows.length === 0 ? "No events start this week." : "";

  return (
    <div className="flex h-full min-h-[420px] flex-col gap-3">
      {status && (
        <p className="text-sm text-gray-600" data-testid="event-dashboard-status">
          {status}
        </p>
      )}
      <div className="min-h-0 flex-1" data-testid="event-dashboard">
        <EventDashboardCanvas data={data} />
      </div>
    </div>
  );
}
