import { Suspense, type ReactNode } from "react";
import { AutoWorkTrackersShell } from "@/features/autoWorkTrackers/components/AutoWorkTrackersShell";

export default function Layout({ children }: { children: ReactNode }) {
  return (
    // The shell reads the zone and week from the address, which needs a Suspense boundary.
    <Suspense>
      <AutoWorkTrackersShell areaKey="check">{children}</AutoWorkTrackersShell>
    </Suspense>
  );
}
