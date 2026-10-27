import { describe, expect, it } from "vitest";
import { sameNameParts, trimNameParts, validateNameParts } from "./contactNameEdit";

describe("validateNameParts", () => {
  it("accepts a first and last name", () => {
    expect(validateNameParts({ firstName: "Marie", lastName: "Tremblay" })).toEqual({});
  });

  it("accepts a first name alone — the last name is optional", () => {
    expect(validateNameParts({ firstName: "Marie", lastName: "" })).toEqual({});
  });

  it("requires a first name", () => {
    expect(validateNameParts({ firstName: "  ", lastName: "Tremblay" }).firstName).toMatch(
      /required/i,
    );
  });

  it("rejects a name with no letters or numbers", () => {
    expect(validateNameParts({ firstName: "Marie", lastName: "---" }).lastName).toMatch(
      /letters or numbers/i,
    );
  });
});

describe("trimNameParts / sameNameParts", () => {
  it("trims both parts", () => {
    expect(trimNameParts({ firstName: " Marie ", lastName: " T " })).toEqual({
      firstName: "Marie",
      lastName: "T",
    });
  });

  it("treats a name that only differs by surrounding spaces as unchanged", () => {
    expect(
      sameNameParts(
        { firstName: "Marie ", lastName: "Tremblay" },
        { firstName: "Marie", lastName: " Tremblay" },
      ),
    ).toBe(true);
  });

  it("notices a real change in either part, and case is a change", () => {
    const base = { firstName: "Marie", lastName: "Tremblay" };

    expect(sameNameParts(base, { ...base, firstName: "Maria" })).toBe(false);
    expect(sameNameParts(base, { ...base, lastName: "" })).toBe(false);
    expect(sameNameParts(base, { ...base, lastName: "tremblay" })).toBe(false);
  });
});
