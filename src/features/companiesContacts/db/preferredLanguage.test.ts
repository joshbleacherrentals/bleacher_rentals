import { describe, expect, it } from "vitest";
import { preferredLanguageBadge, toPreferredLanguage } from "./preferredLanguage";

describe("preferredLanguageBadge", () => {
  it("is EN for english and FR for french", () => {
    expect(preferredLanguageBadge("english")).toBe("EN");
    expect(preferredLanguageBadge("french")).toBe("FR");
  });

  it("is EN for a contact whose stored language is missing or unknown", () => {
    expect(preferredLanguageBadge(toPreferredLanguage(null))).toBe("EN");
    expect(preferredLanguageBadge(toPreferredLanguage("klingon"))).toBe("EN");
  });
});
