"use client";

import { Dropdown } from "@/components/DropDown";

/**
 * Three states, so "no filter" is a deliberate choice: Any shows everything, Yes only quotes made
 * from the website form, No only the quotes made in the app.
 */
const OPTIONS: { label: string; value: "any" | "yes" | "no" }[] = [
  { label: "Any", value: "any" },
  { label: "Yes", value: "yes" },
  { label: "No", value: "no" },
];

export function InboundSelect({
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
