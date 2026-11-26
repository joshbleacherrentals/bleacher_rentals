"use client";

import { useState } from "react";
import { Check, ChevronDown, Search } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  VENDOR_STATUSES,
  VENDOR_TYPES,
  type VendorType,
} from "@/features/manageTeam/utils/vendorForm";
import type { StatusFilterValue } from "../utils/vendorListRows";
import { NO_STATUS_LABEL, VENDOR_STATUS_LABELS, VENDOR_TYPE_LABELS } from "../utils/vendorLabels";

/** The Status filter's choices: the five statuses and "No status" (D21). */
export const STATUS_FILTER_OPTIONS: { value: StatusFilterValue; label: string }[] = [
  ...VENDOR_STATUSES.map((s) => ({
    value: s as StatusFilterValue,
    label: VENDOR_STATUS_LABELS[s],
  })),
  { value: "none", label: NO_STATUS_LABEL },
];

export type VendorStatusFilterListProps = {
  selected: readonly StatusFilterValue[];
  onToggle: (value: StatusFilterValue) => void;
  onClear: () => void;
};

/**
 * The inside of the Status dropdown: a check mark per status, several at once, and Clear. Exported
 * apart from the popover so a test can render it open.
 */
export function VendorStatusFilterList({
  selected,
  onToggle,
  onClear,
}: VendorStatusFilterListProps) {
  return (
    <div role="group" aria-label="Status filter">
      <div className="p-1">
        {STATUS_FILTER_OPTIONS.map((option) => {
          const checked = selected.includes(option.value);
          return (
            <button
              key={option.value}
              type="button"
              role="menuitemcheckbox"
              aria-checked={checked}
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
            </button>
          );
        })}
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

export type VendorsToolbarProps = {
  search: string;
  type: VendorType | "all";
  statuses: readonly StatusFilterValue[];
  showDeleted: boolean;
  onSearchChange: (text: string) => void;
  onTypeChange: (type: VendorType | "all") => void;
  onStatusesChange: (statuses: StatusFilterValue[]) => void;
  onShowDeletedChange: (showDeleted: boolean) => void;
};

/**
 * Above the list: the search, the Type filter (one choice), the Status filter (several at once)
 * and the Show Deleted switch (docs/specs/vendors-page.md D20, D21, D24). Every role sees all four.
 */
export function VendorsToolbar({
  search,
  type,
  statuses,
  showDeleted,
  onSearchChange,
  onTypeChange,
  onStatusesChange,
  onShowDeletedChange,
}: VendorsToolbarProps) {
  const [statusOpen, setStatusOpen] = useState(false);

  const toggleStatus = (value: StatusFilterValue) =>
    onStatusesChange(
      statuses.includes(value) ? statuses.filter((s) => s !== value) : [...statuses, value],
    );

  return (
    <div className="mb-3 flex flex-wrap items-center gap-2">
      <div className="relative min-w-[220px] flex-1 sm:max-w-sm">
        <Search
          className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-gray-400"
          aria-hidden="true"
        />
        <input
          type="search"
          aria-label="Search vendors"
          placeholder="Search vendors..."
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          className="block h-9 w-full rounded-md border border-gray-300 bg-white pr-3 pl-8 text-sm text-gray-900 focus:ring-2 focus:ring-greenAccent focus:outline-none [&::-webkit-search-cancel-button]:appearance-none"
        />
      </div>

      <select
        aria-label="Type"
        value={type}
        onChange={(e) => onTypeChange(e.target.value as VendorType | "all")}
        className="h-9 rounded-md border border-gray-300 bg-white px-2.5 text-sm text-gray-900 focus:ring-2 focus:ring-greenAccent focus:outline-none"
      >
        <option value="all">Type: All</option>
        {VENDOR_TYPES.map((t) => (
          <option key={t} value={t}>
            {`Type: ${VENDOR_TYPE_LABELS[t]}`}
          </option>
        ))}
      </select>

      <Popover open={statusOpen} onOpenChange={setStatusOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            aria-haspopup="menu"
            aria-expanded={statusOpen}
            className="inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-md border border-gray-300 bg-white px-3 text-sm text-gray-900 hover:bg-gray-50"
          >
            Status
            {statuses.length > 0 && (
              <span className="rounded-full bg-[#1d62a3] px-1.5 text-xs leading-5 font-semibold text-white">
                {statuses.length}
              </span>
            )}
            <ChevronDown className="size-4 text-gray-500" aria-hidden="true" />
          </button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-56 p-0">
          <VendorStatusFilterList
            selected={statuses}
            onToggle={toggleStatus}
            onClear={() => onStatusesChange([])}
          />
        </PopoverContent>
      </Popover>

      <label className="ml-auto inline-flex cursor-pointer items-center gap-2 text-sm text-gray-700">
        <input
          type="checkbox"
          checked={showDeleted}
          onChange={(e) => onShowDeletedChange(e.target.checked)}
          className="size-4"
        />
        Show Deleted
      </label>
    </div>
  );
}
