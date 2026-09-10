import { describe, expect, it } from "vitest";
import { inspectionStatus, thresholdDates } from "./inspectionStatus";

describe("inspectionStatus", () => {
  it("reports a bleacher with no inspection row at all as unscheduled", () => {
    expect(inspectionStatus(null, "2026-09-08")).toBe("unscheduled");
  });

  it("stays quiet while the inspection is more than 30 days out", () => {
    expect(inspectionStatus("2026-10-09", "2026-09-08")).toBe("ok");
  });

  it("turns yellow on the 30th day out — the boundary is inclusive", () => {
    expect(inspectionStatus("2026-10-08", "2026-09-08")).toBe("warning");
  });

  it("is still yellow at 8 days, one day before red", () => {
    expect(inspectionStatus("2026-09-16", "2026-09-08")).toBe("warning");
  });

  it("turns red on the 7th day out — the boundary is inclusive", () => {
    expect(inspectionStatus("2026-09-15", "2026-09-08")).toBe("critical");
  });

  it("is red the day before it is due", () => {
    expect(inspectionStatus("2026-09-09", "2026-09-08")).toBe("critical");
  });

  it("is red, not overdue, on the due date itself — the day is not over yet", () => {
    expect(inspectionStatus("2026-09-08", "2026-09-08")).toBe("critical");
  });

  it("is overdue the day after the due date", () => {
    expect(inspectionStatus("2026-09-07", "2026-09-08")).toBe("overdue");
  });

  it("stays overdue a year later rather than wrapping around to ok", () => {
    expect(inspectionStatus("2025-09-08", "2026-09-08")).toBe("overdue");
  });

  it("counts across a month and year boundary, not within the month", () => {
    // 2026-12-06 -> 2027-01-05 is exactly 30 days.
    expect(inspectionStatus("2027-01-05", "2026-12-06")).toBe("warning");
    expect(inspectionStatus("2027-01-06", "2026-12-06")).toBe("ok");
  });

  it("counts the leap day when measuring the last week", () => {
    // 2028-02-22 -> 2028-02-29 is exactly 7 days only because 2028 is a leap year.
    expect(inspectionStatus("2028-02-29", "2028-02-22")).toBe("critical");
  });

  it("does not shift a status because the reader is in another timezone", () => {
    // Dates are calendar days, never timestamps — no hour to be off by.
    expect(inspectionStatus("2026-09-15", "2026-09-08")).toBe("critical");
    expect(inspectionStatus("2026-09-16", "2026-09-08")).toBe("warning");
  });
});

describe("thresholdDates", () => {
  it("returns the three days on which a bleacher changes status", () => {
    expect(thresholdDates("2027-03-14")).toEqual({
      warning: "2027-02-12",
      critical: "2027-03-07",
      overdue: "2027-03-14",
    });
  });

  it("walks back across a year boundary", () => {
    expect(thresholdDates("2027-01-05")).toEqual({
      warning: "2026-12-06",
      critical: "2026-12-29",
      overdue: "2027-01-05",
    });
  });

  it("walks back across a leap day", () => {
    expect(thresholdDates("2028-03-01")).toEqual({
      warning: "2028-01-31",
      critical: "2028-02-23",
      overdue: "2028-03-01",
    });
  });
});
