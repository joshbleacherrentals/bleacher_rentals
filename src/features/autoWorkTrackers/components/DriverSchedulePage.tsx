"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { DriverSchedule } from "@/features/driverSchedule/components/DriverSchedule";
import { useZoneWeekParams } from "../hooks/useZoneWeekParams";
import { AREAS, locatePage, scheduleBackHref } from "../utils/pages";

/** One driver's week as a grid, opened from a driver's menu in Plan Check or Auto Plan. */
export function DriverSchedulePage() {
  const searchParams = useSearchParams();
  const area = locatePage(usePathname())?.area ?? AREAS.check;
  const { zoneId, weekStart } = useZoneWeekParams();
  const userUuid = searchParams.get("user");
  const backHref = scheduleBackHref(area, searchParams.get("from"), zoneId, weekStart);

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
