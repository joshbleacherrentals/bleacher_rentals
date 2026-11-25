import { Suspense } from "react";
import { DriverDataTab } from "@/features/scheduleValidator/components/DriverDataTab";

export default function Page() {
  return (
    <Suspense>
      <DriverDataTab />
    </Suspense>
  );
}
