import { describe, it, expect } from "vitest";
import { samePlace } from "./samePlace";

describe("samePlace", () => {
  it("is true for the same address row", () => {
    expect(samePlace({ addressUuid: "a1", street: "x" }, { addressUuid: "a1", street: "y" })).toBe(
      true,
    );
  });

  it("matches by coordinates even when the street text differs (the #111 case)", () => {
    const event = {
      addressUuid: "e",
      street: "2371 Merrittville Highway",
      latitude: 43.07778,
      longitude: -79.25207,
    };
    const tracker = {
      addressUuid: "t",
      street: "2371 Merrittville Highway, Fonthill, ON, Canada",
      latitude: 43.0779,
      longitude: -79.2521,
    };
    expect(samePlace(event, tracker)).toBe(true);
  });

  it("does not match places over 200 m apart, whatever the text says", () => {
    const a = { street: "1 Main St", latitude: 43.0, longitude: -79.0 };
    const b = { street: "1 Main St", latitude: 43.01, longitude: -79.0 };
    expect(samePlace(a, b)).toBe(false);
  });

  it("falls back to the street text when either has no coordinates, never matching empties", () => {
    expect(
      samePlace(
        { street: "578 Aviation Road" },
        { street: "578 aviation road", latitude: 43, longitude: -73 },
      ),
    ).toBe(true);
    expect(samePlace({ street: "" }, { street: "" })).toBe(false);
  });
});
