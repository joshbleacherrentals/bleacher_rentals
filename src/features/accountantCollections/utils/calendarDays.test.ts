import { describe, it, expect } from "vitest";
import { addDays, daysBetween } from "./calendarDays";

describe("addDays", () => {
  it("moves within a month", () => {
    expect(addDays("2026-11-15", 7)).toBe("2026-11-22");
    expect(addDays("2026-11-15", 0)).toBe("2026-11-15");
  });

  it("crosses a month end", () => {
    expect(addDays("2026-10-30", 2)).toBe("2026-11-01");
    expect(addDays("2026-11-01", -1)).toBe("2026-10-31");
  });

  it("crosses a year end in both directions", () => {
    expect(addDays("2026-12-30", 3)).toBe("2027-01-02");
    expect(addDays("2027-01-01", -1)).toBe("2026-12-31");
  });

  it("knows the leap day", () => {
    expect(addDays("2028-02-28", 1)).toBe("2028-02-29");
    expect(addDays("2028-02-28", 2)).toBe("2028-03-01");
    expect(addDays("2027-02-28", 1)).toBe("2027-03-01");
  });

  it("takes a negative n, the 7-days-before rule included", () => {
    expect(addDays("2026-11-22", -7)).toBe("2026-11-15");
    expect(addDays("2026-03-03", -7)).toBe("2026-02-24");
    expect(addDays("2028-03-03", -7)).toBe("2028-02-25");
  });

  it("has no daylight-saving trap", () => {
    // Toronto changes its clocks on 2026-03-08 and 2026-11-01.
    expect(addDays("2026-03-07", 2)).toBe("2026-03-09");
    expect(addDays("2026-10-31", 2)).toBe("2026-11-02");
  });
});

describe("daysBetween", () => {
  it("is positive when `to` is later, negative when earlier, 0 for the same day", () => {
    expect(daysBetween("2026-11-01", "2026-11-15")).toBe(14);
    expect(daysBetween("2026-11-15", "2026-11-01")).toBe(-14);
    expect(daysBetween("2026-11-15", "2026-11-15")).toBe(0);
  });

  it("counts whole days across month, year and leap-day boundaries", () => {
    expect(daysBetween("2026-10-31", "2026-11-01")).toBe(1);
    expect(daysBetween("2026-12-31", "2027-01-01")).toBe(1);
    expect(daysBetween("2028-02-28", "2028-03-01")).toBe(2);
    expect(daysBetween("2027-02-28", "2027-03-01")).toBe(1);
    expect(daysBetween("2026-01-01", "2027-01-01")).toBe(365);
  });

  it("counts whole days over the clock changes", () => {
    expect(daysBetween("2026-03-07", "2026-03-09")).toBe(2);
    expect(daysBetween("2026-10-31", "2026-11-02")).toBe(2);
  });

  it("is the inverse of addDays", () => {
    for (const n of [-400, -31, -1, 0, 1, 7, 29, 366]) {
      expect(daysBetween("2026-11-15", addDays("2026-11-15", n))).toBe(n);
    }
  });
});
