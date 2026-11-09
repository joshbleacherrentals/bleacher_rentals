"use client";

import { useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { useZones } from "@/features/quotesAndBookings/hooks/useZoneLookup";
import { currentWeekStart, formatWeekLabel, shiftWeek } from "../utils/week";

/**
 * Pick one zone and one week (Monday to Sunday). Nothing is built from the pair yet: the page only
 * holds the selection.
 */
export function AutoWorkTrackersPage() {
  const zones = useZones();
  const [zoneId, setZoneId] = useState<string>("");
  const [weekStart, setWeekStart] = useState<string>(currentWeekStart);

  const isCurrentWeek = weekStart === currentWeekStart();

  return (
    <>
      <PageHeader title="Auto Work Trackers" />
      <div className="flex flex-wrap items-end gap-6">
        <div className="flex flex-col gap-1">
          <label htmlFor="auto-work-trackers-zone" className="text-sm font-medium">
            Zone
          </label>
          <select
            id="auto-work-trackers-zone"
            value={zoneId}
            onChange={(e) => setZoneId(e.target.value)}
            className="h-9 min-w-56 rounded-md border bg-background px-3 text-sm shadow-xs"
          >
            <option value="" disabled>
              Select a zone
            </option>
            {zones.map((zone) => (
              <option key={zone.id} value={zone.id}>
                {zone.name}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-1">
          <span className="text-sm font-medium">Week</span>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="icon"
              aria-label="Previous week"
              onClick={() => setWeekStart((w) => shiftWeek(w, -1))}
            >
              <ChevronLeft />
            </Button>
            <span
              className="min-w-52 text-center text-sm font-medium"
              data-testid="auto-work-trackers-week"
            >
              {formatWeekLabel(weekStart)}
            </span>
            <Button
              variant="outline"
              size="icon"
              aria-label="Next week"
              onClick={() => setWeekStart((w) => shiftWeek(w, 1))}
            >
              <ChevronRight />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              disabled={isCurrentWeek}
              onClick={() => setWeekStart(currentWeekStart())}
            >
              This week
            </Button>
          </div>
        </div>
      </div>
    </>
  );
}
