import { describe, expect, it } from "vitest";
import {
  COLUMN_WIDTH,
  MIN_WIDTH_FOR_SIDE_LINKS,
  RAIL_GAP,
  RAIL_WIDTH,
  hasRoomForSideLinks,
  sideLinksShown,
} from "./sideLinkRoom";

// docs/specs/accountant-collections-22-side-task-buttons.md §3 and §5.

describe("the sizes of the design", () => {
  it("draws the column at 1040 px with a 168 px rail and a 16 px gap on each side", () => {
    expect(COLUMN_WIDTH).toBe(1040);
    expect(RAIL_WIDTH).toBe(168);
    expect(RAIL_GAP).toBe(16);
  });

  it("needs the column plus both rails and both gaps: 1408 px", () => {
    expect(MIN_WIDTH_FOR_SIDE_LINKS).toBe(1408);
    expect(MIN_WIDTH_FOR_SIDE_LINKS).toBe(COLUMN_WIDTH + 2 * (RAIL_WIDTH + RAIL_GAP));
  });
});

describe("hasRoomForSideLinks", () => {
  it.each<[number | null, boolean]>([
    [null, false],
    [0, false],
    [1407, false],
    [1408, true],
    [1409, true],
    [2560, true],
  ])("for a page box of %s px is %s", (width, expected) => {
    expect(hasRoomForSideLinks(width)).toBe(expected);
  });
});

describe("sideLinksShown", () => {
  it("is true when the view allows them and there is room", () => {
    expect(sideLinksShown(true, 1408)).toBe(true);
    expect(sideLinksShown(true, 2560)).toBe(true);
  });

  it("is false when the view does not allow them (Customer view), even with room", () => {
    expect(sideLinksShown(false, 1408)).toBe(false);
    expect(sideLinksShown(false, 2560)).toBe(false);
  });

  it("is false while the width is not measured", () => {
    expect(sideLinksShown(true, null)).toBe(false);
    expect(sideLinksShown(false, null)).toBe(false);
  });

  it("is false without room", () => {
    expect(sideLinksShown(true, 1407)).toBe(false);
    expect(sideLinksShown(true, 0)).toBe(false);
  });
});
