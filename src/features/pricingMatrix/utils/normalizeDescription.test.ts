import { describe, it, expect } from "vitest";
import { normalizeDescription } from "./normalizeDescription";

describe("normalizeDescription", () => {
  it("stores nothing when there is no text", () => {
    expect(normalizeDescription(null)).toBeNull();
    expect(normalizeDescription(undefined)).toBeNull();
    expect(normalizeDescription("")).toBeNull();
  });

  it("stores nothing for whitespace-only text", () => {
    expect(normalizeDescription("  \n \t ")).toBeNull();
  });

  it("trims the outer whitespace", () => {
    expect(normalizeDescription("  15 rows, 300 seats \n")).toBe("15 rows, 300 seats");
  });

  it("keeps paragraphs and bullet lines", () => {
    expect(normalizeDescription("\nSeats 300.\n\nIncludes:\n- guard rails\n- steps\n")).toBe(
      "Seats 300.\n\nIncludes:\n- guard rails\n- steps",
    );
  });
});
