import { Suspense } from "react";
import { EventBleacherRequirementsTab } from "@/features/scheduleValidator/components/EventBleacherRequirementsTab";

export default function Page() {
  return (
    <Suspense>
      <EventBleacherRequirementsTab />
    </Suspense>
  );
}
