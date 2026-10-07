"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { X } from "lucide-react";
import { useUserNames } from "../hooks/useUserNames";
import { useSalesOfficeNames } from "../hooks/useSalesOfficeNames";
import {
  describeActiveFilters,
  type ActiveFilter,
  type ActiveFilterKey,
  type ActiveFilterState,
} from "../utils/activeFilters";
import { sidewaysWheelScrollLeft } from "../utils/sidewaysWheel";

type ChipActions = {
  onRemove: (key: ActiveFilterKey) => void;
  onClearAll: () => void;
};

/**
 * The filters narrowing the list right now, as chips beside the tabs: each one
 * removable on its own, plus "Clear all filters" for everything at once.
 * Renders nothing when the list is unfiltered.
 */
export function ActiveFilterChips({
  onRemove,
  onClearAll,
  ...state
}: ActiveFilterState & ChipActions) {
  const userNames = useUserNames();
  const officeNames = useSalesOfficeNames();

  const active = describeActiveFilters(state, {
    userName: (id) => userNames.get(id),
    officeName: (id) => officeNames.get(id),
  });

  return <FilterChipRow filters={active} onRemove={onRemove} onClearAll={onClearAll} />;
}

/**
 * One line, never wrapping: when the chips outgrow the space next to the tabs
 * they scroll sideways, and "Clear all filters" stays pinned outside the
 * scroll so it is always one click away. Chips are the tabs' height (h-9).
 */
export function FilterChipRow({
  filters,
  onRemove,
  onClearAll,
}: ChipActions & { filters: ActiveFilter[] }) {
  if (filters.length === 0) return null;

  return (
    <div
      aria-label="Applied filters"
      className="flex min-w-0 flex-1 basis-[28rem] items-center justify-end gap-2"
    >
      <SidewaysScroller>
        {filters.map((filter) => (
          <span
            key={filter.key}
            className="inline-flex h-9 shrink-0 items-center gap-1 whitespace-nowrap rounded-lg border border-gray-300 bg-white pl-3 pr-1 text-sm font-medium text-gray-700"
          >
            {filter.label}
            <button
              type="button"
              aria-label={`Remove filter: ${filter.label}`}
              onClick={() => onRemove(filter.key)}
              className="inline-flex size-7 cursor-pointer items-center justify-center rounded-md text-gray-400 hover:bg-gray-100 hover:text-gray-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-darkBlue"
            >
              <X className="size-4" aria-hidden />
            </button>
          </span>
        ))}
      </SidewaysScroller>
      <button
        type="button"
        onClick={onClearAll}
        className="h-9 shrink-0 cursor-pointer whitespace-nowrap rounded-lg px-3 text-sm font-medium text-darkBlue hover:bg-gray-100"
      >
        Clear all filters
      </button>
    </div>
  );
}

/**
 * A row that scrolls sideways — also under a plain mouse wheel, which only
 * scrolls vertically: over the chips it moves them instead, and once the row
 * reaches either end the page scrolls as usual. Trackpad swipes are left alone.
 */
function SidewaysScroller({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const onWheel = (event: WheelEvent) => {
      const next = sidewaysWheelScrollLeft(event, el);
      if (next === null) return;
      event.preventDefault();
      el.scrollLeft = next;
    };
    // Not React's onWheel: that listener is passive, so it could not stop the page scrolling.
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  return (
    <div ref={ref} className="flex min-w-0 items-center gap-2 overflow-x-auto">
      {children}
    </div>
  );
}
