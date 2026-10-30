import { describe, expect, it } from "vitest";
import { formatPhone } from "./formatPhone";

describe("formatPhone", () => {
  it("formats ten digits as 555-555-5555", () => {
    expect(formatPhone("5555555555")).toBe("555-555-5555");
  });

  it("normalizes other ways of typing a ten-digit number", () => {
    expect(formatPhone("(555) 555-5555")).toBe("555-555-5555");
    expect(formatPhone("555.555.5555")).toBe("555-555-5555");
    expect(formatPhone(" 555 555 5555 ")).toBe("555-555-5555");
  });

  it("leaves anything that is not exactly ten digits as entered", () => {
    expect(formatPhone("+1 555 555 5555")).toBe("+1 555 555 5555");
    expect(formatPhone("555-5555")).toBe("555-5555");
    expect(formatPhone("555-555-5555 x12")).toBe("555-555-5555 x12");
    expect(formatPhone("")).toBe("");
  });
});
