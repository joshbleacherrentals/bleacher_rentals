"use client";

import { useState, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { PanelLeftOpen } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { cn } from "@/lib/utils";
import { useZoneWeekParams } from "../hooks/useZoneWeekParams";
import { AREAS, locatePage, type AreaKey } from "../utils/pages";
import { AutoWorkTrackersSidebar } from "./AutoWorkTrackersSidebar";
import { ChecksProvider } from "./ChecksProvider";

/**
 * The frame of a planning tab (Verify, Auto Generate): the folding side panel
 * (zone, week and the tab's pages) on the left, and the open page on the right under its title. It
 * stays mounted as the page changes, so the zone, week and panel state carry across pages. Verify and
 * Auto Generate run every check once here (ChecksProvider), feeding both the panel's badges
 * and the open page. Auto Generate's landing page draws its own header.
 */
export function AutoWorkTrackersShell({
  areaKey,
  children,
}: {
  areaKey: AreaKey;
  children: ReactNode;
}) {
  const area = AREAS[areaKey];
  const pathname = usePathname();
  const { zoneId, weekStart, setZoneId, setWeekStart } = useZoneWeekParams();
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const activePage = locatePage(pathname)?.page ?? null;
  const toggle = () => setSidebarOpen((o) => !o);
  const ownHeader = areaKey === "auto" && activePage?.slug === "";

  const frame = (
    <div className="flex h-full min-h-0">
      <AutoWorkTrackersSidebar
        area={area}
        isOpen={sidebarOpen}
        onToggle={toggle}
        activeSlug={activePage?.slug}
        zoneId={zoneId}
        weekStart={weekStart}
        onZoneChange={setZoneId}
        onWeekChange={setWeekStart}
      />

      {/* min-w-0 lets this column shrink below its content, so wide pages scroll inside it. */}
      {/* Auto Generate's landing fills the column edge to edge, so it gets no padding. */}
      <main className={cn("relative flex min-h-0 min-w-0 flex-1 flex-col", !ownHeader && "p-4")}>
        <div className={cn("flex items-start gap-2", ownHeader && "absolute top-4 left-4 z-10")}>
          {!sidebarOpen && (
            <button
              type="button"
              onClick={toggle}
              title="Show panel"
              aria-label="Show panel"
              aria-expanded={false}
              className="mt-1 cursor-pointer rounded p-1 text-gray-500 hover:bg-gray-200"
            >
              <PanelLeftOpen className="h-5 w-5" />
            </button>
          )}
          {!ownHeader && (
            <div className="flex-1">
              <PageHeader
                title={activePage?.label ?? area.label}
                subtitle={activePage?.description}
              />
            </div>
          )}
        </div>

        {/* The page fills the rest of the height and scrolls inside itself, never the whole page. */}
        <div className="min-h-0 flex-1 overflow-auto">{children}</div>
      </main>
    </div>
  );

  return (
    <ChecksProvider zoneId={zoneId} weekStart={weekStart}>
      {frame}
    </ChecksProvider>
  );
}
