"use client";

import Link from "next/link";
import { ArrowDown, ArrowUp, ArrowUpDown, ChevronRight } from "lucide-react";
import { formatMoney } from "@/features/quotesAndBookings/utils/formatMoney";
import type { CollectionsListState, CollectionsSortKey } from "../utils/collectionsListState";
import type { CollectionsRow } from "../utils/collectionsRows";
import { invoiceHref } from "../utils/invoiceUrl";
import { followUpLabel, overdueLabel } from "../utils/relativeDays";

/**
 * The table of the Collections tab. docs/specs/accountant-collections-09-design.md §3.
 *
 * A row is a link: the Name cell holds the link and stretches it over the whole row, so the row
 * stays a table row. The three sortable headers are buttons; `aria-sort` follows the list state.
 */

const GRID = "px-5 py-3";
const HEADER = "text-xs font-medium uppercase tracking-wider";

function followUpClasses(dueDate: string, today: string): string {
  if (dueDate < today) return "text-red-700";
  if (dueDate === today) return "text-amber-700 font-semibold";
  return "text-gray-600";
}

function SortHeader({
  label,
  sortKey,
  state,
  align,
  onSort,
}: {
  label: string;
  sortKey: CollectionsSortKey;
  state: CollectionsListState;
  align: "left" | "right";
  onSort: (key: CollectionsSortKey) => void;
}) {
  const active = state.sort === sortKey;
  const ariaSort = !active ? "none" : state.dir === "asc" ? "ascending" : "descending";
  const Icon = !active ? ArrowUpDown : state.dir === "asc" ? ArrowUp : ArrowDown;
  return (
    <th
      scope="col"
      aria-sort={ariaSort}
      className={`${GRID} ${align === "right" ? "text-right" : "text-left"}`}
    >
      <button
        type="button"
        onClick={() => onSort(sortKey)}
        className={`${HEADER} inline-flex cursor-pointer items-center gap-1 hover:text-gray-800 ${
          active ? "text-darkBlue" : "text-gray-500"
        }`}
      >
        <span>{label}</span>
        <Icon className={`size-3 ${active ? "" : "opacity-45"}`} aria-hidden />
      </button>
    </th>
  );
}

export function CollectionsTable({
  rows,
  state,
  today,
  isLoading,
  error,
  onSort,
}: {
  rows: readonly CollectionsRow[];
  state: CollectionsListState;
  /** `YYYY-MM-DD`, the date in the timezone store. */
  today: string;
  isLoading: boolean;
  error: Error | undefined;
  onSort: (key: CollectionsSortKey) => void;
}) {
  return (
    <div className="overflow-hidden rounded-[10px] border border-gray-200 bg-white">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[940px] text-sm">
          <thead className="bg-gray-50">
            <tr>
              <th scope="col" className={`${GRID} ${HEADER} text-left text-gray-500`}>
                Name
              </th>
              <SortHeader
                label="Next Follow Up"
                sortKey="followUp"
                state={state}
                align="left"
                onSort={onSort}
              />
              <SortHeader
                label="Payment Overdue"
                sortKey="overdue"
                state={state}
                align="left"
                onSort={onSort}
              />
              <th scope="col" className={`${GRID} ${HEADER} text-left text-gray-500`}>
                Task Notes
              </th>
              <SortHeader
                label="Amount Overdue"
                sortKey="amount"
                state={state}
                align="right"
                onSort={onSort}
              />
              <th scope="col" className="w-10">
                <span className="sr-only">Open</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr
                key={row.eventId}
                className="relative min-h-14 border-t border-gray-200 hover:bg-gray-50"
              >
                <td className={`${GRID} max-w-[260px] font-medium text-gray-900`}>
                  <Link
                    href={invoiceHref({ eventId: row.eventId, tab: "info", listState: state })}
                    className="block truncate after:absolute after:inset-0 focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-lightBlue"
                  >
                    {row.eventName}
                  </Link>
                </td>
                <td className={GRID}>
                  <span className={followUpClasses(row.dueDate, today)}>
                    {followUpLabel(row.dueDate, today)}
                  </span>
                </td>
                <td className={`${GRID} text-gray-900`}>{overdueLabel(row.daysOverdue)}</td>
                <td className={`${GRID} max-w-[320px] text-gray-700`}>
                  <span title={row.note} className="block truncate">
                    {row.note}
                  </span>
                </td>
                <td className={`${GRID} text-right font-semibold tabular-nums text-gray-900`}>
                  {formatMoney(row.amountDueCents, row.currency)}
                </td>
                <td className="w-10 pr-4">
                  <ChevronRight className="size-4 text-gray-400" aria-hidden />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {isLoading ? (
        <p className="py-8 text-center text-sm text-gray-400">Loading tasks…</p>
      ) : error ? (
        <p role="alert" className="py-8 text-center text-sm text-red-500">
          Error loading tasks: {error.message}
        </p>
      ) : rows.length === 0 ? (
        <p className="py-8 text-center text-sm text-gray-400">No tasks to follow up</p>
      ) : null}
    </div>
  );
}
