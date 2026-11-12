import { Suspense } from "react";
import { DriverAvailabilityTab } from "@/features/scheduleValidator/components/DriverAvailabilityTab";

export default function Page() {
  return (
    <Suspense>
      <DriverAvailabilityTab />
    </Suspense>
  );
}
