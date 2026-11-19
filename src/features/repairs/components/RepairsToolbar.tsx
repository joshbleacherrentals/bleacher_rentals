"use client";

import { useEffect, useRef, useState } from "react";
import { Search, Trash2, X } from "lucide-react";
import {
  SEARCH_HINT,
  SEARCH_PAUSE_MS,
  withUnknownSelected,
  type FilterKey,
  type RepairFilterOptions,
} from "../utils/repairFilters";
import type { RepairsUrlPatch } from "../utils/repairPageState";
import { RepairFilterMenu } from "./RepairFilterMenu";

export type RepairsToolbarProps = {
  search: string;
  bleacherUuids: readonly string[];
  zoneUuids: readonly string[];
  vendorUuids: readonly string[];
  categoryUuids: readonly string[];
  options: RepairFilterOptions;
  optionsLoading: boolean;
  /** The role may use Show Deleted. */
  canShowDeleted: boolean;
  /** And it is on. */
  showDeleted: boolean;
  onChange: (patch: RepairsUrlPatch) => void;
};

/** A text of only spaces is the same as no text: the address does not carry it (D58). */
const normalized = (text: string) => (text.trim() === "" ? "" : text);

/**
 * The toolbar of the Repairs page: the search box, the filters Bleacher, Zone, Vendor and
 * Category, and Show Deleted at the right end. docs/specs/repairs-05-toolbar.md §2.1 to §2.3, §2.6.
 */
export function RepairsToolbar({
  search,
  bleacherUuids,
  zoneUuids,
  vendorUuids,
  categoryUuids,
  options,
  optionsLoading,
  canShowDeleted,
  showDeleted,
  onChange,
}: RepairsToolbarProps) {
  // The box keeps its own text while the person types. 300 ms after the last change the page is
  // told, and the list and the address change together (D59). `lastSent` is the text this box last
  // handed to the page, so the box takes the address's text only when something else changed it
  // (the back button, a link), and not on its own write.
  const [text, setText] = useState(search);
  const lastSent = useRef(search);
  const inputRef = useRef<HTMLInputElement>(null);

  // The timer calls the latest `onChange`, so a tab or a filter changed during the pause is not
  // undone by a stale copy of the page's state.
  const onChangeRef = useRef(onChange);
  useEffect(() => {
    onChangeRef.current = onChange;
  });

  useEffect(() => {
    if (normalized(search) !== normalized(lastSent.current)) {
      lastSent.current = search;
      setText(search);
    }
  }, [search]);

  useEffect(() => {
    if (text === lastSent.current) return;
    const timer = setTimeout(() => {
      lastSent.current = text;
      onChangeRef.current({ search: text });
    }, SEARCH_PAUSE_MS);
    return () => clearTimeout(timer);
  }, [text]);

  const filters: {
    key: FilterKey;
    label: string;
    selected: readonly string[];
    patch: (values: string[]) => RepairsUrlPatch;
  }[] = [
    {
      key: "bleacher",
      label: "Bleacher",
      selected: bleacherUuids,
      patch: (v) => ({ bleacherUuids: v }),
    },
    { key: "zone", label: "Zone", selected: zoneUuids, patch: (v) => ({ zoneUuids: v }) },
    { key: "vendor", label: "Vendor", selected: vendorUuids, patch: (v) => ({ vendorUuids: v }) },
    {
      key: "category",
      label: "Category",
      selected: categoryUuids,
      patch: (v) => ({ categoryUuids: v }),
    },
  ];

  return (
    <div className="mt-4 flex flex-wrap items-center gap-2">
      <div className="relative w-[400px] max-w-full">
        <Search
          className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-[#6b7280]"
          aria-hidden="true"
        />
        <input
          ref={inputRef}
          type="search"
          data-testid="repairs-search"
          aria-label="Search repairs"
          placeholder={SEARCH_HINT}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Escape" && text !== "") {
              e.preventDefault();
              setText("");
            }
          }}
          className="block h-9 w-full appearance-none rounded-md border border-[#d1d5db] bg-white pr-9 pl-9 text-sm text-gray-900 [&::-webkit-search-cancel-button]:hidden [&::-webkit-search-cancel-button]:appearance-none"
        />
        {text !== "" && (
          <button
            type="button"
            data-testid="repairs-search-clear"
            aria-label="Clear search"
            onClick={() => {
              setText("");
              inputRef.current?.focus();
            }}
            className="absolute top-1/2 right-2 inline-flex size-6 -translate-y-1/2 cursor-pointer items-center justify-center rounded text-[#6b7280] hover:bg-gray-100 hover:text-gray-800"
          >
            <X className="size-4" aria-hidden="true" />
          </button>
        )}
      </div>

      {filters.map(({ key, label, selected, patch }) => (
        <RepairFilterMenu
          key={key}
          label={label}
          filterKey={key}
          options={optionsLoading ? options[key] : withUnknownSelected(options[key], selected)}
          selected={selected}
          isLoading={optionsLoading}
          onChange={(values) => onChange(patch(values))}
        />
      ))}

      {canShowDeleted && (
        <button
          type="button"
          onClick={() => onChange({ showDeleted: !showDeleted })}
          className={`ml-auto flex h-9 cursor-pointer items-center gap-1.5 rounded-md border px-3 text-sm font-medium transition ${
            showDeleted
              ? "border-gray-400 bg-gray-100 text-gray-800 hover:bg-gray-200"
              : "border-gray-200 bg-white text-gray-500 hover:bg-gray-50"
          }`}
        >
          <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
          {showDeleted ? "Showing Deleted" : "Show Deleted"}
        </button>
      )}
    </div>
  );
}
