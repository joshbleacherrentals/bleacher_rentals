"use client";

import { useState } from "react";
import { useTimezoneStore } from "@/lib/useTimezoneStore";
import { dayInZone } from "@/features/repairs/utils/dayInZone";
import { AnalyticsPageContent } from "./AnalyticsPageContent";
import { useAnalyticsData } from "../hooks/useAnalyticsData";
import { useCadUsdRates } from "../hooks/useCadUsdRates";
import { oldestCadDay } from "../utils/analyticsPeriod";
import type { Period } from "../utils/analyticsTypes";

/**
 * The Dashboard & Analytics page: maintenance spend, readiness and cost breakdowns across the
 * bleachers, for a year or for all time, in US dollars. It reads the eight local tables
 * (`useAnalyticsData`), the CAD to USD rates (`useCadUsdRates`) and the day in the app time zone,
 * and hands them to the body. The period is React state that starts on the current year every time
 * the page opens (D11): it is not remembered and not in the address. Who may open the page is
 * decided in `accessConfig.ts`; the page does not read the role itself.
 * docs/specs/dashboard-analytics-05-page.md §2.1.
 */
export default function DashboardAnalyticsPage() {
  const timezone = useTimezoneStore((s) => s.timezone);
  const now = new Date().toISOString();
  const today = dayInZone(now, timezone) ?? now.slice(0, 10);
  const currentYear = Number(today.slice(0, 4));

  const [choice, setChoice] = useState<Period>({ kind: "year", year: currentYear });
  const { inputs, isLoading } = useAnalyticsData();
  const rates = useCadUsdRates({ oldestCadDay: oldestCadDay(inputs.repairs), today });

  return (
    <AnalyticsPageContent
      inputs={inputs}
      isLoading={isLoading}
      rates={rates}
      currentYear={currentYear}
      choice={choice}
      onChoose={setChoice}
    />
  );
}
