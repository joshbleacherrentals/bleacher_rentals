import { PROVINCES, STATES } from "@/types/Constants";
import { Bleacher, DashboardEvent } from "../dashboard/types";

type BleacherFilterSortOptions = {
  // allowed row counts
  rows: number[];

  // selected zone ids; empty + showUnassignedZone=false means no zone filter
  zoneUuids: string[];
  showUnassignedZone: boolean;

  // ids to always include when expanded/optimizing
  alwaysIncludeBleacherUuids: string[];
  isFormExpanded: boolean;
  optimizationMode: boolean;
};

export function getRowKey(b: Bleacher): string {
  return b.isSubrentalRow ? `${b.bleacherUuid}:${b.zoneUuid}` : b.bleacherUuid;
}

function passesZoneFilter(
  zoneUuid: string | null,
  zoneUuids: string[],
  showUnassignedZone: boolean,
): boolean {
  if (zoneUuids.length === 0 && !showUnassignedZone) return true;
  if (showUnassignedZone && !zoneUuid) return true;
  if (zoneUuids.length > 0 && zoneUuid && zoneUuids.includes(zoneUuid)) return true;
  return false;
}

export function filterSortPixiBleachers(
  bleachers: Bleacher[],
  opts: BleacherFilterSortOptions,
): Bleacher[] {
  const {
    rows,
    zoneUuids,
    showUnassignedZone,
    alwaysIncludeBleacherUuids,
    isFormExpanded,
    optimizationMode,
  } = opts;

  const rowsSet = rows.length > 0 ? new Set(rows) : null;
  const alwaysSet = new Set(alwaysIncludeBleacherUuids);

  // 1) Filter bleachers by rows and zone
  const included = new Set<string>();
  for (const b of bleachers) {
    if (rowsSet && !rowsSet.has(b.bleacherRows)) continue;
    if (!passesZoneFilter(b.zoneUuid, zoneUuids, showUnassignedZone)) continue;
    included.add(getRowKey(b));
  }

  // 2) Ensure always-include IDs are present when form expanded OR optimization mode is ON.
  //    A bleacher can have several rows — its own, plus a ghost row per zone it is subrented
  //    into. Show the rows from the selected zones' perspective; only when none of its rows is
  //    in a selected zone does it fall back to its own row. Never another zone's ghost row.
  if (isFormExpanded || optimizationMode) {
    const rowsByBleacher = new Map<string, Bleacher[]>();
    for (const b of bleachers) {
      if (!alwaysSet.has(b.bleacherUuid)) continue;
      const list = rowsByBleacher.get(b.bleacherUuid) ?? [];
      list.push(b);
      rowsByBleacher.set(b.bleacherUuid, list);
    }

    for (const rowsOfBleacher of rowsByBleacher.values()) {
      const inSelectedZones = rowsOfBleacher.filter((b) =>
        passesZoneFilter(b.zoneUuid, zoneUuids, showUnassignedZone),
      );
      const shown =
        inSelectedZones.length > 0
          ? inSelectedZones
          : rowsOfBleacher.filter((b) => !b.isSubrentalRow);
      for (const b of shown) included.add(getRowKey(b));
    }
  }

  // 3) Stable ordering + promotion rules
  if (!optimizationMode) {
    const top: Bleacher[] = [];
    const rest: Bleacher[] = [];

    for (const b of bleachers) {
      if (!included.has(getRowKey(b))) continue;
      if (alwaysSet.has(b.bleacherUuid)) top.push(b);
      else rest.push(b);
    }

    return [...top, ...rest];
  }

  const result: Bleacher[] = [];
  for (const b of bleachers) {
    if (included.has(getRowKey(b))) result.push(b);
  }
  return result;
}

export function filterEvents(events: DashboardEvent[], stateProvinces: number[]): DashboardEvent[] {
  const allStatesAndProvinces = [...STATES, ...PROVINCES];

  return events.filter((event) => {
    const state = event.addressData?.state;
    if (!state) return false;

    const index = allStatesAndProvinces.indexOf(state);
    return stateProvinces.includes(index);
  });
}
