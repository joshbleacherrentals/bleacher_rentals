"use client";

import { useMemo } from "react";
import { MultiSelect } from "@/components/MultiSelect";
import { useZones } from "../../hooks/useZoneLookup";
import { UNKNOWN_ZONE } from "../../utils/zoneOfEvent";

type ZoneMultiSelectProps = {
  values: string[];
  onChange: (values: string[]) => void;
};

/** Any number of zones, plus "Zone Unknown" for events whose state is missing or in no zone. */
export function ZoneMultiSelect({ values, onChange }: ZoneMultiSelectProps) {
  const zones = useZones();
  const options = useMemo(
    () => [
      ...zones.map((zone) => ({ label: zone.name, value: zone.id })),
      { label: "Zone Unknown", value: UNKNOWN_ZONE },
    ],
    [zones],
  );

  return (
    <MultiSelect
      options={options}
      onValueChange={onChange}
      forceSelectedValues={values}
      placeholder="Select zones"
      maxCount={3}
    />
  );
}
