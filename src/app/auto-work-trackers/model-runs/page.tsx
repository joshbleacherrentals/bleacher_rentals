import { Suspense } from "react";
import { ModelRunsTab } from "@/features/autoWorkTrackers/components/ModelRunsTab";

export default function Page() {
  return (
    <Suspense>
      <ModelRunsTab />
    </Suspense>
  );
}
