import { Suspense } from "react";
import { AutoPlanLanding } from "@/features/autoWorkTrackers/components/AutoPlanLanding";

export default function Page() {
  return (
    <Suspense>
      <AutoPlanLanding />
    </Suspense>
  );
}
