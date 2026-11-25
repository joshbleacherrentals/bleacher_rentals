import { describe, it, expect } from "vitest";
import type { Bleacher } from "@/features/dashboard/types";
import type {
  BleacherCheck,
  EventLogisticsCheck,
} from "@/features/scheduleValidator/utils/logisticsPlan";
import { buildGridRows, isHeaderBleacher, toDashboardRows } from "./rows";

const dashBleacher = (uuid: string, number: number, overrides: Partial<Bleacher> = {}): Bleacher =>
  ({
    bleacherUuid: uuid,
    bleacherNumber: number,
    bleacherEvents: [],
    blocks: [],
    workTrackers: [],
    maintenanceEvents: [],
    subrentalEvents: [],
    damageReports: [],
    isAccessible: true,
    ...overrides,
  }) as unknown as Bleacher;

const check = (uuid: string, number: number, matches: boolean): BleacherCheck => ({
  bleacherUuid: uuid,
  bleacherNumber: number,
  bleacherTypeName: "7 Row",
  last: matches
    ? null
    : { kind: "event", id: "p", date: "2026-11-07", street: "2 Oak", label: "Earlier" },
  matches,
});

const event = (
  id: string,
  bleachers: BleacherCheck[],
  overrides: Partial<EventLogisticsCheck> = {},
): EventLogisticsCheck => ({
  eventId: id,
  eventName: `Event ${id}`,
  startDate: "2026-11-13",
  street: "9 Here St",
  bleachers,
  ...overrides,
});

describe("buildGridRows", () => {
  const bleachers = [dashBleacher("b1", 1), dashBleacher("b2", 2), dashBleacher("b3", 3)];

  it("puts a header row before each event's bleachers", () => {
    const rows = buildGridRows(
      [event("e1", [check("b1", 1, false), check("b2", 2, false)])],
      bleachers,
    );
    expect(rows.map((r) => r.kind)).toEqual(["header", "bleacher", "bleacher"]);
    expect(rows[0]).toMatchObject({
      title: "Event e1",
      detail: expect.stringContaining("9 Here St"),
      status: "2 of 2 to deliver",
      ready: false,
    });
  });

  it("repeats a bleacher under each event it is on, with a row key per event", () => {
    const rows = buildGridRows(
      [event("e1", [check("b1", 1, false)]), event("e2", [check("b1", 1, false)])],
      bleachers,
    );
    const keys = rows.filter((r) => r.kind === "bleacher").map((r) => r.key);
    expect(keys).toEqual(["e1:b1", "e2:b1"]);
  });

  it("lists bleachers to deliver before ready ones and events needing work before ready events", () => {
    const rows = buildGridRows(
      [
        event("done", [check("b1", 1, true)]),
        event("todo", [check("b2", 2, true), check("b3", 3, false)]),
      ],
      bleachers,
    );
    expect(rows.map((r) => r.key)).toEqual([
      "header:todo",
      "todo:b3",
      "todo:b2",
      "header:done",
      "done:b1",
    ]);
    expect(rows.find((r) => r.key === "todo:b2")).toMatchObject({ ready: true });
  });

  it("marks an event whose bleachers are all in place Ready", () => {
    const [header] = buildGridRows([event("e1", [check("b1", 1, true)])], bleachers);
    expect(header).toMatchObject({ status: "Ready", ready: true });
  });

  it("gives an event with no bleachers a header only", () => {
    const rows = buildGridRows([event("e1", [])], bleachers);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ status: "No bleachers assigned", ready: false });
  });

  it("leaves out a bleacher the dashboard does not know", () => {
    const rows = buildGridRows([event("e1", [check("ghost", 9, false)])], bleachers);
    expect(rows.map((r) => r.kind)).toEqual(["header"]);
  });

  it("uses a bleacher's home row, not a subrental ghost row", () => {
    const ghost = dashBleacher("b1", 1, { isSubrentalRow: true, zoneName: "Ghost" });
    const home = dashBleacher("b1", 1, { zoneName: "Home" });
    const rows = buildGridRows([event("e1", [check("b1", 1, false)])], [ghost, home]);
    expect(rows[1]).toMatchObject({ bleacher: { zoneName: "Home" } });
  });

  it("says 'No address' for an event without a street", () => {
    const [header] = buildGridRows([event("e1", [], { street: null })], bleachers);
    expect(header).toMatchObject({ detail: expect.stringContaining("No address") });
  });
});

describe("toDashboardRows", () => {
  it("turns a header row into an empty bleacher and keeps real bleachers as they are", () => {
    const b1 = dashBleacher("b1", 1);
    const rows = buildGridRows([event("e1", [check("b1", 1, false)])], [b1]);
    const [header, bleacher] = toDashboardRows(rows);
    expect(isHeaderBleacher(header)).toBe(true);
    expect(header.workTrackers).toEqual([]);
    expect(header.bleacherEvents).toEqual([]);
    expect(bleacher).toBe(b1);
    expect(isHeaderBleacher(bleacher)).toBe(false);
  });
});
