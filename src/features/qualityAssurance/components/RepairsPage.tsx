"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useMemo } from "react";
import { PageHeader } from "@/components/PageHeader";
import { useRepairs } from "../hooks/useRepairs";
import { useBleacherOptions } from "../hooks/useFilterOptions";
import { Wrench } from "lucide-react";

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString();
  } catch {
    return iso;
  }
}

function formatMoney(cents: number | null): string {
  if (cents == null) return "—";
  return `$${(cents / 100).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

export default function RepairsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const bleacherUuid = searchParams.get("bleacher_uuid");

  const bleachers = useBleacherOptions();
  const rows = useRepairs({ bleacherUuid });

  const updateFilter = (value: string) => {
    const params = new URLSearchParams(searchParams.toString());
    if (value) {
      params.set("bleacher_uuid", value);
    } else {
      params.delete("bleacher_uuid");
    }
    router.replace(`/repairs?${params.toString()}`);
  };

  const subtitle = useMemo(() => {
    if (!bleacherUuid) return "All maintenance and repair events across the fleet";
    const num = bleachers.find((b) => b.uuid === bleacherUuid)?.bleacherNumber;
    return num != null ? `Showing for Bleacher #${num}` : "Showing for selected bleacher";
  }, [bleacherUuid, bleachers]);

  return (
    <>
      <PageHeader title="Repairs" subtitle={subtitle} />

      <div className="flex flex-wrap gap-3 mb-4">
        <select
          value={bleacherUuid ?? ""}
          onChange={(e) => updateFilter(e.target.value)}
          className="px-3 py-2 border border-gray-300 rounded-md text-sm bg-white"
        >
          <option value="">All bleachers</option>
          {bleachers.map((b) => (
            <option key={b.uuid} value={b.uuid}>
              Bleacher #{b.bleacherNumber ?? "?"}
            </option>
          ))}
        </select>
      </div>

      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <table className="min-w-full">
          <thead>
            <tr className="border-b border-gray-200 bg-gray-50">
              <th className="px-5 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                Event
              </th>
              <th className="px-5 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                Start
              </th>
              <th className="px-5 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                End
              </th>
              <th className="px-5 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                Bleachers
              </th>
              <th className="px-5 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                Cost
              </th>
              <th className="px-5 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                Notes
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr
                key={row.maintenanceEventUuid}
                className="border-b border-gray-100 hover:bg-gray-50 transition-colors"
              >
                <td className="px-5 py-4 text-sm font-semibold text-darkBlue">
                  {row.eventName ?? "—"}
                </td>
                <td className="px-5 py-4 text-sm text-gray-700 whitespace-nowrap">
                  {formatDate(row.eventStart)}
                </td>
                <td className="px-5 py-4 text-sm text-gray-700 whitespace-nowrap">
                  {formatDate(row.eventEnd)}
                </td>
                <td className="px-5 py-4 text-sm text-gray-700">
                  {row.bleachers.length === 0 ? (
                    <span className="text-gray-400">—</span>
                  ) : (
                    <div className="flex flex-wrap gap-1">
                      {row.bleachers.map((b) => (
                        <span
                          key={b.uuid}
                          className="inline-block px-2 py-0.5 text-xs font-semibold bg-gray-100 text-darkBlue rounded"
                        >
                          #{b.bleacherNumber ?? "?"}
                        </span>
                      ))}
                    </div>
                  )}
                </td>
                <td className="px-5 py-4 text-sm text-gray-700 whitespace-nowrap">
                  {formatMoney(row.costCents)}
                </td>
                <td className="px-5 py-4 text-sm text-gray-600 max-w-md truncate">
                  {row.notes || "—"}
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={6} className="px-5 py-12 text-center text-gray-400">
                  <Wrench className="w-8 h-8 mx-auto mb-2 text-gray-300" />
                  No repairs found.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}
