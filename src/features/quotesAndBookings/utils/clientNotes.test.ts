import { describe, it, expect } from "vitest";
import { clientNotesFor, indexCompanyNotes } from "./clientNotes";

const companies = indexCompanyNotes([
  { id: "co-1", name: "Lincoln High School", notes: "Always call the AD first." },
  { id: "co-2", name: "Central Park Conservancy", notes: "   " },
  { id: "co-3", name: "No Notes Inc", notes: null },
]);

describe("indexCompanyNotes", () => {
  it("keeps only companies that have something written in their notes", () => {
    expect([...companies.keys()]).toEqual(["co-1"]);
  });

  it("trims the text it keeps", () => {
    const map = indexCompanyNotes([{ id: "c", name: "A", notes: "\n  hello \n" }]);
    expect(map.get("c")?.notes).toBe("hello");
  });
});

describe("clientNotesFor", () => {
  it("returns nothing when no contact is picked", () => {
    expect(clientNotesFor(null, companies)).toEqual([]);
  });

  it("returns the contact's own note", () => {
    const result = clientNotesFor(
      { notes: "Prefers text over calls.", companyUuid: null },
      companies,
    );
    expect(result).toEqual([{ label: "Contact notes", text: "Prefers text over calls." }]);
  });

  it("returns the company's note, labelled with the company name", () => {
    const result = clientNotesFor({ notes: null, companyUuid: "co-1" }, companies);
    expect(result).toEqual([
      { label: "Company notes · Lincoln High School", text: "Always call the AD first." },
    ]);
  });

  it("lists the contact's note before the company's when both exist", () => {
    const result = clientNotesFor({ notes: "Net 30.", companyUuid: "co-1" }, companies);
    expect(result.map((n) => n.label)).toEqual([
      "Contact notes",
      "Company notes · Lincoln High School",
    ]);
  });

  it("skips a blank or whitespace-only contact note", () => {
    expect(clientNotesFor({ notes: "  \n ", companyUuid: null }, companies)).toEqual([]);
    expect(clientNotesFor({ notes: "", companyUuid: null }, companies)).toEqual([]);
  });

  it("skips a company with no note, a missing company, and a contact with no company", () => {
    expect(clientNotesFor({ notes: null, companyUuid: "co-2" }, companies)).toEqual([]);
    expect(clientNotesFor({ notes: null, companyUuid: "co-3" }, companies)).toEqual([]);
    expect(clientNotesFor({ notes: null, companyUuid: "gone" }, companies)).toEqual([]);
    expect(clientNotesFor({ notes: null, companyUuid: null }, companies)).toEqual([]);
  });

  it("labels the company note plainly when the company has no name", () => {
    const map = indexCompanyNotes([{ id: "co-x", name: "", notes: "Note." }]);
    const result = clientNotesFor({ notes: null, companyUuid: "co-x" }, map);
    expect(result).toEqual([{ label: "Company notes", text: "Note." }]);
  });

  it("keeps line breaks inside a note", () => {
    const result = clientNotesFor({ notes: "Line one\nLine two", companyUuid: null }, companies);
    expect(result[0].text).toBe("Line one\nLine two");
  });
});
