import { describe, expect, it } from "vitest";
import { nextDueFromInspected } from "./nextDueFromInspected";

describe("nextDueFromInspected", () => {
  it("prefills one year on from the inspection", () => {
    expect(nextDueFromInspected("2026-03-14")).toBe("2027-03-14");
  });

  it("clamps a leap day to the 28th rather than sliding into March", () => {
    expect(nextDueFromInspected("2028-02-29")).toBe("2029-02-28");
  });

  it("keeps a leap day intact when the next year is also a leap year", () => {
    expect(nextDueFromInspected("2024-02-29")).toBe("2025-02-28");
  });

  it("carries the year across a December inspection", () => {
    expect(nextDueFromInspected("2026-12-31")).toBe("2027-12-31");
  });

  it("has nothing to prefill from when the inspection date is unknown", () => {
    expect(nextDueFromInspected(null)).toBe(null);
  });
});
