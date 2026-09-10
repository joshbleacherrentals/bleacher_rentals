"use client";

import type { InspectionStatus } from "../logic/inspectionStatus";

const STYLES: Record<InspectionStatus, { label: string; className: string }> = {
  unscheduled: { label: "No date", className: "bg-gray-100 text-gray-600 border-gray-200" },
  ok: { label: "OK", className: "bg-green-50 text-green-700 border-green-200" },
  warning: { label: "Due in 30 days", className: "bg-yellow-50 text-yellow-800 border-yellow-300" },
  critical: { label: "Due in 7 days", className: "bg-red-50 text-red-700 border-red-300" },
  overdue: { label: "Overdue", className: "bg-red-600 text-white border-red-700" },
};

export function InspectionStatusPill({ status }: { status: InspectionStatus }) {
  const { label, className } = STYLES[status];
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold whitespace-nowrap ${className}`}
    >
      {label}
    </span>
  );
}
