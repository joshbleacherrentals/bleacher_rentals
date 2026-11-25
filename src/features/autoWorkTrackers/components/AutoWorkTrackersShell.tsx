"use client";

import { useState, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { PanelLeftOpen } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { useZoneWeekParams } from "../hooks/useZoneWeekParams";
import { pageFromPathname } from "../utils/pages";
import { AutoWorkTrackersSidebar } from "./AutoWorkTrackersSidebar";
import { ChecksProvider } from "./ChecksProvider";

/**
 * The frame of every Auto Work Trackers page: the folding side panel (zone, week, Create work
 * trackers and the page list) on the left, and the open page on the right under its title. It stays
 * mounted as the page changes, so the zone, week and panel state carry across pages. Every check
 * runs once here (ChecksProvider), feeding both the panel's badges and the open page.
 */
export function AutoWorkTrackersShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { zoneId, weekStart, setZoneId, setWeekStart } = useZoneWeekParams();
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const activePage = pageFromPathname(pathname);
  const toggle = () => setSidebarOpen((o) => !o);

  return (
    <ChecksProvider zoneId={zoneId} weekStart={weekStart}>
      <div className="flex h-full min-h-0">
        <AutoWorkTrackersSidebar
          isOpen={sidebarOpen}
          onToggle={toggle}
          activeSlug={activePage?.slug}
          zoneId={zoneId}
          weekStart={weekStart}
          onZoneChange={setZoneId}
          onWeekChange={setWeekStart}
        />

        {/* min-w-0 lets this column shrink below its content, so wide pages scroll inside it. */}
        <main className="flex min-h-0 min-w-0 flex-1 flex-col p-4">
          <div className="flex items-start gap-2">
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
            <div className="flex-1">
              <PageHeader title={activePage?.label ?? "Auto Work Trackers"} />
            </div>
          </div>

          {/* The page fills the rest of the height and scrolls inside itself, never the whole page. */}
          <div className="min-h-0 flex-1 overflow-auto">{children}</div>
        </main>
      </div>
    </ChecksProvider>
  );
}
