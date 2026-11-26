import { Suspense } from "react";
import { EventDashboardTab } from "@/features/eventDashboard/components/EventDashboardTab";

export default function Page() {
  return (
    <Suspense>
      <EventDashboardTab />
    </Suspense>
  );
}
