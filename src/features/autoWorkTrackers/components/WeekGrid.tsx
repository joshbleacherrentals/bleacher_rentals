"use client";

import { DateTime } from "luxon";
import LoadingSpinner from "@/components/LoadingSpinner";
import { useZoneBleachers } from "../hooks/useZoneBleachers";
import { weekDays } from "../utils/week";
import { BleacherLabelCell, tileBackground } from "./BleacherLabelCell";

// Sizes and colours copied from the Pixi dashboard (values/constants.ts, ui/HeaderCell.ts).
const LABEL_COLUMN_WIDTH = 175;
const HEADER_HEIGHT = 40;
const HEADER_BACKGROUND = { today: "#ffe020", weekend: "#d1d5db", weekday: "#e5e7eb" };

const LINES = "border-r border-b border-black/15";

function DayHeaderCell({ isoDate, todayIso }: { isoDate: string; todayIso: string }) {
  const day = DateTime.fromISO(isoDate);
  const background =
    isoDate === todayIso
      ? HEADER_BACKGROUND.today
      : day.weekday >= 6
        ? HEADER_BACKGROUND.weekend
        : HEADER_BACKGROUND.weekday;

  return (
    <div className={`bg-white ${LINES}`} style={{ height: HEADER_HEIGHT }}>
      <div
        className="flex h-[39px] w-[calc(100%-1px)] flex-col items-center justify-center"
        style={{ background }}
      >
        <span className="text-[13px] font-semibold leading-4 text-gray-900">
          {day.toFormat("EEE, MMM d")}
        </span>
        <span className="text-[11px] font-light leading-3 text-gray-400">
          {day.toFormat("yyyy")}
        </span>
      </div>
    </div>
  );
}

/**
 * The week as the dashboard lays it out, but in plain React: a label column of bleachers and one
 * column for each day, Monday to Sunday. It never scrolls sideways (the seven days share the width
 * left of the labels) and grows downward with the page. The tiles are blank for now: work trackers
 * and event spans will be drawn into them the way the dashboard draws them.
 */
export function WeekGrid({ zoneId, weekStart }: { zoneId: string; weekStart: string }) {
  const { bleachers, isLoading } = useZoneBleachers(zoneId);

  if (isLoading) return <LoadingSpinner />;

  const days = weekDays(weekStart);
  const todayIso = DateTime.now().toISODate()!;

  return (
    <div className="mt-6">
      <div
        className="grid w-full"
        style={{ gridTemplateColumns: `${LABEL_COLUMN_WIDTH}px repeat(7, minmax(0, 1fr))` }}
        data-testid="week-grid"
      >
        <div
          className={`flex items-end bg-white p-[5px] ${LINES}`}
          style={{ height: HEADER_HEIGHT }}
        >
          <span className="text-base font-bold leading-none text-[#333]">Bleachers</span>
        </div>
        {days.map((day) => (
          <DayHeaderCell key={day} isoDate={day} todayIso={todayIso} />
        ))}

        {bleachers.map((bleacher) => (
          <div key={bleacher.bleacherUuid} className="contents">
            <BleacherLabelCell bleacher={bleacher} />
            {days.map((day) => (
              <div
                key={day}
                className={`h-[50px] ${LINES}`}
                style={{ background: tileBackground(bleacher.isAccessible) }}
                data-testid="week-grid-tile"
              />
            ))}
          </div>
        ))}
      </div>
      {bleachers.length === 0 && (
        <p className="mt-3 text-sm text-gray-500">This zone has no bleachers.</p>
      )}
    </div>
  );
}
