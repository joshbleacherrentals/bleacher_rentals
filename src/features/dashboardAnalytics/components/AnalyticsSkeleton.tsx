import { LoaderCircle } from "lucide-react";
import { CARD_CLASS } from "./AnalyticsBlock";

// docs/specs/dashboard-analytics-05-page.md §2.8 and the board Loading: a line with a spinner, five
// grey cards in a row and five grey blocks, marked busy.

export function AnalyticsSkeleton() {
  return (
    <>
      <div
        role="status"
        className="flex items-center gap-2 text-[13px] leading-[18px] text-[#4b5563]"
      >
        <LoaderCircle
          aria-hidden="true"
          className="size-4 text-[#6b7280] motion-safe:animate-spin"
        />
        <span>Reading repairs and exchange rates</span>
      </div>
      <div aria-busy="true" className="flex flex-col gap-6">
        <div className="flex flex-wrap gap-4">
          {Array.from({ length: 5 }, (_, index) => (
            <div
              key={index}
              data-testid="skeleton-card"
              className={`${CARD_CLASS} box-border min-w-0 flex-[1_1_230px] px-5 py-4`}
            >
              <div className="h-3 w-3/5 rounded bg-[#f3f4f6]" />
              <div className="mt-3 h-7 w-[45%] rounded bg-[#e5e7eb]" />
              <div className="mt-3 h-3 w-3/4 rounded bg-[#f3f4f6]" />
            </div>
          ))}
        </div>
        {Array.from({ length: 5 }, (_, index) => (
          <div key={index} data-testid="skeleton-block" className={`${CARD_CLASS} box-border p-5`}>
            <div className="h-4 w-80 max-w-[70%] rounded bg-[#e5e7eb]" />
            <div className="mt-5 h-3 rounded bg-[#f3f4f6]" />
            <div className="mt-3.5 h-3 rounded bg-[#f3f4f6]" />
            <div className="mt-3.5 h-3 rounded bg-[#f3f4f6]" />
            <div className="mt-3.5 h-3 w-3/5 rounded bg-[#f3f4f6]" />
          </div>
        ))}
      </div>
    </>
  );
}
