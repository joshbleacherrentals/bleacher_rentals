import { describe, it, expect } from "vitest";
import { Bleacher } from "../types";
import {
  SUBRENTAL_ROW_PADDING_DAYS,
  filterSubrentalRowsByDateWindow,
  isSubrentalRowVisible,
  withoutSubrentalRows,
} from "./subrentalRowVisibility";

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
    zoneUuid: "z-1",
    zoneName: "Zone 1",
    storageLocationName: null,
    isAccessible: true,
    ...overrides,
  };
}

function subrentalRow(overrides: Partial<Bleacher> = {}): Bleacher {
  return bleacher({ isSubrentalRow: true, ...overrides });
}

function pending(eventStart: string, eventEnd: string) {
  return {
    subrentalEventUuid: `sr-${eventStart}`,
    eventStart,
    eventEnd,
    status: "pending",
    requestedZoneUuid: null,
    notes: null,
  };
}

describe("isSubrentalRowVisible", () => {
  it("keeps normal rows regardless of the window", () => {
    const row = bleacher();
    expect(isSubrentalRowVisible(row, "2030-01-01", "2030-01-10")).toBe(true);
  });

  it("hides a subrental row with no subrentals at all", () => {
    expect(isSubrentalRowVisible(subrentalRow(), "2025-03-01", "2025-03-10")).toBe(false);
  });

  it("shows the row when the window is inside the subrental", () => {
    const row = subrentalRow({ subrentalEvents: [pending("2025-01-01", "2025-06-30")] });
    expect(isSubrentalRowVisible(row, "2025-03-01", "2025-03-10")).toBe(true);
  });

  it("shows the row exactly 14 days before the start", () => {
    const row = subrentalRow({ subrentalEvents: [pending("2025-03-15", "2025-03-20")] });
    // Window ends on the first padded day.
    expect(isSubrentalRowVisible(row, "2025-02-20", "2025-03-01")).toBe(true);
  });

  it("hides the row 15 days before the start", () => {
    const row = subrentalRow({ subrentalEvents: [pending("2025-03-15", "2025-03-20")] });
    expect(isSubrentalRowVisible(row, "2025-02-20", "2025-02-28")).toBe(false);
  });

  it("shows the row exactly 14 days after the end", () => {
    const row = subrentalRow({ subrentalEvents: [pending("2025-03-15", "2025-03-20")] });
    expect(isSubrentalRowVisible(row, "2025-04-03", "2025-04-10")).toBe(true);
  });

  it("hides the row 15 days after the end", () => {
    const row = subrentalRow({ subrentalEvents: [pending("2025-03-15", "2025-03-20")] });
    expect(isSubrentalRowVisible(row, "2025-04-04", "2025-04-10")).toBe(false);
  });

  it("counts accepted ranges as well as pending ones", () => {
    const row = subrentalRow({
      acceptedSubrentalAccess: [{ eventStart: "2025-03-15", eventEnd: "2025-03-20" }],
    });
    expect(isSubrentalRowVisible(row, "2025-03-16", "2025-03-18")).toBe(true);
    expect(isSubrentalRowVisible(row, "2025-05-01", "2025-05-10")).toBe(false);
  });

  it("shows the row when any one of several subrentals is in range", () => {
    const row = subrentalRow({
      subrentalEvents: [pending("2025-01-01", "2025-01-05"), pending("2025-08-01", "2025-08-05")],
    });
    expect(isSubrentalRowVisible(row, "2025-07-25", "2025-08-02")).toBe(true);
  });

  it("accepts timestamps, not only YYYY-MM-DD", () => {
    const row = subrentalRow({
      subrentalEvents: [pending("2025-03-15T00:00:00Z", "2025-03-20T00:00:00Z")],
    });
    expect(isSubrentalRowVisible(row, "2025-03-16", "2025-03-18")).toBe(true);
  });

  it("ignores ranges with missing dates", () => {
    const row = subrentalRow({ subrentalEvents: [pending("", "")] });
    expect(isSubrentalRowVisible(row, "2025-03-16", "2025-03-18")).toBe(false);
  });

  it("uses a 14 day padding", () => {
    expect(SUBRENTAL_ROW_PADDING_DAYS).toBe(14);
  });
});

describe("filterSubrentalRowsByDateWindow", () => {
  it("drops out-of-range subrental rows and keeps everything else in order", () => {
    const normal = bleacher({ bleacherUuid: "b-1" });
    const inRange = subrentalRow({
      bleacherUuid: "b-2",
      subrentalEvents: [pending("2025-03-15", "2025-03-20")],
    });
    const outOfRange = subrentalRow({
      bleacherUuid: "b-3",
      subrentalEvents: [pending("2025-09-15", "2025-09-20")],
    });

    expect(
      filterSubrentalRowsByDateWindow([normal, inRange, outOfRange], "2025-03-16", "2025-03-18"),
    ).toEqual([normal, inRange]);
  });

  it("keeps a pinned subrental row even when it is out of range", () => {
    const outOfRange = subrentalRow({
      bleacherUuid: "b-3",
      subrentalEvents: [pending("2025-09-15", "2025-09-20")],
    });

    expect(
      filterSubrentalRowsByDateWindow([outOfRange], "2025-03-16", "2025-03-18", new Set(["b-3"])),
    ).toEqual([outOfRange]);
  });

  it("returns the list untouched when the window is unknown", () => {
    const rows = [bleacher(), subrentalRow()];
    expect(filterSubrentalRowsByDateWindow(rows, undefined, undefined)).toEqual(rows);
  });
});

describe("withoutSubrentalRows", () => {
  it("drops every subrental row, even one inside its own dates, and keeps normal rows in order", () => {
    const first = bleacher({ bleacherUuid: "b-1" });
    const inRange = subrentalRow({
      bleacherUuid: "b-2",
      subrentalEvents: [pending("2025-03-15", "2025-03-20")],
    });
    const second = bleacher({ bleacherUuid: "b-3" });

    expect(withoutSubrentalRows([first, inRange, second])).toEqual([first, second]);
  });
});
