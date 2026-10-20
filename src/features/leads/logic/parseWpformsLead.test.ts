import { describe, expect, it } from "vitest";
import { parseLeadDate, parseWpformsLead } from "./parseWpformsLead";

const sample = {
  name: "Gabrielle DeLa Garza",
  email: "Gabrielle.DelaGarza@teamhousing.com",
  phone: "+18305008879",
  event_name: "Conference",
  num_seats: "100",
  indoor_outdoor: "Outdoors",
  address: "",
  city_town: "Eagle Pass",
  state_prov: "Texas",
  zip_postal: "78852",
  start_date: { value: "11/04/2026", unix: 1793750400 },
  comment: "",
  end_date: { value: "11/04/2026", unix: 1793750400 },
  referral_method: "Google / Online Search",
  referral_source: "Paid Search - Google",
  referral_detail: "gclid",
};

describe("parseWpformsLead", () => {
  it("reads a full submission", () => {
    const lead = parseWpformsLead(sample);
    expect(lead).toMatchObject({
      firstName: "Gabrielle",
      lastName: "DeLa Garza",
      email: "gabrielle.delagarza@teamhousing.com",
      phone: "+18305008879",
      eventName: "Conference",
      seats: 100,
      street: "",
      city: "Eagle Pass",
      stateProvince: "Texas",
      zipPostal: "78852",
      startDate: "2026-11-04",
      endDate: "2026-11-04",
    });
    expect(lead.internalNotes).toContain("Indoor / outdoor: Outdoors");
    expect(lead.internalNotes).toContain(
      "Referral: Google / Online Search / Paid Search - Google / gclid",
    );
    expect(lead.internalNotes).not.toContain("Comment:");
  });

  it("keeps the comment when there is one", () => {
    expect(parseWpformsLead({ comment: "Need it by noon" }).internalNotes).toContain(
      "Comment: Need it by noon",
    );
  });

  it("reads an empty body, null, and a non-object without throwing", () => {
    for (const body of [{}, null, undefined, "text", 5, []]) {
      const lead = parseWpformsLead(body);
      expect(lead.firstName).toBeNull();
      expect(lead.email).toBeNull();
      expect(lead.eventName).toBeNull();
      expect(lead.seats).toBeNull();
      expect(lead.startDate).toBeNull();
      expect(lead.city).toBe("");
      expect(lead.zipPostal).toBeNull();
    }
  });

  it("gives a one-word name no last name, and ignores blanks", () => {
    expect(parseWpformsLead({ name: "  Cher  " })).toMatchObject({
      firstName: "Cher",
      lastName: null,
    });
    expect(parseWpformsLead({ name: "   ", email: "  " })).toMatchObject({
      firstName: null,
      email: null,
    });
  });

  it("reads seats from text, numbers and noise, and drops zero or nonsense", () => {
    expect(parseWpformsLead({ num_seats: "1,200 people" }).seats).toBe(1200);
    expect(parseWpformsLead({ num_seats: 80 }).seats).toBe(80);
    expect(parseWpformsLead({ num_seats: "0" }).seats).toBeNull();
    expect(parseWpformsLead({ num_seats: "many" }).seats).toBeNull();
  });
});

describe("parseLeadDate", () => {
  it("reads the form's MM/DD/YYYY, ISO dates and { value } objects", () => {
    expect(parseLeadDate("11/04/2026")).toBe("2026-11-04");
    expect(parseLeadDate("2026-11-04")).toBe("2026-11-04");
    expect(parseLeadDate("2026-11-04T10:00:00Z")).toBe("2026-11-04");
    expect(parseLeadDate({ value: "1/5/2027", unix: 1 })).toBe("2027-01-05");
  });

  it("returns null for anything that is not a real date", () => {
    for (const raw of ["", "soon", "13/40/2026", "02/30/2026", null, undefined, {}, 12, []]) {
      expect(parseLeadDate(raw)).toBeNull();
    }
  });
});
