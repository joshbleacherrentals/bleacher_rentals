import { describe, expect, it } from "vitest";
import {
  addRecipient,
  contactDisplayName,
  namesByAddress,
  recipientLabel,
  recipientSummary,
  removeRecipient,
  suggestContacts,
  type DirectoryContact,
} from "./recipientList";

const contact = (name: string, email: string): DirectoryContact => ({ id: email, name, email });

const directory = [
  contact("Pat Smith", "pat@xyz.com"),
  contact("Patricia Jones", "pjones@abc.com"),
  contact("Sam Patel", "sam@patel.org"),
  contact("", "info@nobody.com"),
];

describe("contactDisplayName", () => {
  it("joins the first and last name, whichever are there", () => {
    expect(contactDisplayName("Pat", "Smith")).toBe("Pat Smith");
    expect(contactDisplayName("Pat", null)).toBe("Pat");
    expect(contactDisplayName(" Pat ", " ")).toBe("Pat");
    expect(contactDisplayName(null, null)).toBe("");
  });
});

describe("namesByAddress", () => {
  it("maps each contact's address, in lower case, to their name, first contact winning", () => {
    const names = namesByAddress([
      contact("Pat Smith", "Pat@XYZ.com"),
      contact("Someone Else", "pat@xyz.com"),
      contact("", "info@nobody.com"),
    ]);

    expect(names.get("pat@xyz.com")).toBe("Pat Smith");
    expect(names.has("info@nobody.com")).toBe(false); // no name to show
  });
});

describe("recipientLabel", () => {
  const names = namesByAddress(directory);

  it("shows the name and the address for a contact, and just the address for anyone else", () => {
    expect(recipientLabel("pat@xyz.com", names)).toBe("Pat Smith (pat@xyz.com)");
    expect(recipientLabel("stranger@x.com", names)).toBe("stranger@x.com");
    expect(recipientLabel("info@nobody.com", names)).toBe("info@nobody.com");
  });
});

describe("recipientSummary", () => {
  const names = namesByAddress(directory);

  it("lists a contact by name and anyone else by address, in order", () => {
    expect(recipientSummary(["pat@xyz.com", "stranger@gmail.com", "sam@patel.org"], names)).toBe(
      "Pat Smith, stranger@gmail.com, Sam Patel",
    );
  });

  it("uses the address for a contact who has no name, and is empty for nobody", () => {
    expect(recipientSummary(["info@nobody.com"], names)).toBe("info@nobody.com");
    expect(recipientSummary([], names)).toBe("");
  });
});

describe("suggestContacts", () => {
  const emails = (list: DirectoryContact[]) => list.map((c) => c.email);

  it("suggests nothing for an empty query", () => {
    expect(suggestContacts(directory, "", [])).toEqual([]);
    expect(suggestContacts(directory, "   ", [])).toEqual([]);
  });

  it("matches the address, first name, last name or full name, whatever the case", () => {
    expect(emails(suggestContacts(directory, "PJONES", []))).toEqual(["pjones@abc.com"]);
    expect(emails(suggestContacts(directory, "smith", []))).toEqual(["pat@xyz.com"]);
    expect(emails(suggestContacts(directory, "pat smith", []))).toEqual(["pat@xyz.com"]);
    expect(emails(suggestContacts(directory, "nobody", []))).toEqual(["info@nobody.com"]);
  });

  it("puts matches that start a word or an address ahead of ones that only contain the text", () => {
    const people = [contact("Xpat Lee", "x@a.com"), contact("Pat Smith", "p@a.com")];

    expect(emails(suggestContacts(people, "pat", []))).toEqual(["p@a.com", "x@a.com"]);
  });

  it("leaves out addresses already chosen, whatever their case", () => {
    expect(emails(suggestContacts(directory, "pat", ["PAT@xyz.com"]))).toEqual([
      "pjones@abc.com",
      "sam@patel.org",
    ]);
  });

  it("lists a person once when two contacts share an address, and stops at the limit", () => {
    const twice = [contact("Pat A", "pat@xyz.com"), contact("Pat B", "PAT@xyz.com")];
    const many = Array.from({ length: 12 }, (_, i) => contact(`Pat ${i}`, `p${i}@x.com`));

    expect(suggestContacts(twice, "pat", [])).toHaveLength(1);
    expect(suggestContacts(many, "pat", [])).toHaveLength(8);
    expect(suggestContacts(many, "pat", [], 3)).toHaveLength(3);
  });
});

describe("addRecipient and removeRecipient", () => {
  it("adds an address in lower case, once", () => {
    expect(addRecipient(["a@x.com"], " B@X.com ")).toEqual(["a@x.com", "b@x.com"]);
    expect(addRecipient(["a@x.com"], "A@x.COM")).toEqual(["a@x.com"]);
  });

  it("removes an address whatever its case, and leaves the rest in order", () => {
    expect(removeRecipient(["a@x.com", "b@x.com", "c@x.com"], "B@x.com")).toEqual([
      "a@x.com",
      "c@x.com",
    ]);
  });
});
