"use client";

import Link from "next/link";
import { useState } from "react";
import { ChevronRight, Plus } from "lucide-react";
import { quarterDateRange, quarterLabel } from "../types";
import type { QuarterItem, YearGroup } from "../util/groupQuartersByYear";

type Props = {
  groups: YearGroup[];
  onEdit: (quarterId: string) => void;
  onCreate: (year: number, quarter: number) => void;
};

/**
 * The roadmap home: years newest-first, each collapsible. Today's quarter is a large card; every
 * other quarter is a quiet row, so the thing people click most is also the thing that stands out.
 */
export function QuarterYearList({ groups, onEdit, onCreate }: Props) {
  const [expanded, setExpanded] = useState<Set<number>>(
    () => new Set(groups.filter((g) => g.defaultExpanded).map((g) => g.year)),
  );

  const toggle = (year: number) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(year)) next.delete(year);
      else next.add(year);
      return next;
    });

  return (
    <div className="space-y-4">
      {groups.map((group) => {
        const isOpen = expanded.has(group.year);
        return (
          <section key={group.year}>
            <button
              type="button"
              onClick={() => toggle(group.year)}
              aria-expanded={isOpen}
              className={`flex w-full items-center gap-2 py-1 text-left cursor-pointer ${
                group.defaultExpanded ? "text-gray-900" : "text-gray-500 hover:text-gray-800"
              }`}
            >
              <ChevronRight
                className={`size-4 shrink-0 transition-transform ${isOpen ? "rotate-90" : ""}`}
              />
              <span className="text-lg font-semibold">{group.year}</span>
              <span className="text-xs text-gray-400">
                {group.items.filter((i) => i.exists).length} quarter
                {group.items.filter((i) => i.exists).length === 1 ? "" : "s"}
              </span>
            </button>

            {isOpen && (
              <div className="mt-2 space-y-2 pl-6">
                {group.items.map((item) => (
                  <QuarterEntry
                    key={item.quarter}
                    year={group.year}
                    item={item}
                    onEdit={onEdit}
                    onCreate={onCreate}
                  />
                ))}
              </div>
            )}
          </section>
        );
      })}
    </div>
  );
}

function QuarterEntry({
  year,
  item,
  onEdit,
  onCreate,
}: {
  year: number;
  item: QuarterItem;
  onEdit: (quarterId: string) => void;
  onCreate: (year: number, quarter: number) => void;
}) {
  const label = quarterLabel(year, item.quarter);

  if (!item.exists) {
    return (
      <button
        type="button"
        onClick={() => onCreate(year, item.quarter)}
        className="w-full rounded-lg border-2 border-dashed border-darkBlue/40 p-6 text-center hover:border-darkBlue hover:bg-blue-50 transition cursor-pointer"
      >
        <span className="flex items-center justify-center gap-2 text-lg font-semibold text-darkBlue">
          <Plus className="size-5" />
          Create {label}
        </span>
        <span className="mt-1 block text-xs text-gray-500">
          {quarterDateRange(year, item.quarter)} · this quarter hasn&apos;t been set up yet
        </span>
      </button>
    );
  }

  const quarter = item.existing!;

  if (item.kind === "current") {
    return (
      <div className="rounded-lg border-2 border-darkBlue bg-white p-5 shadow-sm">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <Link
                href={`/roadmap/${quarter.id}`}
                className="text-2xl font-bold text-darkBlue hover:underline"
              >
                {label}
              </Link>
              <span className="rounded-full bg-darkBlue px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white">
                Current
              </span>
            </div>
            <p className="mt-0.5 text-sm text-gray-500">{quarterDateRange(year, item.quarter)}</p>
          </div>
          <button
            type="button"
            onClick={() => onEdit(quarter.id)}
            className="text-xs text-gray-500 hover:text-darkBlue cursor-pointer"
          >
            Edit
          </button>
        </div>
        <div className="mt-4 flex justify-end">
          <Link
            href={`/roadmap/${quarter.id}`}
            className="rounded bg-darkBlue px-4 py-2 text-sm font-medium text-white hover:bg-lightBlue transition"
          >
            Open {label} →
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-between gap-4 rounded border border-gray-200 bg-gray-50/60 px-4 py-2.5">
      <div className="flex items-baseline gap-3 min-w-0">
        <Link
          href={`/roadmap/${quarter.id}`}
          className="text-sm font-medium text-gray-600 hover:text-darkBlue"
        >
          {label}
        </Link>
        <span className="truncate text-xs text-gray-400">
          {quarterDateRange(year, item.quarter)}
        </span>
        {item.kind === "future" && (
          <span className="text-[10px] font-medium uppercase tracking-wide text-gray-400">
            Upcoming
          </span>
        )}
      </div>
      <div className="flex shrink-0 items-center gap-3">
        <button
          type="button"
          onClick={() => onEdit(quarter.id)}
          className="text-xs text-gray-400 hover:text-darkBlue cursor-pointer"
        >
          Edit
        </button>
        <Link href={`/roadmap/${quarter.id}`} className="text-xs text-gray-500 hover:text-darkBlue">
          Open →
        </Link>
      </div>
    </div>
  );
}
