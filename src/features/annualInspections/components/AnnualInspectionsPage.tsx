"use client";

import { useMemo, useState } from "react";
import { ClipboardCheck, StickyNote } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { useAnnualInspectionQueue } from "../hooks/useAnnualInspectionQueue";
import type { InspectionStatus } from "../logic/inspectionStatus";
import { InspectionStatusPill } from "./InspectionStatusPill";
import { InspectionDocumentLink, InspectionSheet } from "./InspectionSheet";

type Filter = "all" | "flagged" | InspectionStatus;

const FILTERS: { key: Filter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "flagged", label: "Needs attention" },
  { key: "overdue", label: "Overdue" },
  { key: "critical", label: "Due in 7 days" },
  { key: "warning", label: "Due in 30 days" },
  { key: "unscheduled", label: "No date" },
];

const FLAGGED: InspectionStatus[] = ["unscheduled", "overdue", "critical", "warning"];

export default function AnnualInspectionsPage() {
  const { rows, today } = useAnnualInspectionQueue();
  const [filter, setFilter] = useState<Filter>("all");
  const [search, setSearch] = useState("");
  const [openBleacher, setOpenBleacher] = useState<{ uuid: string; number: number | null } | null>(
    null,
  );

  const visible = useMemo(() => {
    const term = search.trim();
    return rows.filter((row) => {
      if (filter === "flagged" && !FLAGGED.includes(row.status)) return false;
      if (filter !== "all" && filter !== "flagged" && row.status !== filter) return false;
      if (term && !`${row.bleacherNumber ?? ""}`.includes(term)) return false;
      return true;
    });
  }, [rows, filter, search]);

  const unseenCount = useMemo(() => rows.filter((row) => row.isNew).length, [rows]);

  return (
    <>
      <PageHeader
        title="Annual Inspections"
        subtitle={
          unseenCount > 0
            ? `${unseenCount} bleacher${unseenCount === 1 ? "" : "s"} changed since you last looked`
            : "Every bleacher, soonest inspection first"
        }
      />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        {FILTERS.map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setFilter(key)}
            className={`rounded-full border px-3 py-1.5 text-sm ${
              filter === key
                ? "border-darkBlue bg-darkBlue text-white"
                : "border-gray-300 bg-white text-gray-700"
            }`}
          >
            {label}
          </button>
        ))}
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Bleacher #"
          aria-label="Search by bleacher number"
          className="ml-auto rounded-md border border-gray-300 px-3 py-2 text-sm"
        />
      </div>

      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
        <table className="min-w-full">
          <thead>
            <tr className="border-b border-gray-200 bg-gray-50">
              {["Bleacher", "Status", "Next due", "Last inspected", "Document", "Notes"].map(
                (h) => (
                  <th
                    key={h}
                    className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500"
                  >
                    {h}
                  </th>
                ),
              )}
            </tr>
          </thead>
          <tbody>
            {visible.map((row) => (
              <tr
                key={row.bleacherUuid}
                data-testid="inspection-row"
                data-bleacher={row.bleacherNumber ?? ""}
                data-status={row.status}
                data-new={row.isNew ? "true" : "false"}
                onClick={() =>
                  setOpenBleacher({ uuid: row.bleacherUuid, number: row.bleacherNumber })
                }
                className={`cursor-pointer border-b border-gray-100 transition-colors hover:bg-gray-50 ${
                  row.isNew ? "bg-amber-50/70 shadow-[inset_3px_0_0_0_#f59e0b]" : ""
                }`}
              >
                <td className="px-5 py-4 text-sm font-semibold text-darkBlue">
                  {row.bleacherNumber != null ? `#${row.bleacherNumber}` : "—"}
                </td>
                <td className="px-5 py-4 text-sm">
                  <InspectionStatusPill status={row.status} />
                </td>
                <td className="px-5 py-4 text-sm text-gray-700">{row.nextDueOn ?? "—"}</td>
                <td className="px-5 py-4 text-sm text-gray-700">{row.inspectedOn ?? "—"}</td>
                <td className="px-5 py-4 text-sm">
                  {row.documentPath ? <InspectionDocumentLink path={row.documentPath} /> : "—"}
                </td>
                <td className="px-5 py-4 text-sm text-gray-600">
                  {row.notes ? (
                    <span className="inline-flex items-center gap-1" title={row.notes}>
                      <StickyNote className="h-4 w-4 text-gray-400" />
                      <span className="max-w-xs truncate">{row.notes}</span>
                    </span>
                  ) : (
                    "—"
                  )}
                </td>
              </tr>
            ))}
            {visible.length === 0 && (
              <tr>
                <td colSpan={6} className="px-5 py-12 text-center text-gray-400">
                  <ClipboardCheck className="mx-auto mb-2 h-8 w-8 text-gray-300" />
                  Nothing here.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {openBleacher && (
        <InspectionSheet
          bleacherUuid={openBleacher.uuid}
          bleacherNumber={openBleacher.number}
          today={today}
          onClose={() => setOpenBleacher(null)}
        />
      )}
    </>
  );
}
