"use client";

import { ChevronsLeft, SlidersHorizontal } from "lucide-react";
import type { ComponentProps } from "react";
import { QuotesBookingsFilters } from "../types";
import { FilterPanel } from "./FilterPanel";

type FilterSidebarProps = ComponentProps<typeof FilterPanel> & {
  isOpen: boolean;
  onToggle: () => void;
  onClear: () => void;
  /** Pixel cap for the sidebar so its contents scroll instead of running off screen. */
  maxHeight?: number;
};

/** How many filters are narrowing the list — shown next to the sidebar title and on the header button. */
export function countActiveFilters(filters: QuotesBookingsFilters): number {
  const ranges: [string | null, string | null][] = [
    [filters.createdFrom, filters.createdTo],
    [filters.eventFrom, filters.eventTo],
    [filters.bookedFrom, filters.bookedTo],
  ];
  return (
    (filters.statuses.length > 0 ? 1 : 0) +
    ranges.filter(([from, to]) => from || to).length +
    (filters.accountManagerUserUuid ? 1 : 0) +
    (filters.salesOfficeUuid ? 1 : 0) +
    (filters.inGoodShuffle !== null ? 1 : 0) +
    (filters.inQuickBooks !== null ? 1 : 0)
  );
}

/**
 * Pinned left-hand filter bar, styled like the app's side nav. Fixed width when open and gone when
 * collapsed; the controls scroll inside it when the window is short.
 */
export function FilterSidebar({
  isOpen,
  onToggle,
  onClear,
  maxHeight,
  ...panelProps
}: FilterSidebarProps) {
  const activeCount = countActiveFilters(panelProps.filters);
  const style = maxHeight ? { maxHeight } : undefined;

  // Collapsed takes no room at all; the page header's Filters button brings it back.
  if (!isOpen) return null;

  return (
    <aside
      aria-label="Filters"
      style={style}
      className="sticky top-4 self-start shrink-0 w-72 bg-gray-100 border border-gray-200 rounded-lg flex flex-col overflow-hidden"
    >
      <div className="flex items-center justify-between px-3 py-2 border-b border-gray-200">
        <div className="flex items-center gap-2 text-sm font-semibold text-gray-800">
          <SlidersHorizontal className="h-4 w-4" />
          Filters
          {activeCount > 0 && (
            <span className="min-w-4 h-4 px-1 rounded-full bg-darkBlue text-white text-[10px] leading-4 text-center">
              {activeCount}
            </span>
          )}
        </div>
        <button
          type="button"
          onClick={onToggle}
          title="Hide filters"
          aria-label="Hide filters"
          aria-expanded
          className="p-1 rounded text-gray-500 hover:bg-gray-200 cursor-pointer"
        >
          <ChevronsLeft className="h-4 w-4" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto overflow-x-hidden p-3">
        <FilterPanel {...panelProps} />
      </div>

      <div className="px-3 py-2 border-t border-gray-200">
        <button
          type="button"
          onClick={onClear}
          className="w-full px-3 py-1.5 text-xs font-medium border border-gray-300 rounded-md text-gray-700 bg-white hover:bg-gray-50 cursor-pointer"
        >
          Clear Filters
        </button>
      </div>
    </aside>
  );
}
