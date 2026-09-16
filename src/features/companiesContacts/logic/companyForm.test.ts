import { describe, expect, it } from "vitest";
import { companyFormStateFrom, emptyCompanyFormState, isSameAddress } from "./companyForm";
import type { CompanyFull } from "../hooks/useCompaniesAll";

const billing = {
  id: "addr-b",
  street: "1 Main St",
  city: "Tampa",
  stateProvince: "FL",
  zipPostal: "33601",
  country: "US",
};

const company: CompanyFull = {
  id: "c1",
  companyName: "Acme",
  email: "info@acme.com",
  phone: null,
  notes: null,
  billingAddress: billing,
  shippingAddress: null,
};

describe("isSameAddress", () => {
  it("ignores case, surrounding whitespace, coordinates and place id", () => {
    expect(
      isSameAddress(billing, {
        street: " 1 MAIN st ",
        city: "tampa",
        stateProvince: "fl",
        zipPostal: "33601",
        country: "us",
        lat: 1,
        placeId: "x",
      }),
    ).toBe(true);
  });

  it("differs when any compared field differs", () => {
    expect(isSameAddress(billing, { ...billing, zipPostal: "33602" })).toBe(false);
    expect(isSameAddress(billing, { ...billing, country: "CA" })).toBe(false);
  });
});

describe("emptyCompanyFormState", () => {
  it("starts blank with shipping same as billing", () => {
    const s = emptyCompanyFormState();
    expect(s.values).toEqual({ companyName: "", email: "", phone: "" });
    expect(s.billing.street).toBe("");
    expect(s.sameAsBilling).toBe(true);
  });
});

describe("companyFormStateFrom", () => {
  it("copies the company fields, blanking nulls", () => {
    const s = companyFormStateFrom(company);
    expect(s.values).toEqual({ companyName: "Acme", email: "info@acme.com", phone: "" });
    expect(s.notes).toBe("");
    expect(s.billing.street).toBe("1 Main St");
  });

  it("treats a missing shipping address as same as billing", () => {
    expect(companyFormStateFrom(company).sameAsBilling).toBe(true);
  });

  it("treats an equal shipping address as same as billing", () => {
    const s = companyFormStateFrom({ ...company, shippingAddress: { ...billing, id: "addr-s" } });
    expect(s.sameAsBilling).toBe(true);
  });

  it("keeps a different shipping address separate", () => {
    const s = companyFormStateFrom({
      ...company,
      shippingAddress: { ...billing, id: "addr-s", city: "Orlando" },
    });
    expect(s.sameAsBilling).toBe(false);
    expect(s.shipping.city).toBe("Orlando");
  });
});
