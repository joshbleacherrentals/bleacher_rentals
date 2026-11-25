import { describe, it, expect } from "vitest";
import { describeLines, normalize, reviewTrip, weekTimeline } from "./runReview";

const snapshot = {
  tracker: {
    id: "w1",
    status: "draft",
    auto_work_tracker_id: "z|2026-09-14",
    driver_uuid: "d1",
    date: "2026-09-15",
    planned_pickup_at: "2026-09-15T07:10:00.000-04:00",
    setup_required: 1,
    pay_cents: 3060,
  },
  lineItems: [{ type: "hauling", qty_decimal: 1, unit_amt_cents: 3060 }],
};

const current = {
  id: "w1",
  status: "released",
  auto_work_tracker_id: null,
  driver_uuid: "d1",
  date: "2026-09-15",
  planned_pickup_at: "2026-09-15 11:10:00+00", // the same instant, as the server writes it
  setup_required: 1,
  pay_cents: 3060,
};

describe("reviewTrip", () => {
  it("is deleted when the tracker is gone", () => {
    expect(reviewTrip(snapshot, null, []).state).toBe("deleted");
  });

  it("is kept when only status and the model's key changed, and times match as instants", () => {
    expect(reviewTrip(snapshot, current, snapshot.lineItems)).toEqual({
      state: "kept",
      changes: [],
    });
  });

  it("lists what was edited, with before and after", () => {
    const review = reviewTrip(
      snapshot,
      { ...current, driver_uuid: "d2", date: "2026-09-16" },
      snapshot.lineItems,
    );
    expect(review.state).toBe("edited");
    expect(review.changes.map((c) => [c.label, c.before, c.after])).toEqual([
      ["Driver", "d1", "d2"],
      ["Day", "2026-09-15", "2026-09-16"],
    ]);
  });

  it("notices changed line items", () => {
    const review = reviewTrip(snapshot, current, [
      { type: "hauling", qty_decimal: 1, unit_amt_cents: 3060 },
      { type: "setup", qty_decimal: 1, unit_amt_cents: 5500 },
    ]);
    expect(review.changes).toEqual([
      {
        field: "line_items",
        label: "Line items",
        before: "Hauling $30.60",
        after: "Hauling $30.60, Setup $55.00",
      },
    ]);
  });
});

describe("normalize", () => {
  it("treats blanks as null and booleans as 0/1", () => {
    expect([normalize(""), normalize(undefined), normalize(true), normalize(false)]).toEqual([
      null,
      null,
      1,
      0,
    ]);
  });
});

describe("describeLines", () => {
  it("says none for no lines", () => {
    expect(describeLines([])).toBe("none");
  });
});

describe("weekTimeline", () => {
  it("splits the week's other trackers into before and after the run", () => {
    expect(
      weekTimeline(
        [
          { id: "m1", created_at: "2026-09-10T10:00:00Z" },
          { id: "w1", created_at: "2026-09-12T10:00:00Z" },
          { id: "m2", created_at: "2026-09-13 10:00:00+00" },
        ],
        "2026-09-12T10:00:00.000Z",
        new Set(["w1"]),
      ),
    ).toEqual({ before: 1, model: 1, after: 1 });
  });
});
