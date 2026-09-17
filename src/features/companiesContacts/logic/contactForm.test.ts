import { describe, expect, it } from "vitest";
import {
  contactFormStateFrom,
  emptyContactFormState,
  venueIdToSave,
  type ContactFormSource,
} from "./contactForm";
import type { VenueFull } from "@/features/venues/types";

const venue: VenueFull = {
  id: "v1",
  name: "Lincoln Stadium",
  address: { street: "5 Park Ave", city: "Lincoln", stateProvince: "NE", zipPostal: "68508" },
};

const source: ContactFormSource = {
  firstName: "Jane",
  lastName: null,
  email: "jane@x.com",
  phone: null,
  notes: null,
  companyUuid: "c1",
  preferredLanguage: "french",
  defaultVenueId: "v1",
};

describe("emptyContactFormState", () => {
  it("starts blank, English, no venue", () => {
    const s = emptyContactFormState();
    expect(s.values).toEqual({ firstName: "", lastName: "", email: "", phone: "" });
    expect(s.preferredLanguage).toBe("english");
    expect(s.venue.mode).toBe("empty");
    expect(s.companyUuid).toBeNull();
  });

  it("splits the initial query into first and last name", () => {
    const s = emptyContactFormState("  Mary Ann  Smith ");
    expect(s.values.firstName).toBe("Mary");
    expect(s.values.lastName).toBe("Ann Smith");
  });
});

describe("contactFormStateFrom", () => {
  it("copies the contact fields, blanking nulls", () => {
    const s = contactFormStateFrom(source, [venue]);
    expect(s.values).toEqual({ firstName: "Jane", lastName: "", email: "jane@x.com", phone: "" });
    expect(s.companyUuid).toBe("c1");
    expect(s.preferredLanguage).toBe("french");
  });

  it("resolves the default venue", () => {
    expect(contactFormStateFrom(source, [venue]).venue).toEqual({
      mode: "venue",
      venueId: "v1",
      name: "Lincoln Stadium",
      address: venue.address,
    });
  });

  it("falls back to empty when the venue is not (yet) known", () => {
    expect(contactFormStateFrom(source, []).venue.mode).toBe("empty");
  });
});

describe("venueIdToSave", () => {
  it("saves the picked venue", () => {
    const s = contactFormStateFrom(source, [venue]);
    expect(venueIdToSave(s, "v1", false)).toBe("v1");
    expect(
      venueIdToSave(
        { ...s, venue: { ...venue, mode: "venue", venueId: "v2" } as never },
        "v1",
        true,
      ),
    ).toBe("v2");
  });

  it("keeps an unresolved original venue the user never touched", () => {
    const s = contactFormStateFrom(source, []);
    expect(venueIdToSave(s, "v1", false)).toBe("v1");
  });

  it("clears the venue once the user touched the picker and left it empty", () => {
    const s = contactFormStateFrom(source, []);
    expect(venueIdToSave(s, "v1", true)).toBeNull();
  });

  it("returns null for a new contact with no venue", () => {
    expect(venueIdToSave(emptyContactFormState(), null, false)).toBeNull();
  });
});
