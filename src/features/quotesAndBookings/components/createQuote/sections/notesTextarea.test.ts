import { describe, it, expect } from "vitest";
import { NOTES_MIN_HEIGHT_PX, NOTES_MAX_HEIGHT_PX, NOTES_TEXTAREA_CLASS } from "./notesTextarea";

describe("notes textarea", () => {
  it("can grow to six times its starting height, and no further", () => {
    expect(NOTES_MAX_HEIGHT_PX).toBe(NOTES_MIN_HEIGHT_PX * 6);
  });

  it("applies those bounds and resizes vertically only", () => {
    const classes = NOTES_TEXTAREA_CLASS.split(" ");
    expect(classes).toContain(`h-[${NOTES_MIN_HEIGHT_PX}px]`);
    expect(classes).toContain(`min-h-[${NOTES_MIN_HEIGHT_PX}px]`);
    expect(classes).toContain(`max-h-[${NOTES_MAX_HEIGHT_PX}px]`);
    expect(classes).toContain("resize-y");
  });
});
