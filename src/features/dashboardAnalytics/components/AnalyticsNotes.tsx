import { Info, TriangleAlert } from "lucide-react";

// docs/specs/dashboard-analytics-05-page.md §2.3 (D9, D10) and the boards Main and NoRate. The grey
// note says how many CAD repairs were converted; the amber line says how many have no rate and are
// left out. Both can show; the grey one comes first. Neither shows when the period has no CAD repair.

export function AnalyticsNotes({
  converted,
  withoutRate,
}: {
  converted: number;
  withoutRate: number;
}) {
  const convertedText =
    converted === 1
      ? "1 CAD repair was converted to USD at the Frankfurter (ECB) rate of its Repair from day."
      : `${converted} CAD repairs were converted to USD at the Frankfurter (ECB) rate of their Repair from day.`;
  const missingText =
    withoutRate === 1
      ? "1 CAD repair has no exchange rate yet and is not counted. Open the page again when you are online."
      : `${withoutRate} CAD repairs have no exchange rate yet and are not counted. Open the page again when you are online.`;

  return (
    <>
      {converted > 0 && (
        <div
          data-testid="cad-note"
          className="flex items-center gap-2 text-[13px] leading-[18px] text-[#4b5563]"
        >
          <Info aria-hidden="true" className="size-4 flex-none text-[#6b7280]" />
          <span data-testid="cad-note-text">{convertedText}</span>
        </div>
      )}
      {withoutRate > 0 && (
        <div
          role="status"
          data-testid="rate-missing"
          className="flex items-start gap-2.5 rounded-lg border border-[#fcd34d] bg-[#fffbeb] px-3.5 py-2.5 text-[13px] leading-[18px] text-[#92400e]"
        >
          <TriangleAlert aria-hidden="true" className="mt-px size-4 flex-none text-[#92400e]" />
          <span data-testid="rate-missing-text">{missingText}</span>
        </div>
      )}
    </>
  );
}
