import { Suspense, type ReactNode } from "react";
import { WorkTrackersTabs } from "@/features/workTrackers/components/WorkTrackersTabs";

/**
 * Work Trackers: the tabs across the top (Weeks, Plan Check, Auto Plan, Proof of Delivery), then
 * the open tab filling the rest of the height. Weeks keeps its own layout in (weeks).
 */
export default function Layout({ children }: { children: ReactNode }) {
  return (
    <div className="flex h-full min-h-0 flex-col">
      <Suspense>
        <WorkTrackersTabs />
      </Suspense>
      <div className="min-h-0 flex-1 overflow-auto">{children}</div>
    </div>
  );
}
