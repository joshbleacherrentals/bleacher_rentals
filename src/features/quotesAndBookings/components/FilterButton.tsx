"use client";

import { SlidersHorizontal } from "lucide-react";

type FilterButtonProps = {
  isOpen: boolean;
  onClick: () => void;
  /** Number of active filters, shown as a badge. */
  activeCount?: number;
};

export function FilterButton({ isOpen, onClick, activeCount = 0 }: FilterButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center gap-2 px-4 py-2 border rounded-md text-sm font-medium transition-colors ${
        isOpen
          ? "bg-gray-900 text-white border-gray-900"
          : "bg-white text-gray-700 border-gray-300 hover:bg-gray-50"
      }`}
    >
      <SlidersHorizontal className="h-4 w-4" />
      Filters
      {activeCount > 0 && (
        <span className="min-w-4 h-4 px-1 rounded-full bg-darkBlue text-white text-[10px] leading-4 text-center">
          {activeCount}
        </span>
      )}
    </button>
  );
}
