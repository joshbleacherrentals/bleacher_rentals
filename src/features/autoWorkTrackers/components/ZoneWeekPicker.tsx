"use client";

import type { ReactNode } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useZones } from "@/features/quotesAndBookings/hooks/useZoneLookup";
import { currentWeekStart, formatWeekLabel, shiftWeek } from "../utils/week";

/**
 * A zone and a week (Monday to Sunday), shared by the pages that work a week at a time.
 * `weekStart` is the week's Monday, "YYYY-MM-DD"; `children` sit beside the pickers. The zone
 * select shows only when `onZoneChange` is given.
 */
export function ZoneWeekPicker({
  idPrefix,
  zoneId = "",
  weekStart,
  onZoneChange,
  onWeekChange,
  children,
}: {
  idPrefix: string;
  zoneId?: string;
  weekStart: string;
  onZoneChange?: (zoneId: string) => void;
  onWeekChange: (weekStart: string) => void;
  children?: ReactNode;
}) {
  const zones = useZones();
  const isCurrentWeek = weekStart === currentWeekStart();

  return (
    <div className="flex flex-wrap items-end gap-6">
      {onZoneChange && (
        <div className="flex flex-col gap-1">
          <label htmlFor={`${idPrefix}-zone`} className="text-sm font-medium">
            Zone
          </label>
          <select
            id={`${idPrefix}-zone`}
            value={zoneId}
            onChange={(e) => onZoneChange(e.target.value)}
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
      )}

      <div className="flex flex-col gap-1">
        <span className="text-sm font-medium">Week</span>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="icon"
            aria-label="Previous week"
            onClick={() => onWeekChange(shiftWeek(weekStart, -1))}
          >
            <ChevronLeft />
          </Button>
          <span
            className="min-w-52 text-center text-sm font-medium"
            data-testid={`${idPrefix}-week`}
          >
            {formatWeekLabel(weekStart)}
          </span>
          <Button
            variant="outline"
            size="icon"
            aria-label="Next week"
            onClick={() => onWeekChange(shiftWeek(weekStart, 1))}
          >
            <ChevronRight />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            disabled={isCurrentWeek}
            onClick={() => onWeekChange(currentWeekStart())}
          >
            This week
          </Button>
        </div>
      </div>

      {children}
    </div>
  );
}
