// components/DriverSuggestion.tsx
// Drop this inside WorkTrackerModal next to the Driver dropdown.

import React from "react";
import { Sparkles, AlertTriangle, CheckCircle, Loader2 } from "lucide-react";
import { TripAssignment } from "./lib/types/DriverAssignment";

type Props = {
  assignment: TripAssignment | null;
  isLoading: boolean;
  error: string | null;
  onAccept: (driverUuid: string) => void;
};

export function DriverSuggestion({ assignment, isLoading, error, onAccept }: Props) {
  if (isLoading) {
    return (
      <div className="flex items-center gap-2 mt-1 text-xs text-gray-500 bg-gray-50 rounded p-2 border">
        <Loader2 className="h-3 w-3 animate-spin" />
        Finding best driver…
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center gap-2 mt-1 text-xs text-red-600 bg-red-50 rounded p-2 border border-red-200">
        <AlertTriangle className="h-3 w-3 shrink-0" />
        {error}
      </div>
    );
  }

  if (!assignment) return null;

  const roundTripKm = (assignment.total_cost_meters / 1000).toFixed(1);
  const leg1Km = (assignment.leg_home_to_pickup_meters / 1000).toFixed(1);
  const tripKm = (assignment.leg_pickup_to_dropoff_meters / 1000).toFixed(1);

  return (
    <div className="mt-1 rounded border border-blue-200 bg-blue-50 p-2 text-xs space-y-1">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1 font-semibold text-blue-800">
          <Sparkles className="h-3 w-3" />
          Suggested: {assignment.suggested_driver_name}
        </div>
        <button
          type="button"
          onClick={() => onAccept(assignment.suggested_driver_uuid)}
          className="flex items-center gap-1 text-xs font-medium text-white bg-blue-600 hover:bg-blue-700 transition rounded px-2 py-0.5"
        >
          <CheckCircle className="h-3 w-3" />
          Use
        </button>
      </div>

      {/* Distance breakdown */}
      <div className="text-blue-700 leading-relaxed">
        <span className="font-medium">Round trip: {roundTripKm} km</span>
        <span className="mx-1 text-blue-400">·</span>
        Home→Pickup {leg1Km} km
        <span className="mx-1 text-blue-400">+</span>
        Trip {tripKm} km
      </div>

      {/* Swap warning */}
      {assignment.swap_warning && (
        <div className="flex items-start gap-1 rounded bg-yellow-50 border border-yellow-300 p-1.5 text-yellow-800">
          <AlertTriangle className="h-3 w-3 mt-0.5 shrink-0" />
          <p>{assignment.swap_warning.message}</p>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Suggest button — place near the Driver dropdown label
// ---------------------------------------------------------------------------
type SuggestButtonProps = {
  onClick: () => void;
  isLoading: boolean;
  disabled?: boolean;
};

export function SuggestDriverButton({ onClick, isLoading, disabled }: SuggestButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled || isLoading}
      className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800 disabled:opacity-40 transition-colors"
    >
      {isLoading ? (
        <Loader2 className="h-3 w-3 animate-spin" />
      ) : (
        <Sparkles className="h-3 w-3" />
      )}
      Suggest driver
    </button>
  );
}