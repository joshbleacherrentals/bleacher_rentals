import { describe, it, expect } from "vitest";
import {
  WITHDRAWN_STATUSES,
  isWithdrawnStatus,
  weekStartOf,
  countAttention,
  countAttentionByWeek,
  countAttentionByDriver,
  attentionByTracker,
  type AttentionTrackerRow,
} from "./attentionTrackers";

const row = (over: Partial<AttentionTrackerRow> = {}): AttentionTrackerRow => ({
  id: "wt-1",
  driver_uuid: "driver-1",
  date: "2026-09-09",
  status: "abandoned",
  bleacher_uuid: "b-assigned",
  actual_bleacher_uuid: null,
  ...over,
});

/** A tracker the driver ran with a different bleacher than the one assigned. */
const swapped = (over: Partial<AttentionTrackerRow> = {}): AttentionTrackerRow =>
  row({ status: "accepted", actual_bleacher_uuid: "b-other", ...over });

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

describe("countAttention", () => {
  it("is zero when nothing was declined or abandoned", () => {
    expect(countAttention([])).toBe(0);
  });

  it("counts declined and abandoned together", () => {
    expect(
      countAttention([
        row({ status: "declined" }),
        row({ status: "abandoned" }),
        row({ driver_uuid: "driver-2", status: "declined" }),
      ]),
    ).toBe(3);
  });

  it("ignores any other status that reaches it", () => {
    expect(countAttention([row({ status: "cancelled" }), row({ status: "abandoned" })])).toBe(1);
  });

  it("counts a tracker with no date — the total is for all time", () => {
    expect(countAttention([row({ date: null })])).toBe(1);
  });

  it("drops back as trackers are deleted, and to zero when the last one goes", () => {
    const rows = [row(), row({ driver_uuid: "driver-2" })];
    expect(countAttention(rows)).toBe(2);
    expect(countAttention(rows.slice(1))).toBe(1);
    expect(countAttention([])).toBe(0);
  });
});

describe("countAttentionByWeek", () => {
  it("groups by the Monday of the tracker's own date", () => {
    const counts = countAttentionByWeek([
      row({ date: "2026-09-07", status: "declined" }),
      row({ date: "2026-09-13", status: "abandoned" }),
      row({ date: "2026-09-14", status: "abandoned" }),
    ]);

    expect(counts.get("2026-09-07")).toBe(2);
    expect(counts.get("2026-09-14")).toBe(1);
  });

  it("leaves a week with nothing needing attention absent rather than zero", () => {
    const counts = countAttentionByWeek([row({ date: "2026-09-07" })]);
    expect(counts.has("2026-09-14")).toBe(false);
    expect(counts.get("2026-09-14")).toBeUndefined();
  });

  it("skips a tracker with no date — it belongs to no week", () => {
    const counts = countAttentionByWeek([row({ date: null }), row({ date: "2026-09-07" })]);
    expect(counts.size).toBe(1);
    expect(counts.get("2026-09-07")).toBe(1);
  });

  it("ignores statuses that need no attention", () => {
    const counts = countAttentionByWeek([row({ date: "2026-09-07", status: "completed" })]);
    expect(counts.size).toBe(0);
  });
});

describe("countAttentionByDriver", () => {
  it("counts each driver separately inside one week", () => {
    const counts = countAttentionByDriver(
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
    const counts = countAttentionByDriver([
      row({ driver_uuid: "driver-1", date: "2026-09-07" }),
      row({ driver_uuid: "driver-1", date: "2026-09-14" }),
    ]);

    expect(counts.get("driver-1")).toBe(2);
  });

  it("skips a tracker with no driver — nobody to blame it on", () => {
    const counts = countAttentionByDriver([row({ driver_uuid: null })]);
    expect(counts.size).toBe(0);
  });

  it("leaves a driver who withdrew from nothing absent rather than zero", () => {
    const counts = countAttentionByDriver([row({ driver_uuid: "driver-1" })], "2026-09-07");
    expect(counts.has("driver-2")).toBe(false);
  });
});

describe("bleacher swaps share the same counts", () => {
  it("adds swapped trackers to withdrawals in the sidebar, the week and the driver", () => {
    const rows = [
      row({ date: "2026-09-07" }),
      row({ date: "2026-09-08" }),
      row({ date: "2026-09-09", status: "declined" }),
      swapped({ date: "2026-09-10" }),
      swapped({ date: "2026-09-13", status: "completed" }),
    ];

    expect(countAttention(rows)).toBe(5);
    expect(countAttentionByWeek(rows).get("2026-09-07")).toBe(5);
    expect(countAttentionByDriver(rows, "2026-09-07").get("driver-1")).toBe(5);
  });

  it("drops a swap once the manager makes the two bleachers match", () => {
    const rows = [swapped()];
    expect(countAttention(rows)).toBe(1);

    // Either side can move: the actual set to the assigned, or the assigned to the actual.
    expect(countAttention([swapped({ actual_bleacher_uuid: "b-assigned" })])).toBe(0);
    expect(countAttention([swapped({ bleacher_uuid: "b-other" })])).toBe(0);
  });

  it("does not count a tracker the driver has not confirmed yet", () => {
    expect(countAttention([row({ status: "accepted", actual_bleacher_uuid: null })])).toBe(0);
  });

  it("counts a swap on a tracker with no assigned bleacher", () => {
    expect(countAttention([swapped({ bleacher_uuid: null })])).toBe(1);
  });

  it("does not count a swap on a cancelled tracker", () => {
    expect(countAttention([swapped({ status: "cancelled" })])).toBe(0);
  });

  it("counts a tracker that is both abandoned and swapped once", () => {
    const rows = [swapped({ status: "abandoned" })];
    expect(countAttention(rows)).toBe(1);
    expect(countAttentionByWeek(rows).get("2026-09-07")).toBe(1);
    expect(countAttentionByDriver(rows, "2026-09-07").get("driver-1")).toBe(1);
  });
});

describe("attentionByTracker", () => {
  it("names the reason each tracker on a driver's week needs attention", () => {
    const reasons = attentionByTracker([
      row({ id: "wt-declined", status: "declined" }),
      row({ id: "wt-abandoned", status: "abandoned" }),
      swapped({ id: "wt-swapped" }),
      swapped({ id: "wt-fixed", actual_bleacher_uuid: "b-assigned" }),
      row({ id: "wt-quiet", status: "completed" }),
    ]);

    expect(reasons.get("wt-declined")).toBe("declined");
    expect(reasons.get("wt-abandoned")).toBe("abandoned");
    expect(reasons.get("wt-swapped")).toBe("bleacher_swap");
    expect(reasons.has("wt-fixed")).toBe(false);
    expect(reasons.has("wt-quiet")).toBe(false);
  });

  it("reports a tracker that is both abandoned and swapped by its status", () => {
    // Once the work is handed back, which bleacher went out is the smaller problem.
    const reasons = attentionByTracker([swapped({ id: "wt-1", status: "abandoned" })]);
    expect(reasons.get("wt-1")).toBe("abandoned");
    expect(reasons.size).toBe(1);
  });
});
