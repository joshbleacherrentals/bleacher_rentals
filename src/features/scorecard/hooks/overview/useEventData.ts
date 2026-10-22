"use client";
import { useMemo } from "react";
import { getCurrentDay, getLastPeriodSameElapsedDayKey } from "../../util/datetime";
import { useSearchParams } from "next/navigation";
import {
  TimeRange,
  useEventsWithinTimeRange,
  validTimeRanges,
} from "../queries/useEventsWithinTimeRange";
import { TargetType, useTargets } from "../queries/useTargets";
import {
  assembleChartData,
  getDayKeysForTimeRange,
  getNumberForEachDay,
  getPaceForEachDay,
} from "../../util/quotes";

export type DateField = "created_at" | "event_start" | "booked_at" | "quote_sent_at";

export function useEventData(props: {
  onlyBooked: boolean;
  useValue: boolean;
  createdByUserUuid: string | null;
  accountManagerUuid: string | null;
  dateField: DateField;
  targetType: TargetType;
}) {
  const currentDay = useMemo(() => getCurrentDay(), []);
  const searchParams = useSearchParams();
  const timeRangeParam = searchParams.get("timeRange");
  const activeRange: TimeRange = validTimeRanges.includes(timeRangeParam as TimeRange)
    ? (timeRangeParam as TimeRange)
    : "weekly";

  const thisPeriodEvents = useEventsWithinTimeRange(
    activeRange,
    "this",
    props.dateField,
    props.onlyBooked,
    props.createdByUserUuid,
  );
  const lastPeriodEvents = useEventsWithinTimeRange(
    activeRange,
    "last",
    props.dateField,
    props.onlyBooked,
    props.createdByUserUuid,
  );
  const { goal } = useTargets(activeRange, props.targetType, props.accountManagerUuid);

  const thisPeriodDays = getDayKeysForTimeRange(activeRange, "this");
  const lastPeriodDays = getDayKeysForTimeRange(activeRange, "last");
  const lastPeriodSameElapsedDayKey = getLastPeriodSameElapsedDayKey(
    thisPeriodDays,
    lastPeriodDays,
    currentDay,
  );

  const thisPeriodCumulativeByDay = getNumberForEachDay(
    thisPeriodDays,
    thisPeriodEvents,
    props.dateField,
    props.useValue,
  );
  const lastPeriodCumulativeByDay = getNumberForEachDay(
    lastPeriodDays,
    lastPeriodEvents,
    props.dateField,
    props.useValue,
  );
  const paceByDay = getPaceForEachDay(thisPeriodDays, goal);

  const chartData = assembleChartData(
    activeRange,
    thisPeriodDays,
    lastPeriodDays,
    currentDay,
    thisPeriodCumulativeByDay,
    lastPeriodCumulativeByDay,
    paceByDay,
  );

  return {
    thisPeriod: {
      current: thisPeriodCumulativeByDay[currentDay] || 0,
      goal: goal,
      paceTarget: paceByDay[currentDay] || 0,
    },
    lastPeriod: {
      currentAtSameDay: lastPeriodSameElapsedDayKey
        ? lastPeriodCumulativeByDay[lastPeriodSameElapsedDayKey] || 0
        : 0,
      totalAtEnd: lastPeriodCumulativeByDay[lastPeriodDays[lastPeriodDays.length - 1]] || 0,
    },
    chartData,
  };
}
