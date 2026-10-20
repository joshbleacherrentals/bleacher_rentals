import { describe, expect, it } from "vitest";
import { leadSubmissionSections, readLeadSubmission } from "./leadSubmissionView";

const submission = {
  name: "Mark Meyer",
  email: "mmeyer@landsharks.org",
  phone: "+18434082164",
  event_name: "varsity football",
  start_date: { value: "08/20/2027", unix: 1818000000 },
  end_date: "12/03/2027",
  num_seats: "500",
  indoor_outdoor: "Outdoors",
  address: "580 Faison Rd",
  city_town: "Mount Pleasant",
  state_prov: "South Carolina",
  zip_postal: "29466",
  comment: "",
  referral_method: "none selected",
};

const rows = (sections: ReturnType<typeof leadSubmissionSections>, title: string) =>
  sections?.find((s) => s.title === title)?.rows ?? [];

describe("leadSubmissionSections", () => {
  it("arranges a submission in the sections of the notification email", () => {
    const sections = leadSubmissionSections(submission)!;
    expect(sections.map((s) => s.title)).toEqual([
      "Contact",
      "Event",
      "Location",
      "Comments",
      "Marketing",
    ]);
    expect(rows(sections, "Event").map((r) => [r.label, r.value])).toEqual([
      ["Event Name", "varsity football"],
      ["Event Start Date", "08/20/2027"],
      ["Event End Date", "12/03/2027"],
      ["Estimated # of Seats Needed", "500"],
      ["Indoor or Outdoor", "Outdoors"],
    ]);
  });

  it("links the email and the phone, and nothing else", () => {
    const contact = rows(leadSubmissionSections(submission), "Contact");
    expect(contact[0]).toMatchObject({ label: "Name", kind: "text" });
    expect(contact[1]).toMatchObject({ kind: "email", href: "mailto:mmeyer@landsharks.org" });
    expect(contact[2]).toMatchObject({ kind: "phone", href: "tel:+18434082164" });
  });

  it("shows a field the person left empty as null, so the page can say so", () => {
    expect(rows(leadSubmissionSections(submission), "Comments")).toEqual([
      { label: "Comments", value: null, kind: "text" },
    ]);
  });

  it("shows only the fields the submission holds", () => {
    const sections = leadSubmissionSections({ name: "Ada" })!;
    expect(sections).toHaveLength(1);
    expect(rows(sections, "Contact")).toEqual([{ label: "Name", value: "Ada", kind: "text" }]);
  });

  it("does not link a value that is not an email or a phone number", () => {
    const contact = rows(
      leadSubmissionSections({ email: "not an email", phone: "ask" }),
      "Contact",
    );
    expect(contact.every((r) => r.kind === "text" && r.href === undefined)).toBe(true);
  });

  it("lists fields it does not know under Other, with readable labels, and skips empty ones", () => {
    const other = rows(
      leadSubmissionSections({
        name: "Ada",
        utm_term: "bleachers",
        form_page: "",
        options: ["A", "B"],
      }),
      "Other",
    );
    expect(other.map((r) => [r.label, r.value])).toEqual([
      ["Utm Term", "bleachers"],
      ["Options", "A, B"],
    ]);
  });

  it("reads the JSON text the local database holds", () => {
    expect(leadSubmissionSections(JSON.stringify({ name: "Ada" }))).not.toBeNull();
    expect(readLeadSubmission('{"name":"Ada"}')).toEqual({ name: "Ada" });
  });

  it("is null for a quote without a submission, and for anything that is not an object", () => {
    for (const raw of [null, undefined, "", "not json", "[1]", "5", [1], 7]) {
      expect(leadSubmissionSections(raw)).toBeNull();
    }
  });
});
