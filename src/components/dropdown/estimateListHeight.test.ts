import { describe, it, expect } from "vitest";
import { estimateListHeight, OPTION_ROW_HEIGHT } from "./estimateListHeight";

describe("estimateListHeight", () => {
  it("counts rows before the list has been measured", () => {
    expect(estimateListHeight(3, 0)).toBe(3 * OPTION_ROW_HEIGHT + 2);
  });

  it("prefers the measured height once there is one", () => {
    expect(estimateListHeight(3, 250)).toBe(250);
  });

  it("is just the border for an empty list", () => {
    expect(estimateListHeight(0, 0)).toBe(2);
  });
});
