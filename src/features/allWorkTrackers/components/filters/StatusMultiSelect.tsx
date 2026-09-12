"use client";

import { MultiSelect } from "@/components/MultiSelect";

const STATUS_OPTIONS = [
  { label: "Draft", value: "draft" },
  { label: "Released", value: "released" },
  { label: "Accepted", value: "accepted" },
  { label: "Dest Pickup", value: "dest_pickup" },
  { label: "Pickup Inspection", value: "pickup_inspection" },
  { label: "Dest Dropoff", value: "dest_dropoff" },
  { label: "Dropoff Inspection", value: "dropoff_inspection" },
  { label: "Completed", value: "completed" },
  { label: "Cancelled", value: "cancelled" },
  { label: "Declined", value: "declined" },
  { label: "Abandoned", value: "abandoned" },
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
      maxCount={3}
    />
  );
}
