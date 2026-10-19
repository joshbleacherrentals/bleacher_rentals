"use client";

import type { ReactNode } from "react";

/**
 * One saved view of the quotes list, as a small grey pill: a click applies its filters. Meant to sit
 * in a row of templates beside the search box. Darker while the list is showing exactly that view.
 */
export function TemplatePill({
  label,
  icon,
  active,
  onClick,
}: {
  label: string;
  icon?: ReactNode;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium whitespace-nowrap transition-colors cursor-pointer ${
        active
          ? "bg-gray-400 text-gray-900"
          : "bg-gray-100 text-gray-700 hover:bg-gray-200 active:bg-gray-300"
      }`}
    >
      {icon}
      {label}
    </button>
  );
}
