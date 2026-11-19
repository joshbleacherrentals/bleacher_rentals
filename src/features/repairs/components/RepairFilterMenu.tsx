"use client";

import { useState } from "react";
import { Check, ChevronDown } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  UNKNOWN_LABEL,
  searchOptions,
  type FilterKey,
  type FilterOption,
} from "../utils/repairFilters";

export type RepairFilterListProps = {
  label: string;
  options: FilterOption[];
  selected: readonly string[];
  isLoading: boolean;
  /** The text of the search box inside the dropdown. */
  query: string;
  onQueryChange: (text: string) => void;
  onToggle: (value: string) => void;
  onClear: () => void;
};

/**
 * The content of a filter's dropdown: its own search box, a checkbox per option, and Clear for this
 * filter only. Exported apart from the popover so a test can render it open.
 * docs/specs/repairs-05-toolbar.md §2.3 (D61, D68).
 */
export function RepairFilterList({
  label,
  options,
  selected,
  isLoading,
  query,
  onQueryChange,
  onToggle,
  onClear,
}: RepairFilterListProps) {
  const shown = searchOptions(options, query);
  return (
    <div role="group" aria-label={`${label} filter`}>
      <div className="border-b border-[#e5e7eb] p-2">
        <input
          type="search"
          aria-label={`Search in ${label}`}
          placeholder="Search"
          value={query}
          onChange={(e) => onQueryChange(e.target.value)}
          className="block h-8 w-full rounded-md border border-[#d1d5db] bg-white px-2.5 text-sm text-gray-900 [&::-webkit-search-cancel-button]:appearance-none"
        />
      </div>
      <div className="max-h-[264px] overflow-y-auto p-1">
        {isLoading ? (
          <div className="px-2 py-3 text-sm text-gray-500">Loading...</div>
        ) : shown.length === 0 ? (
          <div className="px-2 py-3 text-sm text-gray-500">No matches</div>
        ) : (
          shown.map((option) => {
            const checked = selected.includes(option.value);
            return (
              <button
                key={option.value}
                type="button"
                role="menuitemcheckbox"
                aria-checked={checked}
                title={option.label === UNKNOWN_LABEL ? option.value : undefined}
                onClick={() => onToggle(option.value)}
                className="flex min-h-[34px] w-full cursor-pointer items-center gap-2.5 rounded-md px-2 text-left text-sm leading-5 text-gray-900 hover:bg-[#f3f4f6] focus-visible:bg-[#f3f4f6] focus-visible:outline-none"
              >
                <span
                  aria-hidden="true"
                  className={`inline-flex size-4 shrink-0 items-center justify-center rounded-[4px] border ${
                    checked ? "border-[#1d62a3] bg-[#1d62a3]" : "border-[#9ca3af] bg-white"
                  }`}
                >
                  {checked && <Check className="size-3 text-white" strokeWidth={3} />}
                </span>
                <span className="min-w-0 truncate">{option.label}</span>
                {option.inactive && (
                  <span className="ml-auto pl-2 text-xs text-gray-400">inactive</span>
                )}
              </button>
            );
          })
        )}
      </div>
      <div className="flex items-center justify-between border-t border-[#e5e7eb] px-3 py-1.5">
        <button
          type="button"
          onClick={onClear}
          className="cursor-pointer py-1 text-[13px] font-medium text-[#1d62a3] hover:underline"
        >
          Clear
        </button>
      </div>
    </div>
  );
}

export type RepairFilterMenuProps = {
  label: string; // "Bleacher", "Zone", "Vendor" or "Category"
  filterKey: FilterKey;
  options: FilterOption[]; // with the Unknown ones already added
  selected: readonly string[];
  isLoading: boolean;
  onChange: (values: string[]) => void;
};

/**
 * One filter of the toolbar: a button with the label, a count badge while something is ticked and
 * a chevron, which opens the dropdown. The dropdown stays open while values are ticked.
 * docs/specs/repairs-05-toolbar.md §2.3.
 */
export function RepairFilterMenu({
  label,
  filterKey,
  options,
  selected,
  isLoading,
  onChange,
}: RepairFilterMenuProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const count = selected.length;

  const toggle = (value: string) =>
    onChange(selected.includes(value) ? selected.filter((v) => v !== value) : [...selected, value]);

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setQuery("");
      }}
    >
      <PopoverTrigger asChild>
        <button
          type="button"
          data-testid={`repairs-filter-${filterKey}`}
          className={`inline-flex h-9 cursor-pointer items-center gap-2 rounded-md border pr-2.5 pl-3 text-sm leading-5 font-medium ${
            count > 0
              ? "border-[#1d62a3] bg-[#eef4fb] text-[#10365a]"
              : "border-[#d1d5db] bg-white text-gray-700 hover:bg-gray-50"
          }`}
        >
          {label}
          {count > 0 && (
            <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-[#1d62a3] px-1.5 text-xs font-semibold text-white">
              {count}
            </span>
          )}
          <ChevronDown className="size-4 opacity-60" aria-hidden="true" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        data-testid={`repairs-filter-list-${filterKey}`}
        className="w-[272px] overflow-hidden p-0"
      >
        <RepairFilterList
          label={label}
          options={options}
          selected={selected}
          isLoading={isLoading}
          query={query}
          onQueryChange={setQuery}
          onToggle={toggle}
          onClear={() => onChange([])}
        />
      </PopoverContent>
    </Popover>
  );
}
