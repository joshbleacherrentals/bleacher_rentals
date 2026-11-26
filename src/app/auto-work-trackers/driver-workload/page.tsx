import { Suspense } from "react";
import { DriverWorkloadTab } from "@/features/scheduleValidator/components/DriverWorkloadTab";

export default function Page() {
  return (
    <Suspense>
      <DriverWorkloadTab />
    </Suspense>
  );
}
