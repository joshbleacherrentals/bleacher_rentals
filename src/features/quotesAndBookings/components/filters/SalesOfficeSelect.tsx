"use client";

import { useMemo } from "react";
import { Dropdown } from "@/components/DropDown";
import { useSalesOffices } from "../../hooks/useSalesOffices";

const ALL = "all";

/**
 * One office at a time — the list is short and picking two at once answers no
 * question the user actually asks. "All Sales Offices" is the off position, so
 * clearing the filter stays one click rather than a deselect.
 */
export function SalesOfficeSelect({
  value,
  onChange,
}: {
  value: string | null;
  onChange: (value: string | null) => void;
}) {
  const { salesOffices, isLoading } = useSalesOffices();

  const options = useMemo(
    () => [
      { label: "All Sales Offices", value: ALL },
      ...salesOffices.map((office) => ({ label: office.name, value: office.id })),
    ],
    [salesOffices],
  );

  return (
    <Dropdown
      compact
      options={options}
      selected={value ?? ALL}
      onSelect={(next) => onChange(next === ALL ? null : next)}
      placeholder={isLoading ? "Loading..." : "All Sales Offices"}
      disabled={isLoading}
    />
  );
}
