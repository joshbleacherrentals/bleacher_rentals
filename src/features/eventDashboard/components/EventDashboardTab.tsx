"use client";

import { useMemo, useState } from "react";
import { useZoneWeekParams } from "@/features/autoWorkTrackers/hooks/useZoneWeekParams";
import { useTripMap } from "@/features/autoWorkTrackers/hooks/useTripMap";
import { TripMap } from "@/features/autoWorkTrackers/components/TripMap";
import { useEventDashboardRows } from "../hooks/useEventDashboardRows";
import type { EventDashboardData } from "../pixi/EventDashboard";
import { EventDashboardCanvas } from "./EventDashboardCanvas";

type View = "grid" | "map";
const VIEWS: { key: View; label: string }[] = [
  { key: "grid", label: "Grid" },
  { key: "map", label: "Map" },
];

/**
 * The zone's week two ways: the dashboard's grid, grouped by the events that start that week, or a
 * map of every work tracker as its driver's loop (TripMap). Read-only.
 */
export function EventDashboardTab() {
  const { zoneId, weekStart } = useZoneWeekParams();
  const [view, setView] = useState<View>("grid");
  const { rows, isLoading } = useEventDashboardRows(zoneId, weekStart);
  const tripMap = useTripMap(zoneId, weekStart);

  const data = useMemo<EventDashboardData>(() => ({ rows, weekStart }), [rows, weekStart]);

  if (!zoneId) {
    return <p className="text-sm text-gray-500">Select a zone to see its events.</p>;
  }

  const status =
    view === "grid"
      ? isLoading
        ? "Loading…"
        : rows.length === 0
          ? "No events start this week."
          : ""
      : tripMap.isLoading
        ? "Loading…"
        : tripMap.trackers === 0
          ? "No work trackers this week."
          : "";

  return (
    <div className="flex h-full min-h-[420px] flex-col gap-3">
      <div className="flex items-center gap-3">
        <div className="inline-flex rounded-md border p-0.5" role="tablist">
          {VIEWS.map((v) => (
            <button
              key={v.key}
              type="button"
              role="tab"
              aria-selected={view === v.key}
              className={`rounded px-3 py-1 text-sm ${
                view === v.key ? "bg-gray-900 text-white" : "text-gray-700 hover:bg-gray-100"
              }`}
              onClick={() => setView(v.key)}
              data-testid={`dashboard-view-${v.key}`}
            >
              {v.label}
            </button>
          ))}
        </div>
        {status && (
          <p className="text-sm text-gray-600" data-testid="event-dashboard-status">
            {status}
          </p>
        )}
      </div>
      <div className="min-h-0 flex-1" data-testid="event-dashboard">
        {view === "grid" ? (
          <EventDashboardCanvas data={data} />
        ) : (
          <TripMap loops={tripMap.loops} trackers={tripMap.trackers} />
        )}
      </div>
    </div>
  );
}
