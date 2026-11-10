"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowDown, ArrowUp, ArrowUpDown, ChevronRight } from "lucide-react";
import {
  formatTotalsAmounts,
  sumByCurrency,
} from "@/features/quotesAndBookings/utils/eventCurrency";
import type { AuditDriverRow } from "../utils/auditDriverRows";
import { formatDriverDistance, formatDriverDriveTime, formatPayAmount } from "../utils/auditFormat";
import type { AuditSort, AuditSortKey } from "../utils/auditSort";
import { AuditAvatar } from "./AuditAvatar";

type Props = {
  rows: AuditDriverRow[];
  sort: AuditSort;
  onSort: (key: AuditSortKey) => void;
  /** Where a row leads: the driver page (D9, R5). */
  getRowHref: (row: AuditDriverRow) => string;
  emptyMessage: string;
};

type Align = "left" | "right";

/** The numbers sit on the right edge of their column, so the digits line up row under row. */
const COLUMNS: { key: AuditSortKey; label: string; align: Align }[] = [
  { key: "driver", label: "Driver", align: "left" },
  { key: "distance", label: "Distance", align: "right" },
  { key: "time", label: "Drive Time", align: "right" },
  { key: "trips", label: "Trips", align: "right" },
  { key: "pay", label: "Pay", align: "right" },
];

const HEADER_CELL = "px-5 py-3 text-xs font-semibold uppercase tracking-wider";

/** The cell of a number: right-aligned, never wrapped, digits of one width. */
const NUMBER_CELL = "whitespace-nowrap px-5 py-3.5 text-right text-sm tabular-nums";

/** The column the rows are sorted by reads darker than the rest, so the order is easy to follow. */
function numberTone(sort: AuditSort, key: AuditSortKey): string {
  return sort.key === key ? "font-semibold text-darkBlue" : "text-gray-600";
}

/**
 * A header: a button in the `<th>`, `aria-sort`, an arrow (R22), as Collections' `SortHeader`. A
 * `caption` goes under the button, outside it, so a click on it does not sort.
 */
function SortHeader({
  label,
  sortKey,
  sort,
  align,
  onSort,
  caption,
}: {
  label: string;
  sortKey: AuditSortKey;
  sort: AuditSort;
  align: Align;
  onSort: (key: AuditSortKey) => void;
  caption?: string;
}) {
  const active = sort.key === sortKey;
  const ariaSort = !active ? "none" : sort.direction === "asc" ? "ascending" : "descending";
  const Icon = !active ? ArrowUpDown : sort.direction === "asc" ? ArrowUp : ArrowDown;
  return (
    <th
      scope="col"
      aria-sort={ariaSort}
      className={`${HEADER_CELL} ${align === "right" ? "text-right" : "text-left"}`}
    >
      <button
        type="button"
        data-testid={`audit-sort-${sortKey}`}
        onClick={() => onSort(sortKey)}
        className={`inline-flex cursor-pointer items-center gap-1 uppercase tracking-wider hover:text-gray-800 ${
          align === "right" ? "flex-row-reverse" : ""
        } ${active ? "text-darkBlue" : "text-gray-500"}`}
      >
        <span>{label}</span>
        <Icon className={`size-3 ${active ? "" : "opacity-45"}`} aria-hidden="true" />
      </button>
      {caption && (
        <div
          title="Total pay of the drivers listed"
          data-testid="audit-pay-total"
          className="mt-0.5 whitespace-nowrap text-xs font-medium normal-case tabular-nums tracking-normal text-gray-700"
        >
          {caption}
        </div>
      )}
    </th>
  );
}

/**
 * The drivers table of the Audit tab, in the scorecard's style: the card, the grey header row, the
 * text sizes and the hover. Five columns and no `#` (D18); distance in miles and kilometres (D16);
 * pay with its currency (D17); every header sorts (D19). A row is a link (D9, R5): the name is a
 * real `<a>`, and a click anywhere else on the row follows it by `router.push`. The look: initials
 * beside the name, the numbers on the right, the sorted column darker, a chevron at the row's end.
 * docs/specs/accountant-audit-05-drivers-table.md §2.3 (R2, R22, R24, R25).
 */
export function AuditDriversTable({ rows, sort, onSort, getRowHref, emptyMessage }: Props) {
  const router = useRouter();
  // The total of the rows listed (so a search narrows it), one per currency: USD and CAD do not add
  // up. Whole dollars, as the Subtotal and Tax headers of /quotes-bookings.
  const payTotal = formatTotalsAmounts(
    sumByCurrency(
      rows,
      (r) => r.payCents,
      (r) => r.payCurrency,
    ),
  );

  return (
    <div
      data-testid="audit-drivers-table"
      className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm"
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
                  align={c.align}
                  onSort={onSort}
                  caption={c.key === "pay" ? payTotal : undefined}
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
                  className="group cursor-pointer border-b border-gray-100 transition-colors last:border-b-0 hover:bg-gray-50"
                >
                  <td className="px-5 py-3">
                    <div className="flex items-center gap-3">
                      <AuditAvatar name={name} />
                      <Link href={href} className="font-semibold text-darkBlue hover:underline">
                        {name}
                      </Link>
                    </div>
                  </td>
                  <td className={`${NUMBER_CELL} ${numberTone(sort, "distance")}`}>
                    {formatDriverDistance(row.distanceMeters)}
                  </td>
                  <td className={`${NUMBER_CELL} ${numberTone(sort, "time")}`}>
                    {formatDriverDriveTime(row.driveMinutes)}
                  </td>
                  <td className={`${NUMBER_CELL} ${numberTone(sort, "trips")}`}>{row.tripCount}</td>
                  <td className={`${NUMBER_CELL} ${numberTone(sort, "pay")}`}>
                    <div className="flex items-center justify-end gap-3">
                      <span>{formatPayAmount(row.payCents, row.payCurrency)}</span>
                      <ChevronRight
                        aria-hidden="true"
                        className="size-4 shrink-0 text-gray-300 transition-colors group-hover:text-darkBlue"
                      />
                    </div>
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
