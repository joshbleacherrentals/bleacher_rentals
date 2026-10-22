"use client";

import { useMemo } from "react";
import { useScorecardStatsContext } from "../ScorecardStatsContext";
import { filterQuotesBookingsEvents } from "@/features/quotesAndBookings/utils/filterEvents";
import { filtersForTemplate } from "@/features/quotesAndBookings/utils/scorecardTemplates";
import {
  cumulativeEventCountByDay,
  cumulativeEventCentsByDay,
  cumulativeWorkTrackerPayByDay,
} from "../../util/scorecardAggregation";
import { assembleChartData, getPaceForEachDay } from "../../util/quotes";
import { roundToTwo } from "../../util/math";
import { useTargets, type TargetType } from "../queries/useTargets";

/**
 * All scorecard stats for a single account manager.
 *
 * Events are filtered by `created_by_user_uuid === userUuid`.
 * Work trackers are filtered by `driver_account_manager_uuid === accountManagerUuid`.
 *
 * Uses the exact same `filterQuotesBookingsEvents` + `filtersForTemplate` code path
 * as the global scorecard — structurally impossible to diverge.
 */
export function useAccountManagerScorecard(accountManagerUuid: string, userUuid: string) {
  const {
    allEvents,
    allWorkTrackers,
    activeRange,
    periodStart,
    currentDay,
    thisPeriodDays,
    lastPeriodDays,
    lastPeriodSameElapsedDayKey,
    timezone,
  } = useScorecardStatsContext();

  // Targets for this specific account manager
  const { goal: quotesGoal } = useTargets(activeRange, "quotes", accountManagerUuid);
  const { goal: salesGoal } = useTargets(activeRange, "sales", accountManagerUuid);
  const { goal: valueOfSalesGoal } = useTargets(activeRange, "value_of_sales", accountManagerUuid);
  const { goal: revenueGoal } = useTargets(activeRange, "value_of_revenue", accountManagerUuid);
  const { goal: grossMarginGoal } = useTargets(
    activeRange,
    "gross_margin_percent",
    accountManagerUuid,
  );

  // Pre-filter events for this account manager
  const amEvents = useMemo(
    () => allEvents.filter((e) => e.created_by_user_uuid === userUuid),
    [allEvents, userUuid],
  );

  // Pre-filter work trackers for this account manager's drivers
  const amWorkTrackers = useMemo(
    () => allWorkTrackers.filter((wt) => wt.driver_account_manager_uuid === accountManagerUuid),
    [allWorkTrackers, accountManagerUuid],
  );

  // ── Quotes Sent ──
  const quotesSentThis = useMemo(
    () =>
      filterQuotesBookingsEvents(
        amEvents,
        filtersForTemplate("quotes-sent", activeRange, "this", null, periodStart),
        timezone,
      ),
    [amEvents, activeRange, periodStart, timezone],
  );
  const quotesSentLast = useMemo(
    () =>
      filterQuotesBookingsEvents(
        amEvents,
        filtersForTemplate("quotes-sent", activeRange, "last", null, periodStart),
        timezone,
      ),
    [amEvents, activeRange, periodStart, timezone],
  );
  const quotesSentThisCumulative = useMemo(
    () => cumulativeEventCountByDay(thisPeriodDays, quotesSentThis, "quote_sent_at", timezone),
    [thisPeriodDays, quotesSentThis, timezone],
  );
  const quotesSentLastCumulative = useMemo(
    () => cumulativeEventCountByDay(lastPeriodDays, quotesSentLast, "quote_sent_at", timezone),
    [lastPeriodDays, quotesSentLast, timezone],
  );

  // ── Value of Quotes Sent ──
  const valueQuotesSentThis = useMemo(
    () =>
      filterQuotesBookingsEvents(
        amEvents,
        filtersForTemplate("value-of-quotes-sent", activeRange, "this", null, periodStart),
        timezone,
      ),
    [amEvents, activeRange, periodStart, timezone],
  );
  const valueQuotesSentLast = useMemo(
    () =>
      filterQuotesBookingsEvents(
        amEvents,
        filtersForTemplate("value-of-quotes-sent", activeRange, "last", null, periodStart),
        timezone,
      ),
    [amEvents, activeRange, periodStart, timezone],
  );
  const valueQuotesSentThisCumulative = useMemo(
    () =>
      cumulativeEventCentsByDay(
        thisPeriodDays,
        valueQuotesSentThis,
        "quote_sent_at",
        "contract_revenue_cents",
        timezone,
      ),
    [thisPeriodDays, valueQuotesSentThis, timezone],
  );
  const valueQuotesSentLastCumulative = useMemo(
    () =>
      cumulativeEventCentsByDay(
        lastPeriodDays,
        valueQuotesSentLast,
        "quote_sent_at",
        "contract_revenue_cents",
        timezone,
      ),
    [lastPeriodDays, valueQuotesSentLast, timezone],
  );

  // ── Quotes Signed ──
  const quotesSignedThis = useMemo(
    () =>
      filterQuotesBookingsEvents(
        amEvents,
        filtersForTemplate("quotes-signed", activeRange, "this", null, periodStart),
        timezone,
      ),
    [amEvents, activeRange, periodStart, timezone],
  );
  const quotesSignedLast = useMemo(
    () =>
      filterQuotesBookingsEvents(
        amEvents,
        filtersForTemplate("quotes-signed", activeRange, "last", null, periodStart),
        timezone,
      ),
    [amEvents, activeRange, periodStart, timezone],
  );
  const quotesSignedThisCumulative = useMemo(
    () => cumulativeEventCountByDay(thisPeriodDays, quotesSignedThis, "booked_at", timezone),
    [thisPeriodDays, quotesSignedThis, timezone],
  );
  const quotesSignedLastCumulative = useMemo(
    () => cumulativeEventCountByDay(lastPeriodDays, quotesSignedLast, "booked_at", timezone),
    [lastPeriodDays, quotesSignedLast, timezone],
  );

  // ── Value of Quotes Signed ──
  const valueSignedThis = useMemo(
    () =>
      filterQuotesBookingsEvents(
        amEvents,
        filtersForTemplate("value-of-quotes-signed", activeRange, "this", null, periodStart),
        timezone,
      ),
    [amEvents, activeRange, periodStart, timezone],
  );
  const valueSignedLast = useMemo(
    () =>
      filterQuotesBookingsEvents(
        amEvents,
        filtersForTemplate("value-of-quotes-signed", activeRange, "last", null, periodStart),
        timezone,
      ),
    [amEvents, activeRange, periodStart, timezone],
  );
  const valueSignedThisCumulative = useMemo(
    () =>
      cumulativeEventCentsByDay(
        thisPeriodDays,
        valueSignedThis,
        "booked_at",
        "contract_revenue_cents",
        timezone,
      ),
    [thisPeriodDays, valueSignedThis, timezone],
  );
  const valueSignedLastCumulative = useMemo(
    () =>
      cumulativeEventCentsByDay(
        lastPeriodDays,
        valueSignedLast,
        "booked_at",
        "contract_revenue_cents",
        timezone,
      ),
    [lastPeriodDays, valueSignedLast, timezone],
  );

  // ── Revenue ──
  const revenueThis = useMemo(
    () =>
      filterQuotesBookingsEvents(
        amEvents,
        filtersForTemplate("revenue", activeRange, "this", null, periodStart),
        timezone,
      ),
    [amEvents, activeRange, periodStart, timezone],
  );
  const revenueLast = useMemo(
    () =>
      filterQuotesBookingsEvents(
        amEvents,
        filtersForTemplate("revenue", activeRange, "last", null, periodStart),
        timezone,
      ),
    [amEvents, activeRange, periodStart, timezone],
  );
  const revenueThisCumulative = useMemo(
    () =>
      cumulativeEventCentsByDay(
        thisPeriodDays,
        revenueThis,
        "event_start",
        "contract_revenue_cents",
        timezone,
      ),
    [thisPeriodDays, revenueThis, timezone],
  );
  const revenueLastCumulative = useMemo(
    () =>
      cumulativeEventCentsByDay(
        lastPeriodDays,
        revenueLast,
        "event_start",
        "contract_revenue_cents",
        timezone,
      ),
    [lastPeriodDays, revenueLast, timezone],
  );

  // ── Driver Pay ──
  const driverPayThisCumulative = useMemo(
    () => cumulativeWorkTrackerPayByDay(thisPeriodDays, amWorkTrackers, timezone),
    [thisPeriodDays, amWorkTrackers, timezone],
  );
  const driverPayLastCumulative = useMemo(
    () => cumulativeWorkTrackerPayByDay(lastPeriodDays, amWorkTrackers, timezone),
    [lastPeriodDays, amWorkTrackers, timezone],
  );

  // ── Assemble chart data ──
  const quotesSentChart = assembleChartData(
    activeRange,
    thisPeriodDays,
    lastPeriodDays,
    currentDay,
    quotesSentThisCumulative,
    quotesSentLastCumulative,
    getPaceForEachDay(thisPeriodDays, quotesGoal),
  );
  const valueQuotesSentChart = assembleChartData(
    activeRange,
    thisPeriodDays,
    lastPeriodDays,
    currentDay,
    valueQuotesSentThisCumulative,
    valueQuotesSentLastCumulative,
    getPaceForEachDay(thisPeriodDays, 0),
  );
  const quotesSignedChart = assembleChartData(
    activeRange,
    thisPeriodDays,
    lastPeriodDays,
    currentDay,
    quotesSignedThisCumulative,
    quotesSignedLastCumulative,
    getPaceForEachDay(thisPeriodDays, salesGoal),
  );
  const valueSignedChart = assembleChartData(
    activeRange,
    thisPeriodDays,
    lastPeriodDays,
    currentDay,
    valueSignedThisCumulative,
    valueSignedLastCumulative,
    getPaceForEachDay(thisPeriodDays, valueOfSalesGoal),
  );
  const revenueChart = assembleChartData(
    activeRange,
    thisPeriodDays,
    lastPeriodDays,
    currentDay,
    revenueThisCumulative,
    revenueLastCumulative,
    getPaceForEachDay(thisPeriodDays, revenueGoal),
  );
  const driverPayChart = assembleChartData(
    activeRange,
    thisPeriodDays,
    lastPeriodDays,
    currentDay,
    driverPayThisCumulative,
    driverPayLastCumulative,
    getPaceForEachDay(thisPeriodDays, 0),
  );

  // ── Gross Margin ──
  // Read at currentDay so gross margin matches the same point-in-time as the other cards.
  const thisRevenue = revenueThisCumulative[currentDay] ?? 0;
  const thisDriverPay = driverPayThisCumulative[currentDay] ?? 0;
  const lastRevenue = revenueLastCumulative[lastPeriodDays[lastPeriodDays.length - 1]] ?? 0;
  const lastDriverPay = driverPayLastCumulative[lastPeriodDays[lastPeriodDays.length - 1]] ?? 0;

  const currentMarginRaw = roundToTwo(((thisRevenue - thisDriverPay) / thisRevenue) * 100);
  const lastMarginRaw = roundToTwo(((lastRevenue - lastDriverPay) / lastRevenue) * 100);
  const currentMargin = isFinite(currentMarginRaw) ? currentMarginRaw : 0;
  const lastMargin = isFinite(lastMarginRaw) ? lastMarginRaw : 0;

  return {
    quotesSent: {
      thisPeriod: {
        current: quotesSentThisCumulative[currentDay] ?? 0,
        goal: quotesGoal,
        paceTarget: getPaceForEachDay(thisPeriodDays, quotesGoal)[currentDay] ?? 0,
      },
      lastPeriod: {
        currentAtSameDay: lastPeriodSameElapsedDayKey
          ? (quotesSentLastCumulative[lastPeriodSameElapsedDayKey] ?? 0)
          : 0,
        totalAtEnd: quotesSentLastCumulative[lastPeriodDays[lastPeriodDays.length - 1]] ?? 0,
      },
      chartData: quotesSentChart,
    },
    valueOfQuotesSent: {
      thisPeriod: {
        current: valueQuotesSentThisCumulative[currentDay] ?? 0,
        goal: 0,
        paceTarget: 0,
      },
      lastPeriod: {
        currentAtSameDay: lastPeriodSameElapsedDayKey
          ? (valueQuotesSentLastCumulative[lastPeriodSameElapsedDayKey] ?? 0)
          : 0,
        totalAtEnd: valueQuotesSentLastCumulative[lastPeriodDays[lastPeriodDays.length - 1]] ?? 0,
      },
      chartData: valueQuotesSentChart,
    },
    quotesSigned: {
      thisPeriod: {
        current: quotesSignedThisCumulative[currentDay] ?? 0,
        goal: salesGoal,
        paceTarget: getPaceForEachDay(thisPeriodDays, salesGoal)[currentDay] ?? 0,
      },
      lastPeriod: {
        currentAtSameDay: lastPeriodSameElapsedDayKey
          ? (quotesSignedLastCumulative[lastPeriodSameElapsedDayKey] ?? 0)
          : 0,
        totalAtEnd: quotesSignedLastCumulative[lastPeriodDays[lastPeriodDays.length - 1]] ?? 0,
      },
      chartData: quotesSignedChart,
    },
    valueOfQuotesSigned: {
      thisPeriod: {
        current: valueSignedThisCumulative[currentDay] ?? 0,
        goal: valueOfSalesGoal,
        paceTarget: getPaceForEachDay(thisPeriodDays, valueOfSalesGoal)[currentDay] ?? 0,
      },
      lastPeriod: {
        currentAtSameDay: lastPeriodSameElapsedDayKey
          ? (valueSignedLastCumulative[lastPeriodSameElapsedDayKey] ?? 0)
          : 0,
        totalAtEnd: valueSignedLastCumulative[lastPeriodDays[lastPeriodDays.length - 1]] ?? 0,
      },
      chartData: valueSignedChart,
    },
    revenue: {
      thisPeriod: {
        current: revenueThisCumulative[currentDay] ?? 0,
        goal: revenueGoal,
        paceTarget: getPaceForEachDay(thisPeriodDays, revenueGoal)[currentDay] ?? 0,
      },
      lastPeriod: {
        currentAtSameDay: lastPeriodSameElapsedDayKey
          ? (revenueLastCumulative[lastPeriodSameElapsedDayKey] ?? 0)
          : 0,
        totalAtEnd: revenueLastCumulative[lastPeriodDays[lastPeriodDays.length - 1]] ?? 0,
      },
      chartData: revenueChart,
    },
    driverPay: {
      thisPeriod: {
        current: driverPayThisCumulative[currentDay] ?? 0,
        goal: 0,
        paceTarget: 0,
      },
      lastPeriod: {
        currentAtSameDay: lastPeriodSameElapsedDayKey
          ? (driverPayLastCumulative[lastPeriodSameElapsedDayKey] ?? 0)
          : 0,
        totalAtEnd: driverPayLastCumulative[lastPeriodDays[lastPeriodDays.length - 1]] ?? 0,
      },
      chartData: driverPayChart,
    },
    grossMargin: {
      thisPeriod: {
        current: currentMargin,
        goal: grossMarginGoal,
        revenueDollars: thisRevenue,
        driverPayDollars: thisDriverPay,
      },
      lastPeriod: {
        value: lastMargin,
      },
    },
  };
}
