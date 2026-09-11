import { describe, it, expect } from "vitest";
import { resolveVenueOnContactSelect } from "./resolveVenueOnContactSelect";

const venues = [
  { id: "v1", name: "Lincoln High Stadium" },
  { id: "v2", name: "Central Park" },
];

describe("resolveVenueOnContactSelect", () => {
  it("fills from the contact's default venue when the field is blank", () => {
    const result = resolveVenueOnContactSelect(null, "v1", venues);
    expect(result).toEqual(venues[0]);
  });

  it("does not overwrite a venue that's already set", () => {
    const result = resolveVenueOnContactSelect("v2", "v1", venues);
    expect(result).toBeNull();
  });

  it("does nothing when the contact has no default venue", () => {
    const result = resolveVenueOnContactSelect(null, null, venues);
    expect(result).toBeNull();
  });

  it("returns null if the contact's default venue id isn't in the list (e.g. deleted)", () => {
    const result = resolveVenueOnContactSelect(null, "missing-id", venues);
    expect(result).toBeNull();
  });
});
