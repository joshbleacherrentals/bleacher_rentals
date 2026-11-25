import { describe, it, expect } from "vitest";
import { autoWorkTrackerKey, countModelTrackers } from "./autoWorkTrackerKey";

describe("autoWorkTrackerKey", () => {
  it("joins the zone and the week start", () => {
    expect(autoWorkTrackerKey("zone-1", "2026-09-14")).toBe("zone-1|2026-09-14");
  });
});

describe("countModelTrackers", () => {
  const key = "zone-1|2026-09-14";

  it("counts the model's trackers, its drafts, and everyone else's", () => {
    expect(
      countModelTrackers(
        [
          { auto_work_tracker_id: key, status: "draft" },
          { auto_work_tracker_id: key, status: "draft" },
          { auto_work_tracker_id: key, status: "released" },
          { auto_work_tracker_id: null, status: "draft" },
          { auto_work_tracker_id: "zone-1|2026-09-07", status: "draft" },
        ],
        key,
      ),
    ).toEqual({ model: 3, modelDrafts: 2, manual: 2 });
  });

  it("is all zeros for an empty week", () => {
    expect(countModelTrackers([], key)).toEqual({ model: 0, modelDrafts: 0, manual: 0 });
  });
});
