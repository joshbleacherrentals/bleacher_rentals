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

function formatWeekLabel(weekStart: string | null, weekEnd: string | null): string {
  if (!weekStart || !weekEnd) return "Unknown";

  const start = DateTime.fromISO(weekStart);
  const end = DateTime.fromISO(weekEnd);

  if (start.month === end.month) {
    return `${start.toFormat("MMMM d")} - ${end.toFormat("d, yyyy")}`;
  }
  return `${start.toFormat("MMMM d")} - ${end.toFormat("MMMM d, yyyy")}`;
}

type Props = {
  year: number;
};

export function YearlyWeeksList({ year }: Props) {
  const router = useRouter();

  // Calculate the date range for the year
  const dateRange = useMemo(() => {
    const yearStart = DateTime.fromObject({ year, month: 1, day: 1 });
    const yearEnd = DateTime.fromObject({ year, month: 12, day: 31 });

    return {
      start: yearStart.toISODate()!,
      end: yearEnd.toISODate()!,
    };
  }, [year]);

  const crossBorderWeekStarts = useCrossBorderWeekStarts(dateRange.start, dateRange.end);
  const withdrawnByWeek = useWithdrawnCountsByWeek();

  const query = useMemo(() => {
    return db
      .selectFrom("WorkTrackerGroups")
      .select(["week_start", "week_end"])
      .where("week_start", ">=", dateRange.start)
      .where("week_start", "<=", dateRange.end)
      .groupBy(["week_start", "week_end"])
      .orderBy("week_start", "desc")
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
          <td className="py-4 px-3 text-center text-gray-500">
            No work tracker weeks found for {year}
          </td>
        </tr>
      </tbody>
    );
  }

  return (
    <tbody>
      {data.map((row, index) => {
        if (!row.week_start || !row.week_end) return null;

        const label = formatWeekLabel(row.week_start, row.week_end);

        return (
          <tr
            key={index}
            className={`border-b h-12 border-gray-200 transition-all duration-100 ease-in-out cursor-pointer ${
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
                <span className="font-medium">{label}</span>
              </div>
            </td>
          </tr>
        );
      })}
    </tbody>
  );
}
