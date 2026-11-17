import { Suspense, type ReactNode } from "react";
import { AutoWorkTrackersShell } from "@/features/autoWorkTrackers/components/AutoWorkTrackersShell";

export default function Layout({ children }: { children: ReactNode }) {
  return (
    <div className="flex h-full min-h-0 flex-col p-4">
      {/* The shell reads the zone and week from the address, which needs a Suspense boundary. */}
      <Suspense>
        <AutoWorkTrackersShell>{children}</AutoWorkTrackersShell>
      </Suspense>
    </div>
  );
}
