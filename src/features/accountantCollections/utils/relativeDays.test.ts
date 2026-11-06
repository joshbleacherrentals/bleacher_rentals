import { describe, it, expect } from "vitest";
import { addDays } from "./calendarDays";
import { followUpLabel, overdueLabel } from "./relativeDays";

// docs/specs/accountant-collections-07-collections-list.md §1: months are 30 days.
const TODAY = "2026-11-15";
const at = (offset: number) => addDays(TODAY, offset);

describe("followUpLabel", () => {
  const table: [number, string][] = [
    [0, "Due Today"],
    [1, "Due tomorrow"],
    [2, "2 days after"],
    [3, "3 days after"],
    [29, "29 days after"],
    [30, "Month after"],
    [59, "Month after"],
    [60, "2 Months after"],
    [89, "2 Months after"],
    [90, "3 Months after"],
    [365, "12 Months after"],
    [-1, "1 day ago"],
    [-2, "2 days ago"],
    [-3, "3 days ago"],
    [-29, "29 days ago"],
    [-30, "Month ago"],
    [-59, "Month ago"],
    [-60, "2 Months ago"],
    [-89, "2 Months ago"],
    [-90, "3 Months ago"],
    [-365, "12 Months ago"],
  ];

  it.each(table)("a task %i days from today reads %j", (offset, label) => {
    expect(followUpLabel(at(offset), TODAY)).toBe(label);
  });

  it("reads the day, not the time, of a timestamp-shaped date", () => {
    expect(followUpLabel("2026-11-15T23:59:00+00:00", TODAY)).toBe("Due Today");
  });
});

describe("overdueLabel", () => {
  const table: [number, string][] = [
    [0, "Due today"],
    [1, "1 day"],
    [3, "3 days"],
    [23, "23 days"],
    [29, "29 days"],
    [30, "Month"],
    [59, "Month"],
    [60, "2 Months"],
    [89, "2 Months"],
    [90, "3 Months"],
    [365, "12 Months"],
  ];

  it.each(table)("%i days overdue reads %j", (days, label) => {
    expect(overdueLabel(days)).toBe(label);
  });

  it("is a dash when there is no figure", () => {
    expect(overdueLabel(null)).toBe("—");
  });
});
