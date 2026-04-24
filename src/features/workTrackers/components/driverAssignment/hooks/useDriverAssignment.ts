// hooks/useDriverAssignment.ts
// Fetches data from Supabase, calls the optimizer, and returns ranked suggestions.

import { useState, useCallback } from "react";
import { useClerkSupabaseClient } from "@/utils/supabase/useClerkSupabaseClient";
import {
  AssignmentResponse,
  TripAssignment,
} from "../lib/types/DriverAssignment";
import {
  fetchDriverInputsForAccountManager,
  fetchTripInputs,
} from "../lib/fetchAssignmentData";

const OPTIMIZER_URL =
  process.env.NEXT_PUBLIC_OPTIMIZER_URL ?? "http://localhost:8000";

export type UseDriverAssignmentResult = {
  suggest: (params: {
    workTrackerIds: string[];
    accountManagerUuid: string;
  }) => Promise<AssignmentResponse | null>;
  assignments: TripAssignment[];
  isLoading: boolean;
  error: string | null;
  reset: () => void;
};

export function useDriverAssignment(): UseDriverAssignmentResult {
  const supabase = useClerkSupabaseClient();
  const [assignments, setAssignments] = useState<TripAssignment[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const suggest = useCallback(
    async ({
      workTrackerIds,
      accountManagerUuid,
    }: {
      workTrackerIds: string[];
      accountManagerUuid: string;
    }): Promise<AssignmentResponse | null> => {
      setIsLoading(true);
      setError(null);

      try {
        // 1. Fetch trip + driver data in parallel
        const [tripInputs, driverInputs] = await Promise.all([
          fetchTripInputs(supabase, workTrackerIds),
          fetchDriverInputsForAccountManager(supabase, accountManagerUuid),
        ]);

        // 2. Stamp account_manager_uuid onto each trip
        const tripsWithAM = tripInputs.map((t) => ({
          ...t,
          account_manager_uuid: accountManagerUuid,
        }));

        // 3. Call the optimizer
        const res = await fetch(`${OPTIMIZER_URL}/assign`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ trips: tripsWithAM, drivers: driverInputs }),
        });

        if (!res.ok) {
          const detail = await res.text();
          throw new Error(`Optimizer error ${res.status}: ${detail}`);
        }

        const result: AssignmentResponse = await res.json();
        setAssignments(result.assignments);
        return result;
      } catch (e: any) {
        setError(e.message ?? "Unknown error");
        return null;
      } finally {
        setIsLoading(false);
      }
    },
    [supabase],
  );

  const reset = useCallback(() => {
    setAssignments([]);
    setError(null);
  }, []);

  return { suggest, assignments, isLoading, error, reset };
}