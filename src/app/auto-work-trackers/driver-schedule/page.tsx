"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { useZoneWeekParams } from "@/features/autoWorkTrackers/hooks/useZoneWeekParams";
import { scheduleBackHref } from "@/features/autoWorkTrackers/utils/pages";
import { DriverSchedule } from "@/features/driverSchedule/components/DriverSchedule";

function DriverSchedulePage() {
  const searchParams = useSearchParams();
  const { zoneId, weekStart } = useZoneWeekParams();
  const userUuid = searchParams.get("user");
  const backHref = scheduleBackHref(searchParams.get("from"), zoneId, weekStart);

  if (!userUuid) {
    return <p className="text-sm text-gray-500">Open a driver&apos;s schedule from their menu.</p>;
  }
  return (
    <DriverSchedule
      userUuid={userUuid}
      weekStart={weekStart}
      backHref={backHref}
      backLabel="Back"
    />
  );
}

export default function Page() {
  return (
    <Suspense>
      <DriverSchedulePage />
    </Suspense>
  );
}
