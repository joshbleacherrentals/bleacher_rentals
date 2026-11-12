import { describe, it, expect } from "vitest";
import { formatDateRange } from "./formatDateRange";

describe("formatDateRange", () => {
  it("shows one day alone", () => {
    expect(formatDateRange("2026-11-09", "2026-11-09")).toBe("Nov 9");
  });

  it("shortens a range inside one month", () => {
    expect(formatDateRange("2026-11-09", "2026-11-12")).toBe("Nov 9–12");
  });

  it("names both months when the range crosses one", () => {
    expect(formatDateRange("2026-11-30", "2026-12-02")).toBe("Nov 30 – Dec 2");
  });
});
