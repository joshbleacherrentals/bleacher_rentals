import { Suspense } from "react";
import PerformancePage from "@/features/performanceStats/components/PerformancePage";

export default function Page() {
  // `useSearchParams` in the page needs a Suspense boundary above it.
  return (
    <Suspense>
      <PerformancePage />
    </Suspense>
  );
}
