import { describe, it, expect } from "vitest";
import { withJsonColumns } from "./jsonColumns";

describe("withJsonColumns", () => {
  it("parses a listed table's JSON columns into values", () => {
    expect(
      withJsonColumns("AutoWorkTrackerRunTrips", {
        run_uuid: "r1",
        snapshot: '{"tracker":{"id":"w1"},"lineItems":[]}',
      }),
    ).toEqual({ run_uuid: "r1", snapshot: { tracker: { id: "w1" }, lineItems: [] } });
  });

  it("leaves other tables, other columns, nulls and non-JSON text alone", () => {
    const events = { lead_submission: '{"a":1}' };
    expect(withJsonColumns("Events", events)).toBe(events);
    expect(
      withJsonColumns("AutoWorkTrackerRuns", {
        settings: null,
        result: "not json",
        week_start: "x",
      }),
    ).toEqual({ settings: null, result: "not json", week_start: "x" });
  });

  it("passes no data through", () => {
    expect(withJsonColumns("AutoWorkTrackerRuns", undefined)).toBeUndefined();
  });
});
