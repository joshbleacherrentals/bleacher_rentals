"use client";

import { useMemo } from "react";
import { AuditRangeControls } from "@/features/accountantAudit/components/AuditRangeControls";
import { useKpiData } from "../hooks/useKpiData";
import { useKpiRange } from "../hooks/useKpiRange";
import { kpiForRange, type KpiResult } from "../utils/kpiAverages";
import { formatDays, formatPaymentCount } from "../utils/kpiFormat";
import { KpiCard } from "./KpiCard";

/** D16: what the (i) of each card says. */
export const DEPOSIT_HINT =
  "The average number of days between the day the first payment of the payment schedule was due and the day it was paid in full. A payment is counted in the range that contains the day it was paid in full. A payment made before its due date is not counted. A booking with one payment or no schedule has no deposit. Changing a payment schedule changes this number, also for past dates.";

export const FINAL_HINT =
  "The average number of days between the day the last payment of the payment schedule was due and the day it was paid in full. A payment is counted in the range that contains the day it was paid in full. A payment made before its due date is not counted. A booking with one payment counts here, and so does a booking with no schedule: its payment is due the day the booking was first signed or booked. Changing a payment schedule changes this number, also for past dates.";

function Message({ children }: { children: string }) {
  return (
    <div
      role="alert"
      data-testid="kpi-message"
      className="rounded-xl border border-gray-200 bg-white py-12 text-center text-sm text-red-600 shadow-sm"
    >
      {children}
    </div>
  );
}

/**
 * The body of the KPI tab: the range row and the two cards. It reads the range from the URL
 * (`useKpiRange`) and the collected payments from the local database (`useKpiData`); the range
 * only filters the rows, so a new range does not run the allocation again.
 * docs/specs/accountant-kpi.md §2.4 (D2, D8, D11, D12, D13).
 */
export function KpiTab() {
  const { range, setRange, isInverted } = useKpiRange();
  const { rows, isLoading, error } = useKpiData();

  const { from, to } = range;
  const deposit = useMemo<KpiResult | undefined>(
    () => (rows ? kpiForRange(rows, "deposit", { from, to }) : undefined),
    [rows, from, to],
  );
  const final = useMemo<KpiResult | undefined>(
    () => (rows ? kpiForRange(rows, "final", { from, to }) : undefined),
    [rows, from, to],
  );

  let body;
  if (isInverted) {
    body = <Message>The start date is after the end date.</Message>;
  } else if (error) {
    body = <Message>Could not load the KPIs.</Message>;
  } else {
    // While loading there is no result: the value says so and there is no count to show.
    const show = (result: KpiResult | undefined) =>
      isLoading || !result
        ? { value: "Loading...", detail: undefined }
        : { value: formatDays(result.days), detail: formatPaymentCount(result.count) };
    body = (
      <div className="flex flex-wrap gap-4">
        <KpiCard
          title="Days to collect Deposit"
          hint={DEPOSIT_HINT}
          testId="kpi-card-deposit"
          {...show(deposit)}
        />
        <KpiCard
          title="Days to collect Final Payment"
          hint={FINAL_HINT}
          testId="kpi-card-final"
          {...show(final)}
        />
      </div>
    );
  }

  return (
    <div data-testid="kpi-tab" className="mt-5">
      <AuditRangeControls range={range} onChange={setRange} />
      <div className="mt-4">{body}</div>
    </div>
  );
}
