import { describe, it, expect } from "vitest";
import { Bleacher } from "../dashboard/types";
import { filterSortPixiBleachers, getRowKey } from "./util";

function bleacher(overrides: Partial<Bleacher> = {}): Bleacher {
  return {
    bleacherUuid: "b-1",
    bleacherNumber: 1,
    bleacherRows: 10,
    bleacherSeats: 100,
    summerHomeBase: null,
    winterHomeBase: null,
    bleacherEvents: [],
    blocks: [],
    workTrackers: [],
    maintenanceEvents: [],
    subrentalEvents: [],
    damageReports: [],
    linxupDeviceId: null,
    summerAccountManagerUuid: null,
    winterAccountManagerUuid: null,
    zoneUuid: "zone-1",
    zoneName: "Zone 1",
    storageLocationName: null,
    isAccessible: true,
    ...overrides,
  };
}

/** A bleacher owned by `from`, subrented into `to` — its normal row plus its ghost row. */
function subrented(bleacherUuid: string, bleacherNumber: number, from: string, to: string) {
  return [
    bleacher({ bleacherUuid, bleacherNumber, zoneUuid: from }),
    bleacher({ bleacherUuid, bleacherNumber, zoneUuid: to, isSubrentalRow: true }),
  ];
}

const keys = (rows: Bleacher[]) => rows.map(getRowKey);

const ZONE_2_WITH_EVENT_OPEN = {
  rows: [],
  zoneUuids: ["zone-2"],
  showUnassignedZone: false,
  isFormExpanded: true,
  optimizationMode: false,
};

describe("filterSortPixiBleachers — bleachers selected on an open event", () => {
  it("shows only the zone-2 subrental row, not zone 1's own row of the same bleacher", () => {
    const [ownRow, ghostRow] = subrented("b-sub", 5, "zone-1", "zone-2");

    const result = filterSortPixiBleachers([ownRow, ghostRow], {
      ...ZONE_2_WITH_EVENT_OPEN,
      alwaysIncludeBleacherUuids: ["b-sub"],
    });

    expect(keys(result)).toEqual([getRowKey(ghostRow)]);
  });

  it("still shows a bleacher from another zone with no subrental, on its own row", () => {
    const zone3Bleacher = bleacher({ bleacherUuid: "b-z3", zoneUuid: "zone-3" });

    const result = filterSortPixiBleachers([zone3Bleacher], {
      ...ZONE_2_WITH_EVENT_OPEN,
      alwaysIncludeBleacherUuids: ["b-z3"],
    });

    expect(keys(result)).toEqual(["b-z3"]);
  });

  it("shows only the owner's row when the bleacher is subrented to a zone that is not selected", () => {
    const [ownRow, ghostRow] = subrented("b-z1", 7, "zone-1", "zone-3");

    const result = filterSortPixiBleachers([ownRow, ghostRow], {
      ...ZONE_2_WITH_EVENT_OPEN,
      alwaysIncludeBleacherUuids: ["b-z1"],
    });

    expect(keys(result)).toEqual([getRowKey(ownRow)]);
  });

  it("keeps the selected zone's row even when the rows filter would exclude it", () => {
    const [ownRow, ghostRow] = subrented("b-sub", 5, "zone-1", "zone-2");

    const result = filterSortPixiBleachers([ownRow, ghostRow], {
      ...ZONE_2_WITH_EVENT_OPEN,
      rows: [15],
      alwaysIncludeBleacherUuids: ["b-sub"],
    });

    expect(keys(result)).toEqual([getRowKey(ghostRow)]);
  });

  it("shows every row of the bleacher when no zone filter is set", () => {
    const [ownRow, ghostRow] = subrented("b-sub", 5, "zone-1", "zone-2");

    const result = filterSortPixiBleachers([ownRow, ghostRow], {
      ...ZONE_2_WITH_EVENT_OPEN,
      zoneUuids: [],
      alwaysIncludeBleacherUuids: ["b-sub"],
    });

    expect(keys(result)).toEqual([getRowKey(ownRow), getRowKey(ghostRow)]);
  });

  it("puts the selected bleachers first, ahead of the rest of the zone", () => {
    const zone2Other = bleacher({ bleacherUuid: "b-other", bleacherNumber: 1, zoneUuid: "zone-2" });
    const [ownRow, ghostRow] = subrented("b-sub", 5, "zone-1", "zone-2");

    const result = filterSortPixiBleachers([zone2Other, ownRow, ghostRow], {
      ...ZONE_2_WITH_EVENT_OPEN,
      alwaysIncludeBleacherUuids: ["b-sub"],
    });

    expect(keys(result)).toEqual([getRowKey(ghostRow), "b-other"]);
  });
});
