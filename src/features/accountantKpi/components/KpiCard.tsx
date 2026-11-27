"use client";

import { InfoTooltip } from "@/components/InfoTooltip";

export type KpiCardProps = {
  title: string; // "Days to collect Deposit"
  hint: string; // the text of the (i)
  value: string; // "10 days", a dash, or "Loading..."
  detail?: string; // "3 payments"; left out while loading
  testId: string; // "kpi-card-deposit" or "kpi-card-final"
};

/**
 * One KPI: the title in small capitals with an (i) after it, the value large, and under it, in
 * small grey text, how many payments the value is made of. The look of the driver scorecard's
 * `KpiCard`, with the (i) the Accountant page's tabs already use.
 * docs/specs/accountant-kpi.md §2.4 (D8, D16).
 */
export function KpiCard({ title, hint, value, detail, testId }: KpiCardProps) {
  return (
    <div
      data-testid={testId}
      className="flex-1 min-w-[220px] bg-white border border-gray-200 rounded-xl p-4 shadow-sm"
    >
      <div className="flex items-center gap-1.5 mb-2">
        <div className="text-xs font-semibold text-gray-500 uppercase tracking-wider">{title}</div>
        <InfoTooltip content={hint} label={`About ${title}`} />
      </div>
      <div data-testid={`${testId}-value`} className="text-2xl font-bold text-darkBlue">
        {value}
      </div>
      {detail ? (
        <div data-testid={`${testId}-detail`} className="mt-1 text-xs text-gray-500">
          {detail}
        </div>
      ) : null}
    </div>
  );
}
