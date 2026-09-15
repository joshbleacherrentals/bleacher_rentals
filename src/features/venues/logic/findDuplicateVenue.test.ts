import { describe, it, expect } from "vitest";
import { findDuplicateVenue } from "./findDuplicateVenue";
import type { VenueFull } from "../types";

const venues: VenueFull[] = [
  {
    id: "v1",
    name: "Lincoln High School Stadium",
    address: {
      street: "195226 Allen Street",
      city: "Springfield",
      stateProvince: "IL",
      zipPostal: "62701",
    },
  },
  {
    id: "v2",
    name: "Central Park",
    address: {
      street: "1 Central Ave",
      city: "Springfield",
      stateProvince: "IL",
      zipPostal: "62702",
    },
  },
];

describe("findDuplicateVenue", () => {
  it("finds a venue with the exact same normalized address", () => {
    const match = findDuplicateVenue(venues, {
      street: "195226 allen street",
      city: "SPRINGFIELD",
      stateProvince: "il",
      zipPostal: "62701",
    });
    expect(match?.id).toBe("v1");
  });

  it("returns null when no address matches", () => {
    const match = findDuplicateVenue(venues, {
      street: "999 Nowhere Rd",
      city: "Springfield",
      stateProvince: "IL",
      zipPostal: "62701",
    });
    expect(match).toBeNull();
  });

  it("excludes the given venue id (editing in place never collides with itself)", () => {
    const match = findDuplicateVenue(
      venues,
      {
        street: "195226 Allen Street",
        city: "Springfield",
        stateProvince: "IL",
        zipPostal: "62701",
      },
      "v1",
    );
    expect(match).toBeNull();
  });
});
