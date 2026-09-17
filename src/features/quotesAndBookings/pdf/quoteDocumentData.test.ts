import { describe, it, expect } from "vitest";
import { combineAddressLine, buildCustomerCompany, toQuoteLineItem } from "./quoteDocumentData";

describe("combineAddressLine", () => {
  it("joins street, city, state and zip", () => {
    expect(combineAddressLine("12 Main St", "Montreal", "QC", "H2X 1Y4")).toBe(
      "12 Main St, Montreal, QC, H2X 1Y4",
    );
  });

  it("drops missing parts instead of leaving empty separators", () => {
    expect(combineAddressLine("12 Main St", null, null, null)).toBe("12 Main St");
    expect(combineAddressLine(null, "Montreal", null, "H2X 1Y4")).toBe("Montreal, H2X 1Y4");
  });

  it("returns an already fully-composed address as-is, without appending city/state/zip", () => {
    // A street field with more than one comma is already a full address —
    // appending city/state/zip again would duplicate it.
    const fullAddress = "12 Main St, Suite 400, Montreal, QC, H2X 1Y4";
    expect(combineAddressLine(fullAddress, "Montreal", "QC", "H2X 1Y4")).toBe(fullAddress);
  });

  it("returns an empty string when everything is missing", () => {
    expect(combineAddressLine(null, null, null, null)).toBe("");
  });
});

describe("buildCustomerCompany", () => {
  it("returns null when the contact is null", () => {
    expect(buildCustomerCompany(null)).toBeNull();
  });

  it("returns null when the contact has no company_uuid — never an empty block", () => {
    expect(
      buildCustomerCompany({
        company_uuid: null,
        Companies: { company_name: "Should Not Appear" },
      }),
    ).toBeNull();
  });

  it("returns the company name and combined address when company_uuid is set", () => {
    expect(
      buildCustomerCompany({
        company_uuid: "co-1",
        Companies: {
          company_name: "Acme Events Inc.",
          Addresses: {
            street: "12 Main St",
            city: "Montreal",
            state_province: "QC",
            zip_postal: "H2X 1Y4",
          },
        },
      }),
    ).toEqual({
      name: "Acme Events Inc.",
      address: "12 Main St, Montreal, QC, H2X 1Y4",
    });
  });

  it("still returns the company when it has no address on file", () => {
    expect(
      buildCustomerCompany({
        company_uuid: "co-1",
        Companies: { company_name: "Acme Events Inc." },
      }),
    ).toEqual({ name: "Acme Events Inc.", address: "" });
  });
});

describe("toQuoteLineItem", () => {
  it("carries the saved description, with its line breaks, to the PDF and public page", () => {
    expect(
      toQuoteLineItem({
        header: "15 Row",
        description: "Seats 300.\n\nIncludes:\n- guard rails",
        quantity: 2,
        value_cents: 50000,
      }),
    ).toEqual({
      label: "15 Row",
      description: "Seats 300.\n\nIncludes:\n- guard rails",
      qty: 2,
      unitPrice: 50000,
      total: 100000,
    });
  });

  it("has an empty description when none was saved", () => {
    expect(
      toQuoteLineItem({ header: "Delivery", description: null, quantity: null, value_cents: 3000 }),
    ).toEqual({ label: "Delivery", description: "", qty: 1, unitPrice: 3000, total: 3000 });
  });
});
