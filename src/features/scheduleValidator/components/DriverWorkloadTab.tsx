"use client";

import { useDriverWorkload } from "../hooks/useDriverWorkload";
import { useSelectedWeek } from "../hooks/useSelectedWeek";
import { MAX_DRIVING_HOURS, formatHours, type WorkloadDay } from "../utils/driverWorkload";
import { DriverWeekGrid, GRID_LINES as LINES } from "./DriverWeekGrid";

function WorkloadCell({ day }: { day: WorkloadDay }) {
  if (day.trips === 0) return <div className={`min-h-12 ${LINES}`} />;

  return (
    <div
      className={`flex min-h-12 flex-col items-center justify-center px-1 py-1 text-center text-sm ${LINES} ${
        day.overLimit ? "bg-red-100 font-semibold text-red-700" : ""
      }`}
      title={day.overLimit ? `More than ${MAX_DRIVING_HOURS} hours of driving` : undefined}
      data-testid="driver-workload-cell"
      data-over-limit={day.overLimit}
    >
      <span>
        {formatHours(day.minutes)} · {day.trips} trip{day.trips === 1 ? "" : "s"}
      </span>
      {day.missingDriveTime > 0 && (
        <span className="text-xs font-normal text-gray-500">
          {day.missingDriveTime} missing drive time
        </span>
      )}
    </div>
  );
}

/**
 * A grid of the selected week: a row per driver, a column per day, each cell the hours that driver
 * drives that day and how many trips that is. A day over 12 hours is shown as an error.
 */
export function DriverWorkloadTab() {
  const [weekStart] = useSelectedWeek();
  const { drivers, isLoading } = useDriverWorkload(weekStart);

  if (isLoading) return <p className="text-sm text-gray-500">Loading…</p>;
  if (drivers.length === 0) {
    return <p className="text-sm text-gray-500">No drivers have work trackers this week.</p>;
  }

  return (
    <DriverWeekGrid
      weekStart={weekStart}
      drivers={drivers}
      renderDay={(day) => <WorkloadCell day={day} />}
      testId="driver-workload"
    />
  );
}
