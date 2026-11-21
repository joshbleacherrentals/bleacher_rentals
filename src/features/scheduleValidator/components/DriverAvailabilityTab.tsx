"use client";

import { Check, X } from "lucide-react";
import { AppTooltip } from "@/components/AppTooltip";
import { useChecks } from "@/features/autoWorkTrackers/components/ChecksProvider";
import { useZoneWeekParams } from "@/features/autoWorkTrackers/hooks/useZoneWeekParams";
import { useSelectedWeek } from "../hooks/useSelectedWeek";
import { useDriverUserUuids } from "../hooks/useDriverUserUuids";
import { DriverLinksMenu } from "./DriverLinksMenu";
import type { AvailabilityDay } from "../utils/driverAvailability";
import { DriverWeekGrid, GRID_LINES } from "./DriverWeekGrid";

function AvailabilityCell({ day }: { day: AvailabilityDay }) {
  const tripCount = day.trips.length;
  if (!day.unavailable && tripCount === 0) return <div className={`min-h-12 ${GRID_LINES}`} />;

  const tip = (
    <div className="space-y-0.5 text-xs">
      {day.conflict && <div className="font-semibold">Scheduled on a day marked unavailable</div>}
      {!day.conflict && day.unavailable && <div className="font-semibold">Marked unavailable</div>}
      {day.trips.map((t, i) => (
        <div key={i}>
          {t.fromStreet ?? "No pick-up address"} → {t.toStreet ?? "No drop-off address"}
        </div>
      ))}
    </div>
  );
  const tone = day.conflict
    ? "bg-red-100 font-semibold text-red-700"
    : day.unavailable
      ? "bg-gray-100 text-gray-500"
      : "";

  return (
    <AppTooltip content={tip}>
      <div
        className={`flex min-h-12 flex-col items-center justify-center px-1 py-1 text-center text-sm ${GRID_LINES} ${tone}`}
        data-testid="driver-availability-cell"
        data-conflict={day.conflict}
      >
        {day.unavailable && <span>Unavailable</span>}
        {tripCount > 0 && (
          <span className={day.unavailable ? "text-xs" : undefined}>
            {tripCount} trip{tripCount === 1 ? "" : "s"}
          </span>
        )}
      </div>
    </AppTooltip>
  );
}

/**
 * A grid of the selected week: a row per driver in the selected zone with a trip or a day off, a column per day. Each cell
 * shows whether the driver marked the day unavailable and how many trips they are on; both at once
 * is a conflict, in red. The driver gets a check when no day conflicts, and an X when one does.
 */
export function DriverAvailabilityTab() {
  const [weekStart] = useSelectedWeek();
  const { zoneId } = useZoneWeekParams();
  const userUuids = useDriverUserUuids(zoneId);
  const { drivers, isLoading } = useChecks().driverAvailability;

  if (!zoneId) {
    return <p className="text-sm text-gray-500">Select a zone to see its drivers.</p>;
  }
  if (isLoading) return <p className="text-sm text-gray-500">Loading…</p>;
  if (drivers.length === 0) {
    return (
      <p className="text-sm text-gray-500">
        No drivers in this zone are scheduled or marked unavailable this week.
      </p>
    );
  }

  return (
    <DriverWeekGrid
      weekStart={weekStart}
      renderDriverActions={(driver) => (
        <DriverLinksMenu
          userUuid={userUuids.get(driver.driverUuid)}
          weekStart={weekStart}
          driverName={driver.driverName}
        />
      )}
      drivers={drivers}
      renderDay={(day) => <AvailabilityCell day={day} />}
      renderDriverStatus={(driver) =>
        driver.ok ? (
          <Check className="h-4 w-4 shrink-0 text-green-600" aria-label="No conflicts" />
        ) : (
          <X
            className="h-4 w-4 shrink-0 text-red-600"
            aria-label="Scheduled on an unavailable day"
          />
        )
      }
      testId="driver-availability"
    />
  );
}
