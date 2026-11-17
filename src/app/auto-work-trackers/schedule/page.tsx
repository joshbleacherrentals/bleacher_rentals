import { Suspense } from "react";
import { ScheduleTab } from "@/features/autoWorkTrackers/components/ScheduleTab";

export default function Page() {
  return (
    <Suspense>
      <ScheduleTab />
    </Suspense>
  );
}
