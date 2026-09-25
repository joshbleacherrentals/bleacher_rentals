"use client";

import { createContext, useContext, useMemo, type ReactNode } from "react";
import { useSearchParams } from "next/navigation";
import { db } from "@/components/providers/SystemProvider";
import { expect, useTypedQuery } from "@/lib/powersync/typedQuery";
import { TimeRange, validTimeRanges } from "./queries/useEventsWithinTimeRange";
import { getCurrentDay, getDateKeys, getLastPeriodSameElapsedDayKey } from "../util/datetime";
import { useTargets, type ScorecardTarget, type TargetType } from "./queries/useTargets";
import { QuotesBookingsEvent } from "@/features/quotesAndBookings/types";
import { useTimezoneStore } from "@/lib/useTimezoneStore";
import type { WorkTrackerRow } from "@/features/allWorkTrackers/types";
import { DateTime } from "luxon";
import { getPeriodBounds } from "../util/periodDates";

type ScorecardStatsContextValue = {
  allEvents: QuotesBookingsEvent[];
  allWorkTrackers: WorkTrackerRow[];
  activeRange: TimeRange;
  periodStart: string | null;
  currentDay: string;
  thisPeriodDays: string[];
  lastPeriodDays: string[];
  lastPeriodSameElapsedDayKey: string;
  targets: ScorecardTarget[];
  getGoal: (targetType: TargetType) => number;
  timezone: string;
};

const ScorecardStatsContext = createContext<ScorecardStatsContextValue | null>(null);

export function ScorecardStatsProvider({ children }: { children: ReactNode }) {
  const timezone = useTimezoneStore((s) => s.timezone);
  const today = useMemo(() => getCurrentDay(), []);
  const searchParams = useSearchParams();
  const timeRangeParam = searchParams.get("timeRange");
  const periodStartParam = searchParams.get("periodStart");
  const activeRange: TimeRange = validTimeRanges.includes(timeRangeParam as TimeRange)
    ? (timeRangeParam as TimeRange)
    : "weekly";

  const bounds = useMemo(
    () => getPeriodBounds(activeRange, periodStartParam),
    [activeRange, periodStartParam],
  );

  // For historical periods, clamp currentDay to the last day of the period.
  // bounds.thisEnd is exclusive, so subtract one day for the last included day.
  const currentDay = useMemo(() => {
    // Use Luxon to avoid UTC-vs-local off-by-one from new Date() parsing bare dates.
    const lastDayOfPeriod = bounds.thisEnd
      ? DateTime.fromISO(bounds.thisEnd).minus({ days: 1 }).toFormat("yyyy-MM-dd")
      : today;
    return today <= lastDayOfPeriod ? today : lastDayOfPeriod;
  }, [today, bounds.thisEnd]);

  // Date bounds cover both last and this period for the SQL query.
  // Add ±1 day buffer because the DB stores UTC timestamps, but the real
  // filtering (isWithinRange) is timezone-aware. A UTC timestamp like
  // "2026-04-01T00:00:00Z" is still Mar 31 in EST — the SQL string compare
  // would exclude it without the buffer. The client-side filter is the real
  // source of truth; this query just needs to be a superset.
  const start = DateTime.fromISO(bounds.lastStart).minus({ days: 1 }).toFormat("yyyy-MM-dd");
  const end = DateTime.fromISO(bounds.thisEnd).plus({ days: 1 }).toFormat("yyyy-MM-dd");

  // Events query — date-bounded.
  // Different hooks use different date fields (created_at, booked_at, event_start).
  // We filter broadly: any event whose created_at OR event_start falls in range.
  // booked_at is always <= created_at chronologically, so created_at covers it.
  const eventsQuery = useMemo(
    () =>
      db
        .selectFrom("Events as e")
        .leftJoin("Users as u", "e.created_by_user_uuid", "u.id")
        .leftJoin("Addresses as a", "e.address_uuid", "a.id")
        .leftJoin("Contacts as ct", "e.contact_uuid", "ct.id")
        .leftJoin("Companies as co", "ct.company_uuid", "co.id")
        .select([
          "e.id as id",
          "e.event_name as event_name",
          "e.event_start as event_start",
          "e.event_end as event_end",
          "e.event_status as event_status",
          "e.contract_revenue_cents as contract_revenue_cents",
          "e.tax_amount_cents as tax_amount_cents",
          "e.tax_percent as tax_percent",
          "e.created_at as created_at",
          "e.booked_at as booked_at",
          "e.created_by_user_uuid as created_by_user_uuid",
          "e.goodshuffle_url as goodshuffle_url",
          "e.is_qbo as is_qbo",
          "e.sales_office_uuid as sales_office_uuid",
          "u.first_name as account_manager_first_name",
          "u.last_name as account_manager_last_name",
          "u.email as account_manager_email",
          "a.street as address_street",
          "a.city as address_city",
          "a.state_province as address_state",
          "ct.first_name as contact_first_name",
          "ct.last_name as contact_last_name",
          "ct.email as contact_email",
          "co.company_name as company_name",
          "e.deleted as deleted",
          "e.invoice_number as invoice_number",
        ])
        .where("e.deleted", "=", 0)
        .where((eb) =>
          eb.or([
            eb.and([eb("e.created_at", ">=", start), eb("e.created_at", "<", end)]),
            eb.and([eb("e.booked_at", ">=", start), eb("e.booked_at", "<", end)]),
            eb.and([eb("e.event_start", ">=", start), eb("e.event_start", "<", end)]),
          ]),
        )
        .compile(),
    [start, end],
  );

  // Work trackers query — date-bounded on the `date` field.
  const workTrackersQuery = useMemo(
    () =>
      db
        .selectFrom("WorkTrackers as wt")
        .leftJoin("Drivers as d", "wt.driver_uuid", "d.id")
        .leftJoin("Users as u", "d.user_uuid", "u.id")
        .leftJoin("AccountManagers as am", "d.account_manager_uuid", "am.id")
        .leftJoin("Users as amu", "am.user_uuid", "amu.id")
        .leftJoin("Bleachers as b", "wt.bleacher_uuid", "b.id")
        .leftJoin("Addresses as pa", "wt.pickup_address_uuid", "pa.id")
        .leftJoin("Addresses as da", "wt.dropoff_address_uuid", "da.id")
        .select([
          "wt.id as id",
          "wt.date as date",
          "wt.status as status",
          "wt.pay_cents as pay_cents",
          "wt.created_at as created_at",
          "wt.completed_at as completed_at",
          "wt.project_number as project_number",
          "wt.driver_uuid as driver_uuid",
          "d.account_manager_uuid as driver_account_manager_uuid",
          "amu.first_name as account_manager_first_name",
          "amu.last_name as account_manager_last_name",
          "u.first_name as driver_first_name",
          "u.last_name as driver_last_name",
          "u.email as driver_email",
          "b.bleacher_number as bleacher_number",
          "pa.street as pickup_street",
          "pa.city as pickup_city",
          "pa.state_province as pickup_state",
          "da.street as dropoff_street",
          "da.city as dropoff_city",
          "da.state_province as dropoff_state",
        ])
        .where("wt.date", ">=", start)
        .where("wt.date", "<", end)
        .compile(),
    [start, end],
  );

  const { data: allEvents = [] } = useTypedQuery(eventsQuery, expect<QuotesBookingsEvent>());
  const { data: allWorkTrackers = [] } = useTypedQuery(workTrackersQuery, expect<WorkTrackerRow>());
  const { targets } = useTargets(activeRange, "quotes");

  const thisPeriodDays = useMemo(
    () => getDateKeys(bounds.thisStart, bounds.thisEnd),
    [bounds.thisStart, bounds.thisEnd],
  );
  const lastPeriodDays = useMemo(
    () => getDateKeys(bounds.lastStart, bounds.lastEnd),
    [bounds.lastStart, bounds.lastEnd],
  );

  const lastPeriodSameElapsedDayKey = getLastPeriodSameElapsedDayKey(
    thisPeriodDays,
    lastPeriodDays,
    currentDay,
  );

  const getGoal = useMemo(() => {
    return (targetType: TargetType) => {
      const total = targets.reduce((sum, target) => {
        if (targetType === "gross_margin_percent") {
          if (activeRange === "weekly") return sum + (target.gross_margin_percent_weekly ?? 0);
          if (activeRange === "quarterly")
            return sum + (target.gross_margin_percent_quarterly ?? 0);
          return sum + (target.gross_margin_percent_annually ?? 0);
        }
        if (targetType === "quotes") {
          if (activeRange === "weekly") return sum + (target.quotes_weekly ?? 0);
          if (activeRange === "quarterly") return sum + (target.quotes_quarterly ?? 0);
          return sum + (target.quotes_annually ?? 0);
        }
        if (targetType === "sales") {
          if (activeRange === "weekly") return sum + (target.sales_weekly ?? 0);
          if (activeRange === "quarterly") return sum + (target.sales_quarterly ?? 0);
          return sum + (target.sales_annually ?? 0);
        }
        if (targetType === "value_of_sales") {
          if (activeRange === "weekly")
            return sum + (target.value_of_sales_weekly_cents ?? 0) / 100;
          if (activeRange === "quarterly")
            return sum + (target.value_of_sales_quarterly_cents ?? 0) / 100;
          return sum + (target.value_of_sales_annually_cents ?? 0) / 100;
        }
        if (activeRange === "weekly")
          return sum + (target.value_of_revenue_weekly_cents ?? 0) / 100;
        if (activeRange === "quarterly")
          return sum + (target.value_of_revenue_quarterly_cents ?? 0) / 100;
        return sum + (target.value_of_revenue_annually_cents ?? 0) / 100;
      }, 0);

      if (targetType === "gross_margin_percent" && targets.length > 0) {
        return Math.round(total / targets.length);
      }
      return total;
    };
  }, [targets, activeRange]);

  const value = useMemo(
    () => ({
      allEvents,
      allWorkTrackers,
      activeRange,
      periodStart: periodStartParam,
      currentDay,
      thisPeriodDays,
      lastPeriodDays,
      lastPeriodSameElapsedDayKey,
      targets,
      getGoal,
      timezone,
    }),
    [
      allEvents,
      allWorkTrackers,
      activeRange,
      periodStartParam,
      currentDay,
      thisPeriodDays,
      lastPeriodDays,
      lastPeriodSameElapsedDayKey,
      targets,
      getGoal,
      timezone,
    ],
  );

  return <ScorecardStatsContext.Provider value={value}>{children}</ScorecardStatsContext.Provider>;
}

export function useScorecardStatsContext() {
  const ctx = useContext(ScorecardStatsContext);
  if (!ctx) {
    throw new Error("useScorecardStatsContext must be used within ScorecardStatsProvider");
  }
  return ctx;
}
