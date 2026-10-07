"use client";

import { MultiSelect } from "@/components/MultiSelect";
import { db } from "@/components/providers/SystemProvider";
import { expect, useTypedQuery } from "@/lib/powersync/typedQuery";
import { useMemo } from "react";
import { usePermissionsStore } from "@/features/userAccess/state/usePermissionsStore";
import { mergeDriverZoneSelection } from "@/features/manageTeam/logic/driverZoneAssignments";

type ZoneRow = { id: string; displayName: string | null };

const compiledZones = db
  .selectFrom("Zones as z")
  .select(["z.id as id", "z.display_name as displayName"])
  .orderBy("z.display_name", "asc")
  .compile();

type SelectDriverZonesProps = {
  value: string[];
  onChange: (zoneUuids: string[]) => void;
  disabled?: boolean;
  /**
   * Shows every zone and every zone the driver is in, and cannot be changed. For someone who sees
   * the zones without managing any of them — an accountant (docs/specs/accountant-team.md). Without
   * it the selector shows only the zones the signed-in account manager manages.
   */
  readOnly?: boolean;
};

export function SelectDriverZones({ value, onChange, disabled, readOnly }: SelectDriverZonesProps) {
  const isAdmin = usePermissionsStore((s) => s.isAdmin);
  const accountManagerZoneIds = usePermissionsStore((s) => s.accountManagerZoneIds);
  const { data: zoneRows } = useTypedQuery(compiledZones, expect<ZoneRow>());

  const zones = zoneRows ?? [];

  const visibleZones = useMemo(() => {
    if (isAdmin || readOnly) return zones;
    const allowed = new Set(accountManagerZoneIds);
    return zones.filter((z) => allowed.has(z.id));
  }, [zones, isAdmin, readOnly, accountManagerZoneIds]);

  const options = useMemo(
    () =>
      visibleZones.map((z) => ({
        value: z.id,
        label: z.displayName?.trim() || "Unnamed zone",
      })),
    [visibleZones],
  );

  const manageableSet = useMemo(
    () => new Set(isAdmin || readOnly ? zones.map((z) => z.id) : accountManagerZoneIds),
    [isAdmin, readOnly, zones, accountManagerZoneIds],
  );

  const displayedSelection = useMemo(
    () => value.filter((id) => manageableSet.has(id)),
    [value, manageableSet],
  );

  const handleChange = (selectedManageable: string[]) => {
    if (isAdmin) {
      onChange(selectedManageable);
      return;
    }
    onChange(
      mergeDriverZoneSelection({
        currentAssignedZoneUuids: value,
        manageableZoneUuids: accountManagerZoneIds,
        selectedManageableZoneUuids: selectedManageable,
      }),
    );
  };

  return (
    <MultiSelect
      options={options}
      onValueChange={handleChange}
      forceSelectedValues={displayedSelection}
      placeholder="Select zones..."
      variant="inverted"
      disabled={disabled || readOnly}
      className="w-full"
    />
  );
}
