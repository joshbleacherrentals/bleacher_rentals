"use client";

import { useMemo } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useZoneWeekParams } from "@/features/autoWorkTrackers/hooks/useZoneWeekParams";
import { useEventDashboardRows } from "../hooks/useEventDashboardRows";
import { useSuggestedTrips } from "../hooks/useSuggestedTrips";
import type { EventDashboardData } from "../pixi/EventDashboard";
import { EventDashboardCanvas } from "./EventDashboardCanvas";

/**
 * The dashboard's grid for the zone and week, grouped by the events that start that week. Suggested
 * trips flash on it as ghost work trackers; clicking one creates the work tracker. Trips can only be
 * created inside the selected week.
 */
export function EventDashboardTab() {
  const { zoneId, weekStart } = useZoneWeekParams();
  const { rows, isLoading } = useEventDashboardRows(zoneId, weekStart);
  const { trips, loading, accepting, error, suggest, accept } = useSuggestedTrips(
    zoneId,
    weekStart,
  );

  const data = useMemo<EventDashboardData>(
    () => ({ rows, weekStart, suggestions: trips }),
    [rows, weekStart, trips],
  );

  if (!zoneId) {
    return <p className="text-sm text-gray-500">Select a zone to see its events.</p>;
  }

  return (
    <div className="flex h-full min-h-[420px] flex-col gap-3">
      <div className="flex flex-wrap items-center gap-3">
        <Button variant="outline" onClick={suggest} disabled={loading}>
          {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Suggest trips
        </Button>
        {trips.length > 0 && (
          <Button onClick={() => accept(trips)} disabled={accepting}>
            {accepting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Accept all ({trips.length})
          </Button>
        )}
        <span className="text-sm text-gray-600" data-testid="event-dashboard-status">
          {isLoading
            ? "Loading…"
            : trips.length > 0
              ? `${trips.length} suggested trip${trips.length === 1 ? "" : "s"}: click a flashing tile to accept it.`
              : rows.length === 0
                ? "No events start this week."
                : ""}
        </span>
        {error && <span className="text-sm text-red-600">{error}</span>}
      </div>
      <div className="min-h-0 flex-1" data-testid="event-dashboard">
        <EventDashboardCanvas data={data} onAccept={(trip) => accept([trip])} />
      </div>
    </div>
  );
}
