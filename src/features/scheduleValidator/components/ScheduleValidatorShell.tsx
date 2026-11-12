"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { PageHeader } from "@/components/PageHeader";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ZoneWeekPicker } from "@/features/autoWorkTrackers/components/ZoneWeekPicker";
import { useSelectedWeek } from "../hooks/useSelectedWeek";
import { SCHEDULE_VALIDATOR_TABS, tabFromPathname, tabHref } from "../utils/tabs";

/**
 * The frame of every Schedule Validator tab: the title, the week picker, and the tab bar, with the
 * selected tab's page below. It stays mounted as the tab changes, so the week carries across tabs.
 */
export function ScheduleValidatorShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [weekStart, setWeekStart] = useSelectedWeek();
  const activeSlug = tabFromPathname(pathname)?.slug;

  return (
    <>
      <PageHeader title="Schedule Validator" />
      <ZoneWeekPicker
        idPrefix="schedule-validator"
        weekStart={weekStart}
        onWeekChange={setWeekStart}
      />

      <Tabs value={activeSlug} className="mt-4">
        <TabsList>
          {SCHEDULE_VALIDATOR_TABS.map((tab) => (
            <TabsTrigger key={tab.slug} value={tab.slug} asChild>
              <Link href={tabHref(tab, weekStart)}>{tab.label}</Link>
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      <div className="mt-4">{children}</div>
    </>
  );
}
