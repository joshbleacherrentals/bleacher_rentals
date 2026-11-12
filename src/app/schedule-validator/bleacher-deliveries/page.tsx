import { Suspense } from "react";
import { LogisticsPlansTab } from "@/features/scheduleValidator/components/LogisticsPlansTab";

export default function Page() {
  return (
    <Suspense>
      <LogisticsPlansTab />
    </Suspense>
  );
}
