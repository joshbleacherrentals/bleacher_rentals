import { formatMoney } from "@/features/quotesAndBookings/utils/formatMoney";
import type { CurrencyTotals, RepairTab } from "../utils/repairRows";

export type RepairsTotalsStripProps = {
  tab: RepairTab;
  /** The Show Deleted view: the caption says the rows are deleted ones (D70). */
  deleted: boolean;
  /** Null while the list loads: each amount is a dash. */
  totals: CurrencyTotals | null;
};

function TotalCell({ label, testId, value }: { label: string; testId: string; value: string }) {
  return (
    <div className="min-w-[170px] px-6 py-3">
      <div className="text-xs leading-4 font-medium tracking-wider whitespace-nowrap text-[#6b7280] uppercase">
        {label}
      </div>
      <div
        data-testid={testId}
        className="text-[22px] leading-[30px] font-semibold text-[#10365a] tabular-nums"
      >
        {value}
      </div>
    </div>
  );
}

/**
 * The two totals above the tabs: the Total of the rows of the current tab, in CAD and in USD, with
 * cents and not converted. docs/specs/repairs-04-table.md §2.7 (D13, D48, D49, D51) and
 * docs/specs/repairs-05-toolbar.md D70 (the caption in the Show Deleted view).
 */
export function RepairsTotalsStrip({ tab, deleted, totals }: RepairsTotalsStripProps) {
  const caption = `${deleted ? "Deleted " : ""}${
    tab === "open" ? "open" : "completed"
  } repairs that match the filters`;
  // Without the Deleted word the caption starts with a capital, as on the canvas.
  const shown = caption.charAt(0).toUpperCase() + caption.slice(1);
  return (
    <div
      role="group"
      aria-label="Total cost of the repairs in this tab"
      className="flex flex-wrap items-stretch rounded-[10px] border border-[#e5e7eb] bg-white"
    >
      <TotalCell
        label="Total cost · CAD"
        testId="repairs-strip-cad"
        value={totals ? formatMoney(totals.CAD, "CAD") : "—"}
      />
      <div aria-hidden="true" className="w-px bg-[#e5e7eb]" />
      <TotalCell
        label="Total cost · USD"
        testId="repairs-strip-usd"
        value={totals ? formatMoney(totals.USD, "USD") : "—"}
      />
      <div className="flex flex-[1_1_240px] items-center justify-end px-6 py-3 text-right text-[13px] leading-[18px] text-[#6b7280]">
        {shown}
      </div>
    </div>
  );
}
