"use client";

import { db } from "@/components/providers/SystemProvider";
import {
  lastQuarterStartTimeStampTZ,
  lastWeekStartTimeStampTZ,
  lastYearStartTimeStampTZ,
  thisQuarterEndTimeStampTZ,
  thisWeekEndTimeStampTZ,
  thisYearEndTimeStampTZ,
} from "../../constants/time";
import { expect, useTypedQuery } from "@/lib/powersync/typedQuery";
import { useMemo } from "react";
import { TimeRange } from "./useEventsWithinTimeRange";

export type ScorecardEvent = {
  id: string;
  created_at: string | null;
  quote_sent_at: string | null;
  booked_at: string | null;
  event_start: string | null;
  event_status: string | null;
  contract_revenue_cents: number | null;
  created_by_user_uuid: string | null;
};

function getTimestampBounds(activeRange: TimeRange): { start: string; end: string } {
  if (activeRange === "annually") {
    return { start: lastYearStartTimeStampTZ, end: thisYearEndTimeStampTZ };
  }
  if (activeRange === "quarterly") {
    return { start: lastQuarterStartTimeStampTZ, end: thisQuarterEndTimeStampTZ };
  }
  return { start: lastWeekStartTimeStampTZ, end: thisWeekEndTimeStampTZ };
}

/**
 * Single reactive query for all non-deleted Events across both periods.
 * Filtered by created_at range (the widest — covers booked_at and event_start too).
 */
export function useScorecardEvents(activeRange: TimeRange) {
  const { start, end } = getTimestampBounds(activeRange);

  const query = useMemo(() => {
    return db
      .selectFrom("Events as e")
      .select([
        "e.id as id",
        "e.created_at as created_at",
        "e.quote_sent_at as quote_sent_at",
        "e.booked_at as booked_at",
        "e.event_start as event_start",
        "e.event_status as event_status",
        "e.contract_revenue_cents as contract_revenue_cents",
        "e.created_by_user_uuid as created_by_user_uuid",
      ])
      .where("e.deleted", "=", 0)
      .compile();
  }, []);

  const { data: events = [] } = useTypedQuery(query, expect<ScorecardEvent>());

  return events;
}
