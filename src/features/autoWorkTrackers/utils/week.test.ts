import { describe, it, expect } from "vitest";
import { weekStartOf, weekEndOf, shiftWeek, formatWeekLabel, weekDays } from "./week";

describe("auto work tracker weeks (Monday to Sunday, both included)", () => {
  it("a Monday is the start of its own week", () => {
    expect(weekStartOf("2026-11-09")).toBe("2026-11-09");
  });

  it("every day of the week maps to that week's Monday", () => {
    for (const day of ["09", "10", "11", "12", "13", "14", "15"]) {
      expect(weekStartOf(`2026-11-${day}`), day).toBe("2026-11-09");
    }
  });

  it("a Sunday belongs to the week that is ending, not the one starting", () => {
    expect(weekStartOf("2026-11-15")).toBe("2026-11-09");
    expect(weekStartOf("2026-11-16")).toBe("2026-11-16");
  });

  it("the week ends on the Sunday, six days after the Monday", () => {
    expect(weekEndOf("2026-11-09")).toBe("2026-11-15");
  });

  it("crosses a month and a year boundary", () => {
    expect(weekStartOf("2026-12-31")).toBe("2026-12-28");
    expect(weekEndOf("2026-12-28")).toBe("2027-01-03");
  });

  it("steps whole weeks forward and back", () => {
    expect(shiftWeek("2026-11-09", 1)).toBe("2026-11-16");
    expect(shiftWeek("2026-11-09", -1)).toBe("2026-11-02");
    expect(shiftWeek("2026-12-28", 1)).toBe("2027-01-04");
  });

  it("is not thrown off by daylight saving changes", () => {
    // US clocks go back on 2026-11-01 and forward on 2026-03-08.
    expect(shiftWeek("2026-10-26", 1)).toBe("2026-11-02");
    expect(shiftWeek("2026-03-02", 1)).toBe("2026-03-09");
    expect(weekEndOf("2026-03-02")).toBe("2026-03-08");
  });

  it("lists the seven days of a week, Monday first and Sunday last", () => {
    expect(weekDays("2026-11-09")).toEqual([
      "2026-11-09",
      "2026-11-10",
      "2026-11-11",
      "2026-11-12",
      "2026-11-13",
      "2026-11-14",
      "2026-11-15",
    ]);
  });

  it("lists days across a month and a year boundary", () => {
    const days = weekDays("2026-12-28");
    expect(days).toHaveLength(7);
    expect(days[3]).toBe("2026-12-31");
    expect(days[4]).toBe("2027-01-01");
    expect(days[6]).toBe("2027-01-03");
  });

  it("labels a week with both its Monday and its Sunday", () => {
    expect(formatWeekLabel("2026-11-09")).toBe("Mon, Nov 9 – Sun, Nov 15");
    expect(formatWeekLabel("2026-12-28")).toBe("Mon, Dec 28 – Sun, Jan 3");
  });
});
