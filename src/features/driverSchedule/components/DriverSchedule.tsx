"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { DateTime } from "luxon";
import { weekEndOf } from "@/features/autoWorkTrackers/utils/week";
import { MapCanvas } from "@/features/autoWorkTrackers/components/TripMap";
import type { DriverLoops } from "@/features/autoWorkTrackers/utils/tripMap";
import { useDriverSchedule } from "../hooks/useDriverSchedule";
import { DAY_MINUTES, duration, type ScheduleSpan } from "../utils/scheduleLayout";

const HOURS = Array.from({ length: 24 }, (_, h) => h);
const STRIPES =
  "repeating-linear-gradient(45deg, rgba(255,255,255,0.45) 0 4px, transparent 4px 8px)";

const pct = (minutes: number) => `${(minutes / DAY_MINUTES) * 100}%`;
const hourLabel = (h: number) =>
  h === 0 ? "12a" : h < 12 ? `${h}a` : h === 12 ? "12p" : `${h - 12}p`;

function Span({ span }: { span: ScheduleSpan }) {
  const haul = span.kind === "haul";
  const width = span.end - span.start;
  return (
    <div
      className={`absolute top-2 bottom-2 overflow-hidden rounded-sm text-[11px] leading-[1.6rem] whitespace-nowrap ${
        haul ? "bg-blue-600 px-1 text-white" : "border border-gray-400 bg-gray-300"
      }`}
      style={{
        left: pct(span.start),
        width: pct(width),
        backgroundImage: span.estimated ? STRIPES : undefined,
      }}
      title={span.title}
      data-testid={`schedule-span-${span.kind}`}
      data-estimated={span.estimated}
    >
      {haul && width >= 45 ? span.title.split(" · ")[0] : null}
    </div>
  );
}

const km = (n: number) => `${Math.round(n).toLocaleString()} km`;

/** The selected day's route on the map: from home, through each trip, and home. */
function DayRoute({ date, loops }: { date: string | undefined; loops: DriverLoops[] }) {
  const trips = loops.reduce((sum, l) => sum + l.trips, 0);
  const hauling = loops.reduce((sum, l) => sum + l.haulingKm, 0);
  const deadhead = loops.reduce((sum, l) => sum + l.deadheadKm, 0);
  const incomplete = loops.reduce((sum, l) => sum + l.incomplete, 0);
  return (
    <aside
      className="sticky top-0 flex w-[40%] min-w-[320px] shrink-0 flex-col gap-2"
      data-testid="driver-schedule-map"
    >
      <div className="text-sm">
        <span className="font-semibold">
          {date ? DateTime.fromISO(date).toFormat("EEEE, MMM d") : "No day"}
        </span>
        {trips > 0 ? (
          <span className="text-gray-600">
            {" "}
            · {trips} trip{trips === 1 ? "" : "s"} · hauling {km(hauling)} · deadhead {km(deadhead)}{" "}
            (straight line)
          </span>
        ) : (
          <span className="text-gray-500"> · no trips</span>
        )}
      </div>
      {incomplete > 0 && (
        <p className="text-xs text-amber-700">
          {incomplete} trip{incomplete === 1 ? " is" : "s are"} missing coordinates, so some lines
          are not drawn.
        </p>
      )}
      <div className="h-[460px]">
        <MapCanvas loops={loops} showDeadhead />
      </div>
      <p className="text-xs text-gray-500">
        Solid: hauling, with an arrow. Dashed: deadhead. Click a day in the schedule to see its
        route.
      </p>
    </aside>
  );
}

/**
 * A driver's week as a grid: a row per day (always seven) and the 24 hours across, each work tracker
 * painted where it happens, with the deadhead in, the haul and the drive home as wide as their drive
 * times (layoutSchedule). Striped spans are estimates, placed as early as they can be because the
 * tracker has no planned times. Clicking a day shows its route on the map beside the grid (the
 * Dashboard map's drawing, for this driver alone). Used inside Auto Work Trackers and on the driver's
 * work tracker week.
 */
export function DriverSchedule({
  userUuid,
  weekStart,
  backHref,
  backLabel,
}: {
  userUuid: string;
  weekStart: string;
  backHref: string;
  backLabel: string;
}) {
  const { days, routesByDay, driverName, isLoading } = useDriverSchedule(userUuid, weekStart);
  const [picked, setPicked] = useState<string | null>(null);
  // The day shown on the map: the one clicked, else the first day with trips, else Monday.
  const selected =
    (picked && days.some((d) => d.date === picked) ? picked : null) ??
    days.find((d) => d.trips > 0)?.date ??
    days[0]?.date;
  const range = `${DateTime.fromISO(weekStart).toFormat("EEE, MMM d")} – ${DateTime.fromISO(
    weekEndOf(weekStart),
  ).toFormat("EEE, MMM d")}`;
  const trips = days.reduce((sum, d) => sum + d.trips, 0);

  return (
    <div className="flex flex-col gap-3" data-testid="driver-schedule">
      <div className="flex flex-wrap items-center gap-3">
        <Link
          href={backHref}
          className="inline-flex items-center gap-1 rounded-md border px-2 py-1 text-sm text-gray-700 hover:bg-gray-100"
          data-testid="driver-schedule-back"
        >
          <ArrowLeft className="h-4 w-4" />
          {backLabel}
        </Link>
        <h2 className="text-lg font-semibold">
          {driverName ?? "Driver"} <span className="font-normal text-gray-500">· {range}</span>
        </h2>
      </div>

      <div className="flex flex-wrap items-center gap-4 text-xs text-gray-600">
        <span className="flex items-center gap-1">
          <span className="inline-block h-3 w-6 rounded-sm bg-blue-600" /> Haul
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block h-3 w-6 rounded-sm border border-gray-400 bg-gray-300" />{" "}
          Deadhead (from home, between trips, home)
        </span>
        <span className="flex items-center gap-1">
          <span
            className="inline-block h-3 w-6 rounded-sm bg-blue-600"
            style={{ backgroundImage: STRIPES }}
          />{" "}
          Estimated (no planned times: placed from 7 am, as early as it can be)
        </span>
        <span>Hover a span for its times.</span>
      </div>

      {isLoading ? (
        <p className="text-sm text-gray-500">Loading…</p>
      ) : (
        <>
          {trips === 0 && (
            <p className="text-sm text-gray-500">No work trackers for this driver this week.</p>
          )}
          <div className="flex items-start gap-4">
            <div className="min-w-0 flex-1 overflow-x-auto">
              <div className="min-w-[640px] border-t border-l border-black/15">
                <div className="flex">
                  <div className="w-36 shrink-0 border-r border-b border-black/15 bg-gray-200" />
                  <div className="relative h-7 flex-1 border-r border-b border-black/15 bg-gray-200">
                    {HOURS.map((h) => (
                      <span
                        key={h}
                        className="absolute top-1 -translate-x-1/2 text-[10px] text-gray-600"
                        style={{ left: pct(h * 60) }}
                      >
                        {h === 0 ? "" : hourLabel(h)}
                      </span>
                    ))}
                  </div>
                </div>

                {days.map((day) => (
                  <button
                    type="button"
                    key={day.date}
                    onClick={() => setPicked(day.date)}
                    aria-pressed={day.date === selected}
                    className={`flex w-full cursor-pointer text-left ${
                      day.date === selected
                        ? "bg-blue-50 ring-2 ring-inset ring-blue-500"
                        : "hover:bg-gray-50"
                    }`}
                    data-testid="driver-schedule-day"
                  >
                    <div className="flex w-36 shrink-0 flex-col justify-center border-r border-b border-black/15 px-2 py-1 text-sm">
                      <span className="font-medium">
                        {DateTime.fromISO(day.date).toFormat("EEE, MMM d")}
                      </span>
                      {day.trips > 0 && (
                        <span className="text-xs text-gray-500">
                          {day.trips} trip{day.trips === 1 ? "" : "s"} ·{" "}
                          {duration(day.driveMinutes)}
                        </span>
                      )}
                    </div>
                    <div className="relative h-14 flex-1 border-r border-b border-black/15">
                      {HOURS.slice(1).map((h) => (
                        <div
                          key={h}
                          className={`absolute top-0 bottom-0 w-px ${h % 6 === 0 ? "bg-black/20" : "bg-black/5"}`}
                          style={{ left: pct(h * 60) }}
                        />
                      ))}
                      {day.spans.map((span, i) => (
                        <Span key={`${span.trackerId}-${i}`} span={span} />
                      ))}
                    </div>
                  </button>
                ))}
              </div>
            </div>
            <DayRoute date={selected} loops={selected ? (routesByDay.get(selected) ?? []) : []} />
          </div>
        </>
      )}
    </div>
  );
}
