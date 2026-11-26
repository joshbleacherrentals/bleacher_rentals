"use client";

import { useChecks } from "@/features/autoWorkTrackers/components/ChecksProvider";
import { useZoneWeekParams } from "@/features/autoWorkTrackers/hooks/useZoneWeekParams";
import { useSelectedWeek } from "../hooks/useSelectedWeek";
import { useDriverUserUuids } from "../hooks/useDriverUserUuids";
import { DriverLinksMenu } from "./DriverLinksMenu";
import { DriverNameWithKind } from "./DriverNameWithKind";
import { useDriverKinds } from "../hooks/useDriverKinds";
import { Truck } from "lucide-react";
import { AppTooltip } from "@/components/AppTooltip";
import {
  MAX_DRIVING_HOURS,
  formatHours,
  formatKm,
  type WorkloadDay,
} from "../utils/driverWorkload";
import { DriverWeekGrid, GRID_LINES as LINES } from "./DriverWeekGrid";

function WorkloadCell({ day }: { day: WorkloadDay }) {
  if (day.trips === 0) return <div className={`min-h-12 ${LINES}`} />;

  const tripsText = `${day.trips} trip${day.trips === 1 ? "" : "s"}`;
  const tip = (
    <div className="space-y-0.5 text-xs">
      <div className="font-semibold">
        {formatHours(day.minutes)} driving · {formatKm(day.meters)} · {tripsText}
      </div>
      <div>
        Hauling: {formatHours(day.haulMinutes)} · {formatKm(day.haulMeters)}
      </div>
      <div>
        Deadhead (to pickups and home): {formatHours(day.deadheadMinutes)} ·{" "}
        {formatKm(day.deadheadMeters)}
      </div>
      {day.missingDriveTime > 0 && (
        <div>
          {day.missingDriveTime} trip{day.missingDriveTime === 1 ? "" : "s"} with no drive time
        </div>
      )}
      {day.overLimit && (
        <div className="font-semibold">Over {MAX_DRIVING_HOURS} hours of driving</div>
      )}
    </div>
  );

  return (
    <AppTooltip content={tip}>
      <div
        className={`flex min-h-12 flex-col justify-center gap-0.5 overflow-hidden px-1.5 py-1 leading-tight whitespace-nowrap ${LINES} ${
          day.overLimit ? "bg-red-100 text-red-700" : ""
        }`}
        data-testid="driver-workload-cell"
        data-over-limit={day.overLimit}
      >
        <span className="truncate text-[13px] font-semibold">
          {formatHours(day.minutes)} · {formatKm(day.meters)} ·{" "}
          <Truck className="inline h-3 w-3 align-[-1px]" aria-label="trips" />
          {day.trips}
        </span>
        <span
          className={`truncate text-[11px] ${day.overLimit ? "text-red-600" : "text-gray-500"}`}
        >
          Haul {formatHours(day.haulMinutes)} · {formatKm(day.haulMeters)}
        </span>
        <span
          className={`truncate text-[11px] ${day.overLimit ? "text-red-600" : "text-gray-500"}`}
        >
          DH {formatHours(day.deadheadMinutes)} · {formatKm(day.deadheadMeters)}
        </span>
        {day.missingDriveTime > 0 && (
          <span className="truncate text-[11px] text-amber-700">
            {day.missingDriveTime} no time
          </span>
        )}
      </div>
    </AppTooltip>
  );
}

/**
 * A grid of the selected week: a row per driver in the selected zone, a column per day, each cell
 * that driver's driving that day (the total, and its hauling and deadhead) and how many trips that
 * is. A day over 12 hours in total is shown as an error.
 */
export function DriverWorkloadTab() {
  const [weekStart] = useSelectedWeek();
  const { zoneId } = useZoneWeekParams();
  const userUuids = useDriverUserUuids(zoneId);
  const kinds = useDriverKinds(zoneId);
  const { drivers, isLoading } = useChecks().driverWorkload;

  if (!zoneId) {
    return <p className="text-sm text-gray-500">Select a zone to see its drivers.</p>;
  }
  if (isLoading) return <p className="text-sm text-gray-500">Loading…</p>;
  if (drivers.length === 0) {
    return (
      <p className="text-sm text-gray-500">No drivers in this zone have work trackers this week.</p>
    );
  }

  return (
    <DriverWeekGrid
      weekStart={weekStart}
      renderDriverName={(driver) => (
        <DriverNameWithKind name={driver.driverName} kind={kinds.get(driver.driverUuid)} />
      )}
      renderDriverActions={(driver) => (
        <DriverLinksMenu
          userUuid={userUuids.get(driver.driverUuid)}
          weekStart={weekStart}
          driverName={driver.driverName}
        />
      )}
      drivers={drivers}
      renderDay={(day) => <WorkloadCell day={day} />}
      testId="driver-workload"
    />
  );
}
