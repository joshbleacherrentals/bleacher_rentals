"use client";

import type { ReactNode } from "react";
import { DateTime } from "luxon";
import { weekDays } from "@/features/autoWorkTrackers/utils/week";

/** The grid's cell borders: each cell draws its right and bottom edge, the grid its top and left. */
export const GRID_LINES = "border-r border-b border-black/15";

type DriverRow = { driverUuid: string; driverName: string; days: { date: string }[] };

/**
 * A week grid of drivers: a row per driver, a column per day (Monday first), with a header row of
 * dates. Each check that looks at drivers day by day draws its cells through `renderDay`; the driver
 * column is the name, after `renderDriverStatus` when given.
 */
export function DriverWeekGrid<R extends DriverRow>({
  weekStart,
  drivers,
  renderDay,
  renderDriverStatus,
  testId,
}: {
  weekStart: string;
  drivers: R[];
  renderDay: (day: R["days"][number]) => ReactNode;
  renderDriverStatus?: (driver: R) => ReactNode;
  testId?: string;
}) {
  return (
    <div
      className="grid border-t border-l border-black/15"
      style={{ gridTemplateColumns: "175px repeat(7, minmax(0, 1fr))" }}
      data-testid={testId}
    >
      <div
        className={`flex h-10 items-center bg-gray-200 px-2 text-sm font-semibold ${GRID_LINES}`}
      >
        Driver
      </div>
      {weekDays(weekStart).map((date) => (
        <div
          key={date}
          className={`flex h-10 items-center justify-center bg-gray-200 text-[13px] font-semibold ${GRID_LINES}`}
        >
          {DateTime.fromISO(date).toFormat("EEE, MMM d")}
        </div>
      ))}

      {drivers.map((driver) => (
        <div key={driver.driverUuid} className="contents" data-testid="driver-week-row">
          <div
            className={`flex min-h-12 items-center gap-2 px-2 text-sm font-medium ${GRID_LINES}`}
          >
            {renderDriverStatus?.(driver)}
            {driver.driverName}
          </div>
          {driver.days.map((day) => (
            <div key={day.date} className="contents">
              {renderDay(day)}
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
