"use client";

import { useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { useClerkSupabaseClient } from "@/utils/supabase/useClerkSupabaseClient";
import LoadingSpinner from "@/components/LoadingSpinner";
import { fetchDriverMileage } from "../db/fetchDriverMileage";
import { getTimeRangeDates, getPeriodLabel } from "../util";
import { TimeRange } from "../types";
import DriverTimeRangeToggle from "./DriverTimeRangeToggle";
import FleetOverview from "./FleetOverview";
import DriverMileageTable from "./DriverMileageTable";

export default function DriverScorecardPage() {
  const searchParams = useSearchParams();
  const supabase = useClerkSupabaseClient();
  const activeRange = (searchParams.get("timeRange") as TimeRange) ?? "weekly";
  const periodLabel = getPeriodLabel(activeRange);

  const thisPeriodDates = getTimeRangeDates(activeRange, "this");
  const lastPeriodDates = getTimeRangeDates(activeRange, "last");

  const { data: currentData, isLoading: currentLoading } = useQuery({
    queryKey: ["driver-mileage", "current", activeRange, thisPeriodDates.startDate],
    queryFn: () => fetchDriverMileage(supabase, thisPeriodDates.startDate, thisPeriodDates.endDate),
    enabled: !!supabase,
  });

  const { data: previousData, isLoading: previousLoading } = useQuery({
    queryKey: ["driver-mileage", "previous", activeRange, lastPeriodDates.startDate],
    queryFn: () => fetchDriverMileage(supabase, lastPeriodDates.startDate, lastPeriodDates.endDate),
    enabled: !!supabase,
  });

  const isLoading = currentLoading || previousLoading;

  return (
    <div className="p-4">
      <div className="flex items-start justify-between mb-6">
        <div>
          <div className="text-5xl text-darkBlue font-bold">Driver Scorecard</div>
          <div className="text-2xl text-gray-500 font-medium">Mileage & Activity Tracking</div>
        </div>
        <DriverTimeRangeToggle />
      </div>

      {isLoading ? (
        <div className="flex justify-center py-20">
          <LoadingSpinner />
        </div>
      ) : currentData ? (
        <>
          <FleetOverview data={currentData} periodLabel={periodLabel} />
          <DriverMileageTable
            currentData={currentData}
            previousData={previousData ?? null}
            periodLabel={periodLabel}
          />
        </>
      ) : null}
    </div>
  );
}
