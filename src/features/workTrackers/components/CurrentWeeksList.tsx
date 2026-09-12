"use client";

import { useMemo } from "react";
import { useRouter } from "next/navigation";
import { DateTime } from "luxon";
import LoadingSpinner from "@/components/LoadingSpinner";
import { db } from "@/components/providers/SystemProvider";
import { expect, useTypedQuery } from "@/lib/powersync/typedQuery";
import { useCrossBorderWeekStarts } from "../hooks/useCrossBorderWeekStarts";
import { useWithdrawnCountsByWeek } from "../db/withdrawnTrackers";
import { WithdrawnBadgeSlot } from "./WithdrawnBadgeSlot";

type WeekGroup = {
  week_start: string | null;
  week_end: string | null;
};

function getWeekLabel(weekStart: string | null): string {
  if (!weekStart) return "Unknown";

  const today = DateTime.now().startOf("day");
  const start = DateTime.fromISO(weekStart);

  // Get Monday of current week
  const thisWeekMonday = today.minus({ days: (today.weekday + 6) % 7 });

  const diffWeeks = Math.round(start.diff(thisWeekMonday, "weeks").weeks);

  if (diffWeeks === -1) return "Last Week";
  if (diffWeeks === 0) return "This Week";
  if (diffWeeks === 1) return "Next Week";
  if (diffWeeks > 1) return `${diffWeeks} Weeks`;
  if (diffWeeks < -1) return `${Math.abs(diffWeeks)} Weeks Ago`;

  return "Unknown";
}

function formatDateRange(weekStart: string | null, weekEnd: string | null): string {
  if (!weekStart || !weekEnd) return "Unknown";

  const start = DateTime.fromISO(weekStart);
  const end = DateTime.fromISO(weekEnd);

  if (start.month === end.month) {
    return `${start.toFormat("MMMM d")} - ${end.toFormat("d")}`;
  }
  return `${start.toFormat("MMMM d")} - ${end.toFormat("MMMM d")}`;
}

export function CurrentWeeksList() {
  const router = useRouter();

  // Calculate the date range for current view (last week to 12 weeks in future)
  const dateRange = useMemo(() => {
    const today = DateTime.now().startOf("day");
    const thisWeekMonday = today.minus({ days: (today.weekday + 6) % 7 });
    const lastWeekMonday = thisWeekMonday.minus({ weeks: 1 });
    const futureLimit = thisWeekMonday.plus({ weeks: 12 });

    return {
      start: lastWeekMonday.toISODate()!,
      end: futureLimit.toISODate()!,
    };
  }, []);

  const crossBorderWeekStarts = useCrossBorderWeekStarts(dateRange.start, dateRange.end);
  const withdrawnByWeek = useWithdrawnCountsByWeek();

  const query = useMemo(() => {
    return db
      .selectFrom("WorkTrackerGroups")
      .select(["week_start", "week_end"])
      .where("week_start", ">=", dateRange.start)
      .where("week_start", "<=", dateRange.end)
      .groupBy(["week_start", "week_end"])
      .orderBy("week_start", "asc")
      .compile();
  }, [dateRange]);

  const { data, isLoading } = useTypedQuery(query, expect<WeekGroup>());

  if (isLoading) {
    return (
      <tbody className="p-4">
        <tr>
          <td>
            <LoadingSpinner />
          </td>
        </tr>
      </tbody>
    );
  }

  if (!data || data.length === 0) {
    return (
      <tbody>
        <tr>
          <td className="py-4 px-3 text-center text-gray-500">No work tracker weeks found</td>
        </tr>
      </tbody>
    );
  }

  return (
    <tbody>
      {data.map((row, index) => {
        if (!row.week_start || !row.week_end) return null;

        const label = getWeekLabel(row.week_start);
        const dateRange = formatDateRange(row.week_start, row.week_end);

        return (
          <tr
            key={index}
            className={`border-b h-16 border-gray-200 transition-all duration-100 ease-in-out cursor-pointer ${
              crossBorderWeekStarts?.has(row.week_start)
                ? "bg-yellow-100 hover:bg-yellow-200"
                : "hover:bg-gray-100"
            }`}
            onClick={() => router.push(`/work-trackers/${row.week_start}`)}
          >
            <td className="py-2 px-3 text-left">
              <div className="flex items-center gap-2">
                <WithdrawnBadgeSlot
                  count={withdrawnByWeek.get(row.week_start) ?? 0}
                  label={`${withdrawnByWeek.get(row.week_start) ?? 0} work trackers declined or abandoned this week`}
                />
                <div className="flex flex-col">
                  <span className="font-semibold text-base">{label}</span>
                  <span className="text-sm text-gray-500">{dateRange}</span>
                </div>
              </div>
            </td>
          </tr>
        );
      })}
    </tbody>
  );
}
