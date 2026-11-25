import { describe, it, expect } from "vitest";
import { summarizeUnassigned } from "./unassignedSummary";
import type { UnplacedReason } from "../planner/buildSolve";

const u = (reason: UnplacedReason) => ({ reason });

describe("summarizeUnassigned", () => {
  it("groups the trips by reason, most common first", () => {
    expect(
      summarizeUnassigned([u("no_window"), u("no_free_driver_day"), u("no_free_driver_day")]),
    ).toBe(
      "3 trips not created: no driver had room on those days (2), events are back to back (1).",
    );
  });

  it("says when a trip is too long for one day", () => {
    expect(summarizeUnassigned([u("too_long_for_a_day")])).toBe(
      "1 trip not created: longer than the longest day, with the drive there and back (1).",
    );
  });

  it("says trip in the singular for one", () => {
    expect(summarizeUnassigned([u("outside_week")])).toBe(
      "1 trip not created: no free day in this week (1).",
    );
  });
});
