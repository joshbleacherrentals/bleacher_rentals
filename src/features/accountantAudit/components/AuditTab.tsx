"use client";

import { Truck } from "lucide-react";

/**
 * The body of the Audit tab: the history of one driver's work trackers. This is the shell: until a
 * driver is chosen it shows the empty state of the design. Specs 02 (the driver select), 03 (the
 * data) and 04 (the table) extend it; the empty state stays what it shows when no driver is chosen.
 * docs/specs/accountant-audit-01-tab.md §3
 */
export function AuditTab() {
  return (
    <div data-testid="audit-tab" className="mt-5">
      <div
        data-testid="audit-empty-state"
        className="flex flex-col items-center justify-center gap-3 rounded-[10px] border border-dashed border-gray-300 bg-gray-50 px-6 py-14 text-center"
      >
        <div className="flex h-11 w-11 items-center justify-center rounded-full border border-gray-200 bg-white">
          <Truck
            aria-hidden="true"
            className="h-[22px] w-[22px] text-gray-600"
            strokeWidth={1.75}
          />
        </div>
        <p className="text-base font-semibold text-gray-900">Choose a driver</p>
        <p className="max-w-[420px] text-sm text-gray-600">
          Pick a driver above to see all of their work trackers and whether each one has been paid.
        </p>
      </div>
    </div>
  );
}
