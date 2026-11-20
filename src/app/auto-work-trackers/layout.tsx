import { Suspense, type ReactNode } from "react";
import { AutoWorkTrackersShell } from "@/features/autoWorkTrackers/components/AutoWorkTrackersShell";

export default function Layout({ children }: { children: ReactNode }) {
  return (
    // No padding: the side panel sits flush against the app sidebar and header, and the page column
    // puts its own padding back.
    <div className="h-full min-h-0">
      {/* The shell reads the zone and week from the address, which needs a Suspense boundary. */}
      <Suspense>
        <AutoWorkTrackersShell>{children}</AutoWorkTrackersShell>
      </Suspense>
    </div>
  );
}
