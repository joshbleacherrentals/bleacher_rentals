"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";
import type { AuditDriverRow } from "../utils/auditDriverRows";
import { formatDriverDistance, formatDriverDriveTime, formatPayAmount } from "../utils/auditFormat";
import type { AuditSort, AuditSortKey } from "../utils/auditSort";

type Props = {
  rows: AuditDriverRow[];
  sort: AuditSort;
  onSort: (key: AuditSortKey) => void;
  /** Where a row leads: the driver page (D9, R5). */
  getRowHref: (row: AuditDriverRow) => string;
  emptyMessage: string;
};

const COLUMNS: { key: AuditSortKey; label: string }[] = [
  { key: "driver", label: "Driver" },
  { key: "distance", label: "Distance" },
  { key: "time", label: "Drive Time" },
  { key: "trips", label: "Trips" },
  { key: "pay", label: "Pay" },
];

const HEADER_CELL = "px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider";

/** A header: a button in the `<th>`, `aria-sort`, an arrow (R22), as Collections' `SortHeader`. */
function SortHeader({
  label,
  sortKey,
  sort,
  onSort,
}: {
  label: string;
  sortKey: AuditSortKey;
  sort: AuditSort;
  onSort: (key: AuditSortKey) => void;
}) {
  const active = sort.key === sortKey;
  const ariaSort = !active ? "none" : sort.direction === "asc" ? "ascending" : "descending";
  const Icon = !active ? ArrowUpDown : sort.direction === "asc" ? ArrowUp : ArrowDown;
  return (
    <th scope="col" aria-sort={ariaSort} className={HEADER_CELL}>
      <button
        type="button"
        data-testid={`audit-sort-${sortKey}`}
        onClick={() => onSort(sortKey)}
        className={`inline-flex cursor-pointer items-center gap-1 uppercase tracking-wider hover:text-gray-800 ${
          active ? "text-darkBlue" : "text-gray-500"
        }`}
      >
        <span>{label}</span>
        <Icon className={`size-3 ${active ? "" : "opacity-45"}`} aria-hidden="true" />
      </button>
    </th>
  );
}

/**
 * The drivers table of the Audit tab, in the scorecard's style: the card, the grey header row, the
 * text sizes and the hover. Five columns and no `#` (D18); distance in miles and kilometres (D16);
 * pay with its currency (D17); every header sorts (D19). A row is a link (D9, R5): the name is a
 * real `<a>`, and a click anywhere else on the row follows it by `router.push`.
 * docs/specs/accountant-audit-05-drivers-table.md §2.3 (R2, R22, R24, R25).
 */
export function AuditDriversTable({ rows, sort, onSort, getRowHref, emptyMessage }: Props) {
  const router = useRouter();

  return (
    <div
      data-testid="audit-drivers-table"
      className="overflow-hidden rounded-xl border border-gray-200 bg-white"
    >
      <div className="overflow-x-auto">
        <table className="min-w-full">
          <thead>
            <tr className="border-b border-gray-200 bg-gray-50">
              {COLUMNS.map((c) => (
                <SortHeader
                  key={c.key}
                  label={c.label}
                  sortKey={c.key}
                  sort={sort}
                  onSort={onSort}
                />
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const name =
                [row.firstName, row.lastName].filter(Boolean).join(" ") || "Unknown Driver";
              const href = getRowHref(row);
              return (
                <tr
                  key={row.driverUuid}
                  data-testid="audit-driver-row"
                  onClick={(e) => {
                    // A click that already hit the name link is the link's own.
                    if ((e.target as HTMLElement).closest("a")) return;
                    router.push(href);
                  }}
                  className="cursor-pointer border-b border-gray-100 transition-colors hover:bg-gray-50"
                >
                  <td className="px-5 py-4 font-semibold text-darkBlue">
                    <Link href={href} className="hover:underline">
                      {name}
                    </Link>
                  </td>
                  <td className="whitespace-nowrap px-5 py-4 font-semibold text-darkBlue">
                    {formatDriverDistance(row.distanceMeters)}
                  </td>
                  <td className="whitespace-nowrap px-5 py-4 text-sm text-gray-600">
                    {formatDriverDriveTime(row.driveMinutes)}
                  </td>
                  <td className="px-5 py-4 text-sm text-gray-600">{row.tripCount}</td>
                  <td className="whitespace-nowrap px-5 py-4 text-sm text-gray-600">
                    {formatPayAmount(row.payCents, row.payCurrency)}
                  </td>
                </tr>
              );
            })}
            {rows.length === 0 && (
              <tr>
                <td
                  colSpan={COLUMNS.length}
                  data-testid="audit-drivers-empty"
                  className="px-5 py-12 text-center text-gray-400"
                >
                  {emptyMessage}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
