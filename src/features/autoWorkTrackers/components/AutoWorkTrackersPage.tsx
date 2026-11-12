"use client";

import { useState } from "react";
import { PageHeader } from "@/components/PageHeader";
import { currentWeekStart } from "../utils/week";
import { GenerateWorkTrackersButton } from "./GenerateWorkTrackersButton";
import { WeekGrid } from "./WeekGrid";
import { ZoneWeekPicker } from "./ZoneWeekPicker";

/**
 * Pick one zone and one week (Monday to Sunday) and see that zone's bleachers laid out across the
 * week's seven days, as on the dashboard. The tiles are blank for now. The button asks the Python
 * service to create a draft work tracker for each trip the zone needs that week.
 */
export function AutoWorkTrackersPage() {
  const [zoneId, setZoneId] = useState<string>("");
  const [weekStart, setWeekStart] = useState<string>(currentWeekStart);

  return (
    <>
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

      {zoneId && <WeekGrid zoneId={zoneId} weekStart={weekStart} />}
    </>
  );
}
