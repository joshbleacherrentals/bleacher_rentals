import { Suspense } from "react";
import { EventDataTab } from "@/features/scheduleValidator/components/EventDataTab";

export default function Page() {
  return (
    <Suspense>
      <EventDataTab />
    </Suspense>
  );
}
