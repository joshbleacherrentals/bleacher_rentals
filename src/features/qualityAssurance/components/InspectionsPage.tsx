"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";
import { PageHeader } from "@/components/PageHeader";
import { useInspections, type InspectionListRow } from "../hooks/useInspections";
import { useBleacherOptions, useDriverOptions } from "../hooks/useFilterOptions";
import { CheckCircle2, AlertTriangle, ClipboardCheck } from "lucide-react";
import InspectionDetailModal from "./InspectionDetailModal";

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString();
  } catch {
    return iso;
  }
}

function driverName(row: InspectionListRow): string {
  return [row.driverFirstName, row.driverLastName].filter(Boolean).join(" ") || "—";
}

export default function InspectionsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const bleacherUuid = searchParams.get("bleacher_uuid");
  const driverUuid = searchParams.get("driver_uuid");

  const bleachers = useBleacherOptions();
  const drivers = useDriverOptions();
  const rows = useInspections({ bleacherUuid, driverUuid });
  const [selectedRow, setSelectedRow] = useState<InspectionListRow | null>(null);

  const updateFilter = (key: "bleacher_uuid" | "driver_uuid", value: string) => {
    const params = new URLSearchParams(searchParams.toString());
    if (value) {
      params.set(key, value);
    } else {
      params.delete(key);
    }
    router.replace(`/inspections?${params.toString()}`);
  };

  const subtitleParts = useMemo(() => {
    const parts: string[] = [];
    if (bleacherUuid) {
      const num = bleachers.find((b) => b.uuid === bleacherUuid)?.bleacherNumber;
      if (num != null) parts.push(`Bleacher #${num}`);
    }
    if (driverUuid) {
      const d = drivers.find((d) => d.uuid === driverUuid);
      if (d) parts.push([d.firstName, d.lastName].filter(Boolean).join(" "));
    }
    return parts;
  }, [bleacherUuid, driverUuid, bleachers, drivers]);

  return (
    <>
      <PageHeader
        title="Inspections"
        subtitle={
          subtitleParts.length > 0
            ? `Showing for ${subtitleParts.join(" · ")}`
            : "All pre-trip and post-trip inspections across the fleet"
        }
      />

      <div className="flex flex-wrap gap-3 mb-4">
        <select
          value={bleacherUuid ?? ""}
          onChange={(e) => updateFilter("bleacher_uuid", e.target.value)}
          className="px-3 py-2 border border-gray-300 rounded-md text-sm bg-white"
        >
          <option value="">All bleachers</option>
          {bleachers.map((b) => (
            <option key={b.uuid} value={b.uuid}>
              Bleacher #{b.bleacherNumber ?? "?"}
            </option>
          ))}
        </select>
        <select
          value={driverUuid ?? ""}
          onChange={(e) => updateFilter("driver_uuid", e.target.value)}
          className="px-3 py-2 border border-gray-300 rounded-md text-sm bg-white"
        >
          <option value="">All drivers</option>
          {drivers.map((d) => (
            <option key={d.uuid} value={d.uuid}>
              {[d.firstName, d.lastName].filter(Boolean).join(" ") || "—"}
            </option>
          ))}
        </select>
      </div>

      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <table className="min-w-full">
          <thead>
            <tr className="border-b border-gray-200 bg-gray-50">
              <th className="px-5 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                Date
              </th>
              <th className="px-5 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                Type
              </th>
              <th className="px-5 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                Bleacher
              </th>
              <th className="px-5 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                Driver
              </th>
              <th className="px-5 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                Walk-around
              </th>
              <th className="px-5 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                Issues
              </th>
              <th className="px-5 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                Notes
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr
                key={`${row.workTrackerId}-${row.inspectionKind}`}
                onClick={() => setSelectedRow(row)}
                className="border-b border-gray-100 hover:bg-gray-50 transition-colors cursor-pointer"
              >
                <td className="px-5 py-4 text-sm text-gray-700 whitespace-nowrap">
                  {formatDate(row.createdAt ?? row.workTrackerDate)}
                </td>
                <td className="px-5 py-4 text-sm font-semibold text-darkBlue uppercase">
                  {row.inspectionKind}-trip
                </td>
                <td className="px-5 py-4 text-sm text-darkBlue font-semibold">
                  {row.bleacherNumber != null ? `#${row.bleacherNumber}` : "—"}
                </td>
                <td className="px-5 py-4 text-sm text-gray-700">{driverName(row)}</td>
                <td className="px-5 py-4 text-sm">
                  {row.walkAroundComplete ? (
                    <span className="inline-flex items-center gap-1 text-green-600">
                      <CheckCircle2 className="w-4 h-4" />
                      Complete
                    </span>
                  ) : (
                    <span className="text-gray-400">Incomplete</span>
                  )}
                </td>
                <td className="px-5 py-4 text-sm">
                  {row.issuesFound ? (
                    <span className="inline-flex items-center gap-1 text-yellow-600">
                      <AlertTriangle className="w-4 h-4" />
                      Yes
                    </span>
                  ) : (
                    <span className="text-gray-400">None</span>
                  )}
                </td>
                <td className="px-5 py-4 text-sm text-gray-600 max-w-md truncate">
                  {row.issueDescription || "—"}
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={7} className="px-5 py-12 text-center text-gray-400">
                  <ClipboardCheck className="w-8 h-8 mx-auto mb-2 text-gray-300" />
                  No inspections found.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <InspectionDetailModal row={selectedRow} onClose={() => setSelectedRow(null)} />
    </>
  );
}
