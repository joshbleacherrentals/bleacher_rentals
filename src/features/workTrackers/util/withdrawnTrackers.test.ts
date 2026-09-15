import { describe, it, expect } from "vitest";
import {
  WITHDRAWN_STATUSES,
  isWithdrawnStatus,
  weekStartOf,
  countWithdrawn,
  countWithdrawnByWeek,
  countWithdrawnByDriver,
  type WithdrawnTrackerRow,
} from "./withdrawnTrackers";

const row = (over: Partial<WithdrawnTrackerRow> = {}): WithdrawnTrackerRow => ({
  driver_uuid: "driver-1",
  date: "2026-09-09",
  status: "abandoned",
  ...over,
});

describe("isWithdrawnStatus", () => {
  it("accepts the two statuses a driver can walk away with", () => {
    expect(WITHDRAWN_STATUSES).toEqual(["declined", "abandoned"]);
    expect(isWithdrawnStatus("declined")).toBe(true);
    expect(isWithdrawnStatus("abandoned")).toBe(true);
  });

  it("rejects every other status, including the office's own cancellation", () => {
    expect(isWithdrawnStatus("cancelled")).toBe(false);
    expect(isWithdrawnStatus("completed")).toBe(false);
    expect(isWithdrawnStatus("draft")).toBe(false);
    expect(isWithdrawnStatus(null)).toBe(false);
  });
});

describe("weekStartOf", () => {
  it("buckets a date onto the Monday of its week", () => {
    // 2026-09-09 is a Wednesday; its week starts Monday the 7th.
    expect(weekStartOf("2026-09-09")).toBe("2026-09-07");
    expect(weekStartOf("2026-09-07")).toBe("2026-09-07");
  });

  it("keeps Sunday in the week that began the Monday before it", () => {
    // 2026-09-13 is a Sunday — the last day of the week starting the 7th,
    // not the first day of the next one.
    expect(weekStartOf("2026-09-13")).toBe("2026-09-07");
    expect(weekStartOf("2026-09-14")).toBe("2026-09-14");
  });

  it("answers null for a tracker with no date", () => {
    expect(weekStartOf(null)).toBeNull();
    expect(weekStartOf("not-a-date")).toBeNull();
  });
});

describe("countWithdrawn", () => {
  it("is zero when nothing was declined or abandoned", () => {
    expect(countWithdrawn([])).toBe(0);
  });

  it("counts declined and abandoned together", () => {
    expect(
      countWithdrawn([
        row({ status: "declined" }),
        row({ status: "abandoned" }),
        row({ driver_uuid: "driver-2", status: "declined" }),
      ]),
    ).toBe(3);
  });

  it("ignores any other status that reaches it", () => {
    expect(countWithdrawn([row({ status: "cancelled" }), row({ status: "abandoned" })])).toBe(1);
  });

  it("counts a tracker with no date — the total is for all time", () => {
    expect(countWithdrawn([row({ date: null })])).toBe(1);
  });

  it("drops back as trackers are deleted, and to zero when the last one goes", () => {
    const rows = [row(), row({ driver_uuid: "driver-2" })];
    expect(countWithdrawn(rows)).toBe(2);
    expect(countWithdrawn(rows.slice(1))).toBe(1);
    expect(countWithdrawn([])).toBe(0);
  });
});

describe("countWithdrawnByWeek", () => {
  it("groups by the Monday of the tracker's own date", () => {
    const counts = countWithdrawnByWeek([
      row({ date: "2026-09-07", status: "declined" }),
      row({ date: "2026-09-13", status: "abandoned" }),
      row({ date: "2026-09-14", status: "abandoned" }),
    ]);

    expect(counts.get("2026-09-07")).toBe(2);
    expect(counts.get("2026-09-14")).toBe(1);
  });

  it("leaves a week with nothing withdrawn absent rather than zero", () => {
    const counts = countWithdrawnByWeek([row({ date: "2026-09-07" })]);
    expect(counts.has("2026-09-14")).toBe(false);
    expect(counts.get("2026-09-14")).toBeUndefined();
  });

  it("skips a tracker with no date — it belongs to no week", () => {
    const counts = countWithdrawnByWeek([row({ date: null }), row({ date: "2026-09-07" })]);
    expect(counts.size).toBe(1);
    expect(counts.get("2026-09-07")).toBe(1);
  });

  it("ignores statuses that are not a driver withdrawal", () => {
    const counts = countWithdrawnByWeek([row({ date: "2026-09-07", status: "completed" })]);
    expect(counts.size).toBe(0);
  });
});

describe("countWithdrawnByDriver", () => {
  it("counts each driver separately inside one week", () => {
    const counts = countWithdrawnByDriver(
      [
        row({ driver_uuid: "driver-1", date: "2026-09-07", status: "declined" }),
        row({ driver_uuid: "driver-1", date: "2026-09-09", status: "abandoned" }),
        row({ driver_uuid: "driver-2", date: "2026-09-10", status: "abandoned" }),
        row({ driver_uuid: "driver-1", date: "2026-09-14", status: "abandoned" }),
      ],
      "2026-09-07",
    );

    expect(counts.get("driver-1")).toBe(2);
    expect(counts.get("driver-2")).toBe(1);
  });

  it("counts every week when no week is given", () => {
    const counts = countWithdrawnByDriver([
      row({ driver_uuid: "driver-1", date: "2026-09-07" }),
      row({ driver_uuid: "driver-1", date: "2026-09-14" }),
    ]);

    expect(counts.get("driver-1")).toBe(2);
  });

  it("skips a tracker with no driver — nobody to blame it on", () => {
    const counts = countWithdrawnByDriver([row({ driver_uuid: null })]);
    expect(counts.size).toBe(0);
  });

  it("leaves a driver who withdrew from nothing absent rather than zero", () => {
    const counts = countWithdrawnByDriver([row({ driver_uuid: "driver-1" })], "2026-09-07");
    expect(counts.has("driver-2")).toBe(false);
  });
});
