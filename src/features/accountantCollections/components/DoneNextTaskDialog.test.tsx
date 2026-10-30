import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

const { mockSave, mockToast } = vi.hoisted(() => ({ mockSave: vi.fn(), mockToast: vi.fn() }));

vi.mock("../db/saveNextTask", async () => {
  const actual = await vi.importActual<typeof import("../db/saveNextTask")>("../db/saveNextTask");
  return { ...actual, saveNextTask: (...args: unknown[]) => mockSave(...args) };
});
vi.mock("@/components/toasts/ErrorToast", () => ({
  createErrorToastNoThrow: (...args: unknown[]) => mockToast(...args),
}));

import { NextTaskValidationError } from "../db/saveNextTask";
import { canSaveNextTask, dueLabel, NextTaskFormView, submitNextTask } from "./DoneNextTaskDialog";

const TODAY = "2026-11-10";

beforeEach(() => {
  mockSave.mockReset();
  mockToast.mockReset();
});

describe("dueLabel", () => {
  it("reads Today, 1 Day or N Days", () => {
    expect(dueLabel("2026-11-10", TODAY)).toBe("Today");
    expect(dueLabel("2026-11-11", TODAY)).toBe("1 Day");
    expect(dueLabel("2026-11-12", TODAY)).toBe("2 Days");
    expect(dueLabel("2026-12-10", TODAY)).toBe("30 Days");
  });

  it("asks for a date when there is none", () => {
    expect(dueLabel("", TODAY)).toBe("Choose a date");
  });
});

describe("canSaveNextTask", () => {
  const base = { dueDate: "2026-11-12", note: "Follow-up needed", today: TODAY, saving: false };

  it("allows a note and a date from today on", () => {
    expect(canSaveNextTask(base)).toBe(true);
    expect(canSaveNextTask({ ...base, dueDate: TODAY })).toBe(true);
  });

  it("refuses a blank note", () => {
    expect(canSaveNextTask({ ...base, note: "" })).toBe(false);
    expect(canSaveNextTask({ ...base, note: "   \n " })).toBe(false);
  });

  it("refuses a missing or past date", () => {
    expect(canSaveNextTask({ ...base, dueDate: "" })).toBe(false);
    expect(canSaveNextTask({ ...base, dueDate: "2026-11-09" })).toBe(false);
  });

  it("refuses while a save runs", () => {
    expect(canSaveNextTask({ ...base, saving: true })).toBe(false);
  });
});

describe("NextTaskFormView", () => {
  const render = (over: Partial<React.ComponentProps<typeof NextTaskFormView>> = {}) =>
    renderToStaticMarkup(
      <NextTaskFormView
        today={TODAY}
        dueDate="2026-11-12"
        note="Follow-up needed"
        saving={false}
        onDueDateChange={() => {}}
        onNoteChange={() => {}}
        onSave={() => {}}
        {...over}
      />,
    );

  it("shows the date as a button, and the note in an editable textarea", () => {
    const html = render();
    expect(html).toContain("Next Task Due:");
    expect(html).toContain("2 Days");
    expect(html).toContain("Note to self:");
    expect(html).toMatch(/<textarea[^>]*>Follow-up needed<\/textarea>/);
    expect(html).toMatch(/<button[^>]*>Save<\/button>/);
  });

  it("enables Save for a good form", () => {
    expect(render()).not.toMatch(/<button[^>]*disabled=""[^>]*>Save</);
  });

  it("disables Save for a blank note", () => {
    expect(render({ note: "  " })).toMatch(/<button[^>]*disabled=""[^>]*>Save</);
  });

  it("disables Save for an invalid date", () => {
    const html = render({ dueDate: "" });
    expect(html).toContain("Choose a date");
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*>Save</);
  });

  it("disables Save while saving", () => {
    expect(render({ saving: true })).toMatch(/<button[^>]*disabled=""[^>]*>Save</);
  });
});

describe("submitNextTask", () => {
  const input = {
    eventUuid: "evt-1",
    dueDate: "2026-11-12",
    note: "Did we get the check yet?",
    today: TODAY,
  };

  it("passes what was typed to saveNextTask and reports success", async () => {
    mockSave.mockResolvedValue({ taskId: "task-9" });
    await expect(submitNextTask(input)).resolves.toBe(true);
    expect(mockSave).toHaveBeenCalledWith(input);
    expect(mockToast).not.toHaveBeenCalled();
  });

  it("shows the toast and reports failure when the save is refused", async () => {
    mockSave.mockRejectedValue(new NextTaskValidationError(["Write a note for the next task."]));
    await expect(submitNextTask(input)).resolves.toBe(false);
    expect(mockToast).toHaveBeenCalledTimes(1);
    expect(mockToast.mock.calls[0][0]).toContain("Write a note for the next task.");
  });

  it("shows the toast for any other error", async () => {
    mockSave.mockRejectedValue(new Error("database is locked"));
    await expect(submitNextTask(input)).resolves.toBe(false);
    expect(mockToast.mock.calls[0][0].join(" ")).toContain("database is locked");
  });
});
