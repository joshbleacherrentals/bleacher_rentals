"use client";

import { useMemo } from "react";
import { PageHeader } from "@/components/PageHeader";
import { AnalyticsCards } from "./AnalyticsCards";
import { AnalyticsNotes } from "./AnalyticsNotes";
import { AnalyticsSkeleton } from "./AnalyticsSkeleton";
import { CategoriesTable } from "./CategoriesTable";
import { CategorySpendChart } from "./CategorySpendChart";
import { ModelsTable } from "./ModelsTable";
import { PeriodDropdown } from "./PeriodDropdown";
import { VendorsTable } from "./VendorsTable";
import { ZonesTable } from "./ZonesTable";
import type { CadUsdRatesState } from "../hooks/useCadUsdRates";
import { analyticsYears, resolvePeriod } from "../utils/analyticsPeriod";
import type { AnalyticsInputs, Period } from "../utils/analyticsTypes";
import { buildAnalytics } from "../utils/buildAnalytics";
import { periodFromValue, periodLabel, periodOptions } from "../utils/periodOptions";

// docs/specs/dashboard-analytics-05-page.md §2.1. The body of the page: the header with the period
// dropdown, and then either the loading state or the notes, the five cards, the four tables and the
// chart. It takes what the page has read (the inputs, the rates and the chosen period) as props, so
// each period and state can be drawn on its own in a test. It holds no state of its own.

type AnalyticsPageContentProps = {
  inputs: AnalyticsInputs;
  /** True until the eight local queries have all answered. */
  isLoading: boolean;
  rates: Pick<CadUsdRatesState, "status" | "rateFor">;
  currentYear: number;
  /** What the reader chose; it is replaced by the current year when its year has gone (§2.7). */
  choice: Period;
  onChoose: (period: Period) => void;
};

export function AnalyticsPageContent({
  inputs,
  isLoading,
  rates,
  currentYear,
  choice,
  onChoose,
}: AnalyticsPageContentProps) {
  const years = useMemo(
    () => analyticsYears(inputs.repairs, currentYear),
    [inputs.repairs, currentYear],
  );
  const period = useMemo(
    () => resolvePeriod(choice, years, currentYear),
    [choice, years, currentYear],
  );
  const options = useMemo(() => periodOptions(years, period), [years, period]);

  // The numbers show at once when the browser remembers rates (`ready`), even while newer days are
  // being asked for. They wait only while no rate is known and a request is open, or the data loads.
  const loading = isLoading || rates.status === "loading";
  const figures = useMemo(
    () => (loading ? null : buildAnalytics({ inputs, period, rateFor: rates.rateFor })),
    [loading, inputs, period, rates.rateFor],
  );

  const handleChange = (value: string) => {
    const next = periodFromValue(value);
    if (next !== null) onChoose(next);
  };

  return (
    <div data-testid="analytics-page" className="flex flex-col gap-6">
      {/* The header of the board: the title block and the dropdown at the top, wrapping on a narrow
          screen, with the page's own 24 px gap below it in place of the header's margin. */}
      <div className="[&>div]:mb-0 [&>div]:flex-wrap [&>div]:items-start [&>div]:gap-x-4 [&>div]:gap-y-3">
        <PageHeader
          title="Dashboard & Analytics"
          subtitle="Maintenance spend, readiness and cost breakdowns across the bleachers"
          action={
            <PeriodDropdown label={periodLabel(period)} options={options} onChange={handleChange} />
          }
        />
      </div>
      {figures === null ? (
        <AnalyticsSkeleton />
      ) : (
        <>
          <AnalyticsNotes converted={figures.cad.converted} withoutRate={figures.cad.withoutRate} />
          <AnalyticsCards figures={figures} />
          <ZonesTable zones={figures.zones} />
          <ModelsTable models={figures.models} period={period} />
          <CategoriesTable categories={figures.categories} />
          <CategorySpendChart rows={figures.categories.rows} period={period} />
          <VendorsTable vendors={figures.vendors} period={period} />
        </>
      )}
    </div>
  );
}
