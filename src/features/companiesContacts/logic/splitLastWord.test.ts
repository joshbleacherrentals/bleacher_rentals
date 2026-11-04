import { describe, expect, it } from "vitest";
import { splitLastWord } from "./splitLastWord";

describe("splitLastWord", () => {
  it("keeps the last word apart from the rest, with the head's trailing space", () => {
    expect(splitLastWord("Pat Smith")).toEqual(["Pat ", "Smith"]);
    expect(splitLastWord("Mary Jo van der Berg")).toEqual(["Mary Jo van der ", "Berg"]);
  });

  it("returns an empty head for a single word", () => {
    expect(splitLastWord("Pat")).toEqual(["", "Pat"]);
  });

  it("ignores surrounding whitespace and handles an empty name", () => {
    expect(splitLastWord("  Pat Smith  ")).toEqual(["Pat ", "Smith"]);
    expect(splitLastWord("")).toEqual(["", ""]);
  });
});
