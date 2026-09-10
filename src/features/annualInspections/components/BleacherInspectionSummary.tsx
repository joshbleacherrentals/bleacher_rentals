"use client";

import { useState } from "react";
import { ClipboardCheck } from "lucide-react";
import { useInspectionHistory } from "../db/annualInspections";
import { inspectionStatus } from "../logic/inspectionStatus";
import { todayLocal } from "../logic/dateOnly";
import { InspectionStatusPill } from "./InspectionStatusPill";
import { InspectionSheet } from "./InspectionSheet";

/**
 * The annual inspection, shown where the bleacher itself is edited.
 *
 * Read-only here on purpose: recording an inspection is the same sheet the
 * queue page opens, so there is one form and one write path rather than two
 * that drift.
 */
export function BleacherInspectionSummary({
  bleacherUuid,
  bleacherNumber,
}: {
  bleacherUuid: string;
  bleacherNumber: number | null;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const history = useInspectionHistory(bleacherUuid);
  const current = history[0] ?? null;
  const today = todayLocal();

  return (
    <div
      className="mt-4 rounded-lg border border-gray-200 p-3"
      data-testid="bleacher-inspection-summary"
    >
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="text-sm font-semibold text-darkBlue">Annual inspection</span>
        <InspectionStatusPill status={inspectionStatus(current?.next_due_on ?? null, today)} />
      </div>
      <p className="text-xs text-gray-500">
        Next due{" "}
        <span data-testid="bleacher-next-due" className="font-medium text-gray-700">
          {current?.next_due_on ?? "—"}
        </span>
      </p>
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        className="mt-2 inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-sm font-medium text-gray-600 transition-colors hover:bg-gray-50"
      >
        <ClipboardCheck className="h-4 w-4" />
        Manage inspections
      </button>

      {isOpen && (
        <InspectionSheet
          bleacherUuid={bleacherUuid}
          bleacherNumber={bleacherNumber}
          today={today}
          onClose={() => setIsOpen(false)}
        />
      )}
    </div>
  );
}
