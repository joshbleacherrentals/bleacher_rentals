import { describe, it, expect } from "vitest";
import {
  filterCompanies,
  filterContacts,
  type CompanySearchable,
  type ContactSearchable,
} from "../utils/searchFilter";

const billing = {
  street: "1 Main St",
  city: "Tampa",
  stateProvince: "FL",
  zipPostal: "33601",
  lat: 27.9506,
  lng: -82.4572,
  country: "US",
};
const shipping = {
  street: "77 Dock Rd",
  city: "Savannah",
  stateProvince: "GA",
  zipPostal: "31401",
  lat: 32.0809,
  lng: -81.0912,
  country: "Canada",
};

const companies: (CompanySearchable & { id: string })[] = [
  {
    id: "1",
    companyName: "Live Nation",
    email: "info@livenation.com",
    phone: "+1-310-867-7000",
    billingAddress: billing,
    shippingAddress: shipping,
  },
  {
    id: "2",
    companyName: "AEG Presents",
    email: "hello@aeg.com",
    phone: "+1-213-742-7100",
    billingAddress: null,
    shippingAddress: null,
  },
  {
    id: "3",
    companyName: "Acme Corp",
    email: null,
    phone: null,
    billingAddress: null,
    shippingAddress: null,
  },
];

const contacts: (ContactSearchable & { id: string })[] = [
  {
    id: "1",
    firstName: "Jane",
    lastName: "Smith",
    email: "jane@livenation.com",
    phone: "+1-555-0001",
    preferredLanguage: "french",
    defaultVenue: {
      id: "v1",
      name: "Lincoln Stadium",
      address: {
        street: "5 Park Ave",
        city: "Lincoln",
        stateProvince: "Nebraska",
        zipPostal: "68508",
        lat: 40.8136,
        lng: -96.7026,
        country: "Mexico",
      },
    },
    company: {
      companyName: "Live Nation",
      email: "info@livenation.com",
      phone: "+1-310-867-7000",
      billingAddress: billing,
      shippingAddress: shipping,
    },
  },
  {
    id: "2",
    firstName: "Bob",
    lastName: "Jones",
    email: "bob@aeg.com",
    phone: "+1-555-0002",
    preferredLanguage: "english",
    defaultVenue: null,
    company: {
      companyName: "AEG Presents",
      email: "hello@aeg.com",
      phone: "+1-213-742-7100",
      billingAddress: null,
      shippingAddress: null,
    },
  },
  {
    id: "3",
    firstName: "Alice",
    lastName: null,
    email: null,
    phone: null,
    preferredLanguage: "english",
    defaultVenue: null,
    company: null,
  },
];

describe("filterCompanies", () => {
  it("returns all when query is empty", () => {
    expect(filterCompanies(companies, "")).toHaveLength(3);
    expect(filterCompanies(companies, "   ")).toHaveLength(3);
  });

  it("returns empty when no match", () => {
    expect(filterCompanies(companies, "xyz-no-match")).toHaveLength(0);
  });

  it("skips null fields without throwing", () => {
    expect(filterCompanies(companies, "acme")).toEqual([companies[2]]);
  });

  it.each([
    ["company_name", "NATION"],
    ["phone", "867-7000"],
    ["email", "info@livenation"],
    ["billing street", "main st"],
    ["billing city", "tampa"],
    ["billing state_province", "FL"],
    ["billing zip_postal", "33601"],
    ["billing latitude", "27.9506"],
    ["billing longitude", "-82.4572"],
    ["billing country", "US"],
    ["shipping street", "dock rd"],
    ["shipping city", "savannah"],
    ["shipping state_province", "GA"],
    ["shipping zip_postal", "31401"],
    ["shipping latitude", "32.0809"],
    ["shipping longitude", "-81.0912"],
    ["shipping country", "canada"],
  ])("finds a company by %s", (_field, query) => {
    expect(filterCompanies(companies, query)).toEqual([companies[0]]);
  });
});

describe("filterContacts", () => {
  it("returns all when query is empty", () => {
    expect(filterContacts(contacts, "")).toHaveLength(3);
  });

  it("returns empty when no match", () => {
    expect(filterContacts(contacts, "xyz-no-match")).toHaveLength(0);
  });

  it("handles null fields without throwing", () => {
    expect(filterContacts(contacts, "alice")).toEqual([contacts[2]]);
  });

  it("matches English on every English contact", () => {
    expect(filterContacts(contacts, "english").map((c) => c.id)).toEqual(["2", "3"]);
  });

  it.each([
    ["first_name", "jane"],
    ["last_name", "smith"],
    ["full name", "jane smith"],
    ["phone", "0001"],
    ["email", "jane@"],
    ["preferred_language value", "french"],
    ["preferred_language label", "French"],
    ["venue name", "lincoln stadium"],
    ["venue street", "park ave"],
    ["venue city", "lincoln"],
    ["venue state_province", "nebraska"],
    ["venue zip_postal", "68508"],
    ["venue latitude", "40.8136"],
    ["venue longitude", "-96.7026"],
    ["venue country", "mexico"],
    ["company name", "live nation"],
    ["company phone", "867-7000"],
    ["company email", "info@livenation"],
    ["company billing street", "main st"],
    ["company billing city", "tampa"],
    ["company billing zip_postal", "33601"],
    ["company billing latitude", "27.9506"],
    ["company billing country", "US"],
    ["company shipping street", "dock rd"],
    ["company shipping state_province", "GA"],
    ["company shipping longitude", "-81.0912"],
    ["company shipping country", "canada"],
  ])("finds a contact by %s", (_field, query) => {
    expect(filterContacts(contacts, query)).toEqual([contacts[0]]);
  });
});
