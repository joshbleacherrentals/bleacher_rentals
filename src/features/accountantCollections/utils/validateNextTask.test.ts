import { describe, it, expect } from "vitest";
import { validateNextTask } from "./validateNextTask";

const TODAY = "2026-11-15";

describe("validateNextTask", () => {
  it("accepts a note and a date of today", () => {
    expect(validateNextTask({ dueDate: TODAY, note: "Call the customer", today: TODAY })).toEqual({
      ok: true,
    });
  });

  it("accepts a later date", () => {
    expect(validateNextTask({ dueDate: "2027-01-02", note: "Email", today: TODAY })).toEqual({
      ok: true,
    });
  });

  it("refuses an empty note", () => {
    expect(validateNextTask({ dueDate: TODAY, note: "", today: TODAY })).toEqual({
      ok: false,
      errors: ["Write a note for the next task."],
    });
  });

  it("refuses a whitespace-only note", () => {
    expect(validateNextTask({ dueDate: TODAY, note: " \n\t ", today: TODAY })).toEqual({
      ok: false,
      errors: ["Write a note for the next task."],
    });
  });

  it("refuses yesterday", () => {
    expect(validateNextTask({ dueDate: "2026-11-14", note: "Call", today: TODAY })).toEqual({
      ok: false,
      errors: ["The date cannot be in the past."],
    });
  });

  it("refuses a day that does not exist", () => {
    expect(validateNextTask({ dueDate: "2026-02-30", note: "Call", today: TODAY })).toEqual({
      ok: false,
      errors: ["Choose a date."],
    });
  });

  it("refuses text that is not a date", () => {
    expect(validateNextTask({ dueDate: "abc", note: "Call", today: TODAY })).toEqual({
      ok: false,
      errors: ["Choose a date."],
    });
    expect(validateNextTask({ dueDate: "", note: "Call", today: TODAY })).toEqual({
      ok: false,
      errors: ["Choose a date."],
    });
  });

  it("refuses a date in the wrong format", () => {
    expect(validateNextTask({ dueDate: "2026-1-5", note: "Call", today: TODAY })).toEqual({
      ok: false,
      errors: ["Choose a date."],
    });
  });

  it("reports every problem at once", () => {
    expect(validateNextTask({ dueDate: "2026-11-01", note: "  ", today: TODAY })).toEqual({
      ok: false,
      errors: ["Write a note for the next task.", "The date cannot be in the past."],
    });
    expect(validateNextTask({ dueDate: "abc", note: "", today: TODAY })).toEqual({
      ok: false,
      errors: ["Write a note for the next task.", "Choose a date."],
    });
  });
});
