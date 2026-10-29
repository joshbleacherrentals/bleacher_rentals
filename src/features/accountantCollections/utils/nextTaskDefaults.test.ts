import { describe, it, expect } from "vitest";
import {
  NEXT_TASK_DEFAULT_DAYS,
  NEXT_TASK_DEFAULT_NOTE,
  defaultNextTaskDate,
} from "./nextTaskDefaults";

describe("next task defaults", () => {
  it("opens with the note and the two days the modal promises", () => {
    expect(NEXT_TASK_DEFAULT_NOTE).toBe("Follow-up needed");
    expect(NEXT_TASK_DEFAULT_DAYS).toBe(2);
  });

  it("is today + 2 within a month", () => {
    expect(defaultNextTaskDate("2026-11-15")).toBe("2026-11-17");
  });

  it("crosses a month end", () => {
    expect(defaultNextTaskDate("2026-10-30")).toBe("2026-11-01");
    expect(defaultNextTaskDate("2026-10-31")).toBe("2026-11-02");
  });

  it("crosses a year end", () => {
    expect(defaultNextTaskDate("2026-12-31")).toBe("2027-01-02");
  });

  it("crosses 29 February in a leap year", () => {
    expect(defaultNextTaskDate("2028-02-28")).toBe("2028-03-01");
    expect(defaultNextTaskDate("2028-02-27")).toBe("2028-02-29");
  });

  it("skips 29 February in a common year", () => {
    expect(defaultNextTaskDate("2027-02-27")).toBe("2027-03-01");
  });
});
