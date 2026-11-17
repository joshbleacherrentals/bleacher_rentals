"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { PageHeader } from "@/components/PageHeader";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useZoneWeekParams } from "../hooks/useZoneWeekParams";
import { AUTO_WORK_TRACKERS_TABS, tabFromPathname, tabHref } from "../utils/tabs";
import { GenerateWorkTrackersButton } from "./GenerateWorkTrackersButton";
import { ZoneWeekPicker } from "./ZoneWeekPicker";

/**
 * The frame of every Auto Work Trackers tab: the title, the zone and week pickers with the Create
 * work trackers button, and the tab bar, with the selected tab's page below. It stays mounted as the tab changes, so the zone and week
 * carry across tabs.
 */
export function AutoWorkTrackersShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { zoneId, weekStart, setZoneId, setWeekStart } = useZoneWeekParams();
  const activeSlug = tabFromPathname(pathname)?.slug;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <PageHeader title="Auto Work Trackers" />
      <ZoneWeekPicker
        idPrefix="auto-work-trackers"
        zoneId={zoneId}
        weekStart={weekStart}
        onZoneChange={setZoneId}
        onWeekChange={setWeekStart}
      >
        <GenerateWorkTrackersButton zoneId={zoneId} weekStart={weekStart} />
      </ZoneWeekPicker>

      <Tabs value={activeSlug} className="mt-4">
        <TabsList>
          {AUTO_WORK_TRACKERS_TABS.map((tab) => (
            <TabsTrigger key={tab.slug} value={tab.slug} asChild>
              <Link href={tabHref(tab, zoneId, weekStart)}>{tab.label}</Link>
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      {/* The tab fills the rest of the height and scrolls inside itself, never the whole page. */}
      <div className="mt-4 min-h-0 flex-1 overflow-auto">{children}</div>
    </div>
  );
}
