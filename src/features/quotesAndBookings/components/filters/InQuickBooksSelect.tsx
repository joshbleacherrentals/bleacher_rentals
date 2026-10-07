"use client";

import { Dropdown } from "@/components/DropDown";

/**
 * Same three states as the GoodShuffle filter: Any shows everything, Yes only
 * events flagged as entered in QuickBooks, No only those not flagged.
 */
const OPTIONS: { label: string; value: "any" | "yes" | "no" }[] = [
  { label: "Any", value: "any" },
  { label: "Yes", value: "yes" },
  { label: "No", value: "no" },
];

export function InQuickBooksSelect({
  value,
  onChange,
}: {
  value: boolean | null;
  onChange: (value: boolean | null) => void;
}) {
  const selected = value === null ? "any" : value ? "yes" : "no";

  return (
    <Dropdown
      compact
      options={OPTIONS}
      selected={selected}
      onSelect={(next) => onChange(next === "any" ? null : next === "yes")}
      placeholder="Any"
    />
  );
}
