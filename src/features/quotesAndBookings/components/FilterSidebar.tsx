"use client";

import { ChevronsLeft, SlidersHorizontal } from "lucide-react";
import type { ComponentProps } from "react";
import { QuotesBookingsFilters } from "../types";
import { FilterPanel } from "./FilterPanel";

const SIDEBAR_WIDTH = 288; // px — Tailwind's w-72

type FilterSidebarProps = ComponentProps<typeof FilterPanel> & {
  isOpen: boolean;
  onToggle: () => void;
  onClear: () => void;
  /** Pixel height of the visible area, so the sidebar fills it and its contents scroll. */
  height?: number;
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
 * Pinned left-hand filter bar, styled like the app's side nav (flush to the edges, no card). Fixed width when open and gone when
 * collapsed; the controls scroll inside it when the window is short.
 */
export function FilterSidebar({
  isOpen,
  onToggle,
  onClear,
  height,
  ...panelProps
}: FilterSidebarProps) {
  const activeCount = countActiveFilters(panelProps.filters);
  const style = height ? { height } : undefined;

  // Stays mounted so the width can animate: the outer aside grows and shrinks, while the inner
  // panel keeps its full width and is simply clipped, so nothing reflows mid-animation. Collapsed
  // takes no room at all; the page header's Filters button brings it back.
  return (
    <aside
      aria-label="Filters"
      aria-hidden={!isOpen}
      inert={!isOpen}
      style={{ ...style, width: isOpen ? SIDEBAR_WIDTH : 0 }}
      className="sticky top-0 self-start shrink-0 overflow-hidden transition-[width] duration-300 ease-in-out motion-reduce:transition-none"
    >
      <div
        style={{ width: SIDEBAR_WIDTH }}
        className="h-full bg-gray-100 border-r border-gray-200 flex flex-col"
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
      </div>
    </aside>
  );
}
