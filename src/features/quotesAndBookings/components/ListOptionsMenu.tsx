"use client";

import { MoreVertical, SlidersHorizontal } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

/**
 * The three-dot options menu on the quotes lists. It holds what is rarely needed, so it takes no
 * room on the page: the Filters sidebar toggle and Show Deleted. A dot on the button says something
 * is narrowing the list that may be out of sight (Show Deleted, or filters applied while the sidebar
 * is closed).
 */
export function ListOptionsMenu({
  showDeleted,
  onShowDeletedChange,
  filtersOpen,
  activeFilterCount,
  onToggleFilters,
}: {
  showDeleted: boolean;
  onShowDeletedChange: (value: boolean) => void;
  filtersOpen: boolean;
  /** How many filters are narrowing the list, shown next to Filters. */
  activeFilterCount: number;
  onToggleFilters: () => void;
}) {
  const hidden = showDeleted || (!filtersOpen && activeFilterCount > 0);
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="relative flex h-10 w-10 items-center justify-center rounded bg-darkBlue text-white hover:bg-lightBlue transition-colors cursor-pointer flex-shrink-0"
          title="Options"
          aria-label="Options"
        >
          <MoreVertical className="size-4" />
          {hidden && (
            <span
              aria-hidden
              className="absolute -top-1 -right-1 size-2.5 rounded-full bg-white ring-2 ring-darkBlue"
            />
          )}
        </button>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" className="w-52">
        <DropdownMenuItem onSelect={onToggleFilters} className="cursor-pointer">
          <SlidersHorizontal />
          {filtersOpen ? "Hide Filters" : "Show Filters"}
          {activeFilterCount > 0 && (
            <span className="ml-auto min-w-4 h-4 px-1 rounded-full bg-darkBlue text-white text-[10px] leading-4 text-center">
              {activeFilterCount}
            </span>
          )}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuCheckboxItem
          checked={showDeleted}
          onCheckedChange={onShowDeletedChange}
          className="cursor-pointer"
        >
          Show Deleted
        </DropdownMenuCheckboxItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
