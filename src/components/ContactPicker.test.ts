import { describe, it, expect } from "vitest";
import { contactDisplayName } from "./ContactPicker";

describe("contactDisplayName", () => {
  it("joins first and last name with a space", () => {
    expect(contactDisplayName({ firstName: "Jane", lastName: "Smith" })).toBe("Jane Smith");
  });

  it("trims a missing last name rather than leaving a stray space", () => {
    expect(contactDisplayName({ firstName: "Jane", lastName: null })).toBe("Jane");
  });
});
