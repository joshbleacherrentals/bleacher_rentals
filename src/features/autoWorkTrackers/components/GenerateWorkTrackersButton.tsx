"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useClerkSupabaseClient } from "@/utils/supabase/useClerkSupabaseClient";
import { planWeek, type PlanWeekResult } from "../planner/planWeek";
import { summarizeUnassigned } from "../utils/unassignedSummary";

/**
 * Creates the work trackers the chosen zone needs in the chosen week (planWeek): each with its
 * driver, day, order in the day, suggested times, road distances, and its Hauling, Setup and
 * Teardown line items.
 */
export function GenerateWorkTrackersButton({
  zoneId,
  weekStart,
  fullWidth = false,
}: {
  zoneId: string;
  weekStart: string;
  fullWidth?: boolean;
}) {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<PlanWeekResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const supabase = useClerkSupabaseClient();

  const handleClick = async () => {
    if (!supabase) return;
    setLoading(true);
    setResult(null);
    setError(null);
    try {
      setResult(
        await planWeek({
          zoneId,
          weekStart,
          tz: Intl.DateTimeFormat().resolvedOptions().timeZone,
          supabase,
        }),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Request failed.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col gap-1">
      <Button
        onClick={handleClick}
        disabled={!zoneId || loading || !supabase}
        size={fullWidth ? "lg" : "default"}
        className={fullWidth ? "w-full" : undefined}
      >
        {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
        Create work trackers
      </Button>
      {error && <p className="text-sm text-red-600">{error}</p>}
      {result && (
        <div className="text-sm text-gray-600" data-testid="generate-work-trackers-result">
          <p>
            Created {result.created} draft work tracker{result.created === 1 ? "" : "s"} for{" "}
            {result.bleachers} bleacher{result.bleachers === 1 ? "" : "s"}, on {result.driverDays}{" "}
            driver-day{result.driverDays === 1 ? "" : "s"}.
          </p>
          {result.alreadyPlanned > 0 && (
            <p className="text-xs text-gray-500" data-testid="generate-work-trackers-already">
              {result.alreadyPlanned} trip{result.alreadyPlanned === 1 ? " was" : "s were"} left
              out: a work tracker already makes {result.alreadyPlanned === 1 ? "it" : "them"}.
            </p>
          )}
          <p className="text-xs text-gray-500" data-testid="generate-work-trackers-travel">
            Road times: {result.road.google + result.road.cached} from Google ({result.road.cached}{" "}
            cached){result.road.estimated > 0 && `, ${result.road.estimated} estimated`}. Hauling
            pay added to {result.withHauling} of {result.created}, plus {result.setups} setup
            {result.setups === 1 ? "" : "s"} and {result.teardowns} teardown
            {result.teardowns === 1 ? "" : "s"}.
          </p>
          {result.unplaced.length > 0 && (
            <p className="text-amber-700" data-testid="generate-work-trackers-unassigned">
              {summarizeUnassigned(result.unplaced)}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
