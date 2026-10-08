"use client";

import { MultiSelect } from "@/components/MultiSelect";

const STATUS_OPTIONS = [
  { label: "Quoted", value: "quoted" },
  { label: "Booked", value: "booked" },
  { label: "Lost", value: "lost" },
  { label: "Draft", value: "draft" },
];

type StatusMultiSelectProps = {
  values: string[];
  onChange: (values: string[]) => void;
};

export function StatusMultiSelect({ values, onChange }: StatusMultiSelectProps) {
  return (
    <MultiSelect
      options={STATUS_OPTIONS}
      onValueChange={onChange}
      forceSelectedValues={values}
      placeholder="Select status"
      maxCount={4}
    />
  );
}
