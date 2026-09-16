import { describe, it, expect } from "vitest";
import { draftSaveDefaults, validateQuoteForSend } from "./quoteValidation";
import type { AddressFields, LineItem } from "../types/quoteTypes";

const address: AddressFields = {
  street: "123 Main St",
  city: "Springfield",
  stateProvince: "IL",
  zipPostal: "62701",
};

const lineItem: LineItem = {
  id: "li-1",
  category: "bleachers",
  label: "10-row bleacher",
  bleacherTypeUuid: "bt-1",
  qty: 1,
  unitPriceCents: 10000,
  lineTotalCents: 10000,
  overridePrice: false,
  discountType: "fixed",
  discountValue: 0,
};

describe("draftSaveDefaults", () => {
  it("leaves filled-in values untouched", () => {
    expect(
      draftSaveDefaults({
        eventName: "Field Day",
        eventStart: "2099-01-01",
        eventEnd: "2099-01-02",
      }),
    ).toEqual({ eventName: "Field Day", eventStart: "2099-01-01", eventEnd: "2099-01-02" });
  });

  it("defaults a blank or whitespace-only name to 'Untitled Quote'", () => {
    expect(
      draftSaveDefaults({ eventName: "   ", eventStart: "2099-01-01", eventEnd: "2099-01-02" }),
    ).toEqual({ eventName: "Untitled Quote", eventStart: "2099-01-01", eventEnd: "2099-01-02" });
  });

  it("defaults blank start/end dates to today, so a fully blank draft can still be saved", () => {
    const today = new Date().toISOString().split("T")[0];
    expect(draftSaveDefaults({ eventName: "", eventStart: "", eventEnd: "" })).toEqual({
      eventName: "Untitled Quote",
      eventStart: today,
      eventEnd: today,
    });
  });
});

describe("validateQuoteForSend", () => {
  const complete = {
    salesOfficeId: "office-1",
    contactId: "contact-1",
    eventName: "Field Day",
    eventAddressData: address,
    eventTypeId: "type-1",
    eventStart: "2099-01-01",
    eventEnd: "2099-01-02",
    lineItems: [lineItem],
    termsDocumentId: "terms-1",
    quoteValidTill: "",
  };

  it("passes when every field required to send is filled in", () => {
    expect(validateQuoteForSend(complete)).toEqual({ ok: true });
  });

  it("lists every missing required field", () => {
    const result = validateQuoteForSend({
      ...complete,
      salesOfficeId: null,
      contactId: null,
      eventAddressData: null,
      eventTypeId: null,
      lineItems: [],
      termsDocumentId: null,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors[0]).toContain("Sales Office");
      expect(result.errors[0]).toContain("Contact");
      expect(result.errors[0]).toContain("Venue");
      expect(result.errors[0]).toContain("Event Type");
      expect(result.errors[0]).toContain("Line Items");
      expect(result.errors[0]).toContain("Terms and Conditions");
    }
  });

  it("rejects an event start date in the past", () => {
    const result = validateQuoteForSend({ ...complete, eventStart: "2000-01-01" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors).toContain("Event Start cannot be in the past");
  });

  it("rejects an event end before the event start", () => {
    const result = validateQuoteForSend({
      ...complete,
      eventStart: "2099-01-10",
      eventEnd: "2099-01-05",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors).toContain("Event End cannot be before Event Start");
  });

  it("rejects a quote-valid-till date after the event start", () => {
    const result = validateQuoteForSend({ ...complete, quoteValidTill: "2099-01-02" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors).toContain("Quote Valid Till cannot be after Event Start");
  });
});
