"use client";

import { Dropdown } from "@/components/DropDown";

/**
 * Three states, so "no filter" is a deliberate choice rather than the absence of
 * one: Any shows everything, Yes only events carrying a GoodShuffle URL, No only
 * those without.
 */
const OPTIONS: { label: string; value: "any" | "yes" | "no" }[] = [
  { label: "Any", value: "any" },
  { label: "Yes", value: "yes" },
  { label: "No", value: "no" },
];

export function InGoodShuffleSelect({
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
