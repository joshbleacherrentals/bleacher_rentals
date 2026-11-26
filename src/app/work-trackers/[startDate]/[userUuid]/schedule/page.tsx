"use client";

import { useParams } from "next/navigation";
import { DriverSchedule } from "@/features/driverSchedule/components/DriverSchedule";

/** The driver's week as a schedule grid, opened from their work tracker week. */
export default function Page() {
  const params = useParams();
  const startDate = params.startDate as string;
  const userUuid = params.userUuid as string;
  return (
    <DriverSchedule
      userUuid={userUuid}
      weekStart={startDate}
      backHref={`/work-trackers/${startDate}/${userUuid}`}
      backLabel="Back to work trackers"
    />
  );
}
