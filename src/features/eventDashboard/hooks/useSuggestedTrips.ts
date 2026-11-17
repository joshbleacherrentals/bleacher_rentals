"use client";

import { useCallback, useEffect, useState } from "react";
import { acceptTrips, suggestTrips } from "../api/pythonTrips";
import { tripsInWeek, withoutTrips, type SuggestedTrip } from "../utils/suggestions";

/**
 * The trips the Python service suggests for a zone and week, and accepting them. Suggestions are
 * asked for with `suggest` (the service is not called on its own) and cleared when the zone or week
 * changes. Accepting creates the work tracker; the trip then leaves the list, and the new work
 * tracker arrives through sync like any other.
 */
export function useSuggestedTrips(zoneId: string, weekStart: string) {
  const [trips, setTrips] = useState<SuggestedTrip[]>([]);
  const [loading, setLoading] = useState(false);
  const [accepting, setAccepting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setTrips([]);
    setError(null);
  }, [zoneId, weekStart]);

  const suggest = useCallback(async () => {
    if (!zoneId) return;
    setLoading(true);
    setError(null);
    try {
      setTrips(await suggestTrips({ zoneId, weekStart }));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Request failed.");
    } finally {
      setLoading(false);
    }
  }, [zoneId, weekStart]);

  const accept = useCallback(
    async (toAccept: SuggestedTrip[]) => {
      // Only days inside the selected week can be created, whatever was asked for.
      const allowed = tripsInWeek(toAccept, weekStart);
      if (allowed.length === 0) return;
      setAccepting(true);
      setError(null);
      try {
        await acceptTrips({ weekStart, trips: allowed });
        // Created or already there: either way the suggestion is done.
        setTrips((current) => withoutTrips(current, allowed));
      } catch (e) {
        setError(e instanceof Error ? e.message : "Request failed.");
      } finally {
        setAccepting(false);
      }
    },
    [weekStart],
  );

  return { trips, loading, accepting, error, suggest, accept };
}
