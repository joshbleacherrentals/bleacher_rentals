import { describe, expect, it } from "vitest";
import { validateContactChannel } from "./contactChannelEdit";

const contacts = [
  {
    id: "me",
    firstName: "Marie",
    lastName: "Tremblay",
    email: "marie@example.com",
    phone: "5551234567",
  },
  {
    id: "pat",
    firstName: "Pat",
    lastName: "Smith",
    email: "pat@example.com",
    phone: "(555) 999-0000",
  },
  { id: "solo", firstName: "Sol", lastName: null, email: "sol@example.com", phone: null },
];

describe("validateContactChannel — email", () => {
  it("accepts a new, well-formed email", () => {
    expect(validateContactChannel("email", "new@example.com", contacts, "me")).toBeNull();
  });

  it("rejects something that is not an email", () => {
    expect(validateContactChannel("email", "not-an-email", contacts, "me")).toMatch(/valid email/i);
  });

  it("names the contact who already has the email, ignoring case and spaces", () => {
    expect(validateContactChannel("email", " PAT@example.com ", contacts, "me")).toBe(
      "Email already belongs to Pat Smith.",
    );
    expect(validateContactChannel("email", "sol@example.com", contacts, "me")).toBe(
      "Email already belongs to Sol.",
    );
  });

  it("does not count the contact being edited", () => {
    expect(validateContactChannel("email", "marie@example.com", contacts, "me")).toBeNull();
  });

  it("lets a blank email through, because that clears it", () => {
    expect(validateContactChannel("email", "  ", contacts, "me")).toBeNull();
  });
});

describe("validateContactChannel — phone", () => {
  it("accepts a new, well-formed phone number", () => {
    expect(validateContactChannel("phone", "555-777-8888", contacts, "me")).toBeNull();
  });

  it("rejects a phone number with the wrong number of digits", () => {
    expect(validateContactChannel("phone", "555-1234", contacts, "me")).toMatch(/10-digit/i);
  });

  it("matches an existing number however it was written", () => {
    expect(validateContactChannel("phone", "555.999.0000", contacts, "me")).toBe(
      "Phone already belongs to Pat Smith.",
    );
    expect(validateContactChannel("phone", "+1 555 999 0000", contacts, "me")).toBe(
      "Phone already belongs to Pat Smith.",
    );
  });

  it("does not count the contact being edited, and lets blank clear it", () => {
    expect(validateContactChannel("phone", "(555) 123-4567", contacts, "me")).toBeNull();
    expect(validateContactChannel("phone", "", contacts, "me")).toBeNull();
  });

  it("is not blocked by a duplicate on the other field", () => {
    // Editing the phone while the email is already shared elsewhere must still work.
    const shared = [...contacts, { ...contacts[1], id: "twin", phone: null }];
    expect(validateContactChannel("phone", "555-777-8888", shared, "pat")).toBeNull();
  });
});
