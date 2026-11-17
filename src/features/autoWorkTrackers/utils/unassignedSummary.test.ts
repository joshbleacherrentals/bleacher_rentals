import { describe, it, expect } from "vitest";
import { summarizeUnassigned } from "./unassignedSummary";

const u = (reason: "no_window" | "outside_week" | "no_free_driver_day") => ({
  bleacher_uuid: "b",
  bleacher_number: 1,
  from_street: "a",
  to_street: "b",
  earliest_day: null,
  latest_day: null,
  reason,
});

describe("summarizeUnassigned", () => {
  it("groups the trips by reason, most common first", () => {
    expect(
      summarizeUnassigned([u("no_window"), u("no_free_driver_day"), u("no_free_driver_day")]),
    ).toBe("3 trips not created: no driver free on those days (2), events are back to back (1).");
  });

  it("says trip in the singular for one", () => {
    expect(summarizeUnassigned([u("outside_week")])).toBe(
      "1 trip not created: no free day in this week (1).",
    );
  });
});
