"use client";

import { Check, X } from "lucide-react";
import { useDriverAvailability } from "../hooks/useDriverAvailability";
import { useSelectedWeek } from "../hooks/useSelectedWeek";
import { formatDateRange } from "../utils/formatDateRange";

/**
 * Every work tracker with a driver in the selected week: the date, where it goes from and to, and
 * the driver. A check means the driver has not marked that date as unavailable.
 */
export function DriverAvailabilityTab() {
  const [weekStart] = useSelectedWeek();
  const { trips, isLoading } = useDriverAvailability(weekStart);

  if (isLoading) return <p className="text-sm text-gray-500">Loading…</p>;
  if (trips.length === 0) {
    return <p className="text-sm text-gray-500">No work trackers with a driver this week.</p>;
  }

  return (
    <ul className="flex flex-col text-sm" data-testid="driver-availability">
      {trips.map((trip) => (
        <li key={trip.workTrackerId} className="flex items-center gap-3 border-b py-2">
          {trip.available ? (
            <Check className="h-4 w-4 shrink-0 text-green-600" aria-label="Driver is available" />
          ) : (
            <X className="h-4 w-4 shrink-0 text-red-600" aria-label="Driver is unavailable" />
          )}
          <span className="w-16 shrink-0 text-gray-600">
            {formatDateRange(trip.date, trip.date)}
          </span>
          <span className="w-40 shrink-0 font-medium">{trip.driverName}</span>
          <span>
            {trip.fromStreet ?? "No pick-up address"} → {trip.toStreet ?? "No drop-off address"}
          </span>
        </li>
      ))}
    </ul>
  );
}
