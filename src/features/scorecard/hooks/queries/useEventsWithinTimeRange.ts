"use client";

import { db } from "@/components/providers/SystemProvider";
import {
  lastQuarterStartDate,
  lastQuarterStartTimeStampTZ,
  lastWeekStartDate,
  lastWeekStartTimeStampTZ,
  lastYearStartDate,
  lastYearStartTimeStampTZ,
  thisQuarterEndDate,
  thisQuarterEndTimeStampTZ,
  thisQuarterStartDate,
  thisQuarterStartTimeStampTZ,
  thisWeekEndDate,
  thisWeekEndTimeStampTZ,
  thisWeekStartDate,
  thisWeekStartTimeStampTZ,
  thisYearEndDate,
  thisYearEndTimeStampTZ,
  thisYearStartDate,
  thisYearStartTimeStampTZ,
} from "../../constants/time";
import { expect, useTypedQuery } from "@/lib/powersync/typedQuery";
import { useMemo } from "react";
import { DateField } from "../overview/useEventData";

export type EventWithDate = {
  id: string;
  created_at: string | null;
  quote_sent_at: string | null;
  event_start: string | null;
  booked_at: string | null;
  contract_revenue_cents: number | null;
};

export type TimeRange = "weekly" | "quarterly" | "annually";
export const validTimeRanges = ["weekly", "quarterly", "annually"] as const;

export function useEventsWithinTimeRange(
  activeRange: TimeRange,
  period: "this" | "last",
  dateField: DateField,
  onlyBooked: boolean,
  createdByUserUuid: string | null,
) {
  const query = useMemo(() => {
    let eventsBuilder = db
      .selectFrom("Events as e")
      .select([
        "e.id as id",
        "e.created_at as created_at",
        "e.quote_sent_at as quote_sent_at",
        "e.event_start as event_start",
        "e.booked_at as booked_at",
        "e.contract_revenue_cents as contract_revenue_cents",
      ]);

    if (activeRange === "annually") {
      if (period === "this") {
        eventsBuilder = eventsBuilder
          .where(
            `e.${dateField}`,
            ">=",
            dateField === "event_start" ? thisYearStartDate : thisYearStartTimeStampTZ,
          )
          .where(
            `e.${dateField}`,
            "<",
            dateField === "event_start" ? thisYearEndDate : thisYearEndTimeStampTZ,
          );
      } else {
        eventsBuilder = eventsBuilder
          .where(
            `e.${dateField}`,
            ">=",
            dateField === "event_start" ? lastYearStartDate : lastYearStartTimeStampTZ,
          )
          .where(
            `e.${dateField}`,
            "<",
            dateField === "event_start" ? thisYearStartDate : thisYearStartTimeStampTZ,
          );
      }
    } else if (activeRange === "quarterly") {
      if (period === "this") {
        eventsBuilder = eventsBuilder
          .where(
            `e.${dateField}`,
            ">=",
            dateField === "event_start" ? thisQuarterStartDate : thisQuarterStartTimeStampTZ,
          )
          .where(
            `e.${dateField}`,
            "<",
            dateField === "event_start" ? thisQuarterEndDate : thisQuarterEndTimeStampTZ,
          );
      } else {
        eventsBuilder = eventsBuilder
          .where(
            `e.${dateField}`,
            ">=",
            dateField === "event_start" ? lastQuarterStartDate : lastQuarterStartTimeStampTZ,
          )
          .where(
            `e.${dateField}`,
            "<",
            dateField === "event_start" ? thisQuarterStartDate : thisQuarterStartTimeStampTZ,
          );
      }
      // default to weekly if somehow an invalid range is passed
    } else {
      if (period === "this") {
        eventsBuilder = eventsBuilder
          .where(
            `e.${dateField}`,
            ">=",
            dateField === "event_start" ? thisWeekStartDate : thisWeekStartTimeStampTZ,
          )
          .where(
            `e.${dateField}`,
            "<",
            dateField === "event_start" ? thisWeekEndDate : thisWeekEndTimeStampTZ,
          );
      } else {
        eventsBuilder = eventsBuilder
          .where(
            `e.${dateField}`,
            ">=",
            dateField === "event_start" ? lastWeekStartDate : lastWeekStartTimeStampTZ,
          )
          .where(
            `e.${dateField}`,
            "<",
            dateField === "event_start" ? thisWeekStartDate : thisWeekStartTimeStampTZ,
          );
      }
    }

    if (onlyBooked) {
      eventsBuilder = eventsBuilder.where("e.event_status", "=", "booked");
    }

    if (createdByUserUuid) {
      eventsBuilder = eventsBuilder.where("e.created_by_user_uuid", "=", createdByUserUuid);
    }

    return eventsBuilder.compile();
  }, [activeRange, period, onlyBooked, createdByUserUuid]);

  const { data: events = [] } = useTypedQuery(query, expect<EventWithDate>());

  return events;
}
