import { useMemo } from "react";
import { EventWithDate, TimeRange } from "../hooks/queries/useEventsWithinTimeRange";
import {
  lastQuarterStartTimeStampTZ,
  lastWeekStartTimeStampTZ,
  lastYearStartTimeStampTZ,
  thisQuarterEndTimeStampTZ,
  thisQuarterStartTimeStampTZ,
  thisWeekEndTimeStampTZ,
  thisWeekStartTimeStampTZ,
  thisYearEndTimeStampTZ,
  thisYearStartTimeStampTZ,
} from "../constants/time";
import { getDateKeys, isWeekdayKey, toLocalDateKey } from "./datetime";
import { roundToTwo } from "./math";
import { DateField } from "../hooks/overview/useEventData";

export function getDayKeysForTimeRange(activeRange: TimeRange, period: "this" | "last"): string[] {
  if (activeRange === "quarterly") {
    if (period === "this") {
      return getDateKeys(thisQuarterStartTimeStampTZ, thisQuarterEndTimeStampTZ);
    } else {
      return getDateKeys(lastQuarterStartTimeStampTZ, thisQuarterStartTimeStampTZ);
    }
  } else if (activeRange === "annually") {
    if (period === "this") {
      return getDateKeys(thisYearStartTimeStampTZ, thisYearEndTimeStampTZ);
    } else {
      return getDateKeys(lastYearStartTimeStampTZ, thisYearStartTimeStampTZ);
    }
    // default to weekly if somehow an invalid range is passed
  } else {
    if (period === "this") {
      return getDateKeys(thisWeekStartTimeStampTZ, thisWeekEndTimeStampTZ);
    } else {
      return getDateKeys(lastWeekStartTimeStampTZ, thisWeekStartTimeStampTZ);
    }
  }
}

export function getNumberForEachDay(
  days: string[],
  events: EventWithDate[],
  dateField: DateField,
  useValue?: boolean,
): Record<string, number> {
  return useMemo(() => {
    const daily: Record<string, number> = {};
    const cumulative: Record<string, number> = {};
    const daySet = new Set(days);

    days.forEach((day) => {
      daily[day] = 0;
    });

    events.forEach((event) => {
      const dateValue =
        dateField === "created_at"
          ? event.created_at
          : dateField === "booked_at"
            ? event.booked_at
            : dateField === "quote_sent_at"
              ? event.quote_sent_at
              : event.event_start;
      if (!dateValue) return;
      const eventDateKey = toLocalDateKey(dateValue);
      if (!daySet.has(eventDateKey)) return;

      const valueToAdd = useValue ? (event.contract_revenue_cents ?? 0) / 100 : 1;
      daily[eventDateKey] += valueToAdd;
    });

    let runningTotal = 0;
    days.forEach((day) => {
      runningTotal += daily[day] ?? 0;
      cumulative[day] = runningTotal;
    });

    return cumulative;
  }, [events, useValue, days, dateField]);
}

export function getPaceForEachDay(days: string[], goal: number) {
  return useMemo(() => {
    const pace: Record<string, number> = {};
    const totalWeekdays = days.filter(isWeekdayKey).length;
    const dailyTarget = totalWeekdays > 0 ? goal / totalWeekdays : 0;
    let running = 0;

    days.forEach((day) => {
      if (isWeekdayKey(day)) {
        running += dailyTarget;
      }
      pace[day] = roundToTwo(running); // weekend stays flat
    });
    return pace;
  }, [days, goal]);
}

export function assembleChartData(
  timeRange: TimeRange,
  thisPeriodDays: string[],
  lastPeriodDays: string[],
  currentDay: string,
  thisPeriodCumulative: Record<string, number>,
  lastPeriodCumulative: Record<string, number>,
  paceByDay: Record<string, number>,
) {
  return useMemo(() => {
    // Track the last known cumulative value for the last period so that when
    // thisPeriodDays is longer than lastPeriodDays (quarters have different
    // lengths), the line carries forward instead of dropping to 0.
    const lastPeriodFinalValue =
      lastPeriodDays.length > 0
        ? (lastPeriodCumulative[lastPeriodDays[lastPeriodDays.length - 1]] ?? 0)
        : 0;

    return thisPeriodDays.map((dateKey, idx) => {
      const d = new Date(`${dateKey}T00:00:00`);
      const lastPeriodDateKey = lastPeriodDays[idx];
      const lastPeriodValue =
        lastPeriodDateKey != null
          ? (lastPeriodCumulative[lastPeriodDateKey] ?? 0)
          : lastPeriodFinalValue;
      return {
        day: dateKey,
        dayTick: GetDayForXAxis(timeRange, dateKey),
        dayLabel: d.toLocaleDateString("en-US", { month: "long", day: "numeric" }), // "January 12"
        thisPeriod: dateKey > currentDay ? null : (thisPeriodCumulative[dateKey] ?? 0), // this works as long as both strings are always in exact YYYY-MM-DD format with zero-padding (like 2026-01-01)
        lastPeriod: lastPeriodValue,
        pace: paceByDay[dateKey] ?? 0,
      };
    });
  }, [
    timeRange,
    thisPeriodDays,
    lastPeriodDays,
    currentDay,
    thisPeriodCumulative,
    lastPeriodCumulative,
    paceByDay,
  ]);
}

export function GetDayForXAxis(timeRange: TimeRange, dateKey: string): string {
  const date = new Date(`${dateKey}T00:00:00`);

  if (timeRange === "weekly") {
    const dayChars = ["S", "M", "T", "W", "T", "F", "S"];
    return dayChars[date.getDay()] ?? "";
  } else if (timeRange === "annually") {
    const month = date.getMonth();
    const isQuarterStartMonth = month === 0 || month === 3 || month === 6 || month === 9;
    return date.getDate() === 1 && isQuarterStartMonth
      ? date.toLocaleDateString("en-US", { month: "short" })
      : "";
  }

  return date.getDate() === 1 ? date.toLocaleDateString("en-US", { month: "short" }) : "";
}
