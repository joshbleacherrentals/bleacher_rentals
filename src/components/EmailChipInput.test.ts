import { describe, it, expect } from "vitest";
import {
  chipKeyAction,
  commitDraft,
  filterSuggestions,
  isInsideNameOrAngle,
  pickSuggestion,
  removeChip,
  removeLastChip,
  type ContactSuggestion,
} from "./EmailChipInput.logic";

const empty = { to: [], cc: [], bcc: [] };
const contacts: ContactSuggestion[] = [
  { id: "1", name: "Jane Doe", email: "jane@acme.com" },
  { id: "2", name: "John Smith", email: "john@beta.org" },
  { id: "3", name: "No Email", email: "" },
  { id: "4", name: "Janet Duplicate", email: "JANE@acme.com" },
];

describe("filterSuggestions", () => {
  it("matches by name or email, case-insensitively, and suggests nothing for an empty query", () => {
    expect(filterSuggestions(contacts, "", empty)).toEqual([]);
    expect(filterSuggestions(contacts, "SMITH", empty).map((c) => c.id)).toEqual(["2"]);
    expect(filterSuggestions(contacts, "beta", empty).map((c) => c.id)).toEqual(["2"]);
  });

  it("skips contacts without an email and repeated addresses", () => {
    expect(filterSuggestions(contacts, "jan", empty).map((c) => c.id)).toEqual(["1"]);
  });

  it("leaves out addresses already in any of To, Cc, Bcc", () => {
    expect(filterSuggestions(contacts, "jane", { to: [], cc: [], bcc: ["jane@acme.com"] })).toEqual(
      [],
    );
  });

  it("caps the list", () => {
    const many = Array.from({ length: 20 }, (_, i) => ({
      id: String(i),
      name: `Person ${i}`,
      email: `p${i}@x.com`,
    }));
    expect(filterSuggestions(many, "person", empty)).toHaveLength(6);
  });
});

describe("commitDraft", () => {
  it("turns a typed address into a chip", () => {
    const r = commitDraft(empty, "cc", " a@x.com ");
    expect(r).toEqual({ fields: { to: [], cc: ["a@x.com"], bcc: [] }, remaining: "", error: null });
  });

  it("turns a paste of several addresses into several chips", () => {
    const r = commitDraft(empty, "to", "a@x.com, b@x.com; c@x.com d@x.com");
    expect(r.fields.to).toEqual(["a@x.com", "b@x.com", "c@x.com", "d@x.com"]);
    expect(r.error).toBeNull();
  });

  it("refuses an invalid address, keeps it in the box and says so", () => {
    const r = commitDraft(empty, "to", "nope");
    expect(r.fields).toEqual(empty);
    expect(r.remaining).toBe("nope");
    expect(r.error).toMatch(/not a valid email/);
  });

  it("refuses an address already in another field and says where", () => {
    const r = commitDraft({ to: ["a@x.com"], cc: [], bcc: [] }, "bcc", "A@x.com");
    expect(r.fields.bcc).toEqual([]);
    expect(r.error).toMatch(/already in To/);
  });

  it("keeps the good ones of a mixed paste and leaves only the refused ones", () => {
    const r = commitDraft(empty, "to", "a@x.com, bad, b@x.com");
    expect(r.fields.to).toEqual(["a@x.com", "b@x.com"]);
    expect(r.remaining).toBe("bad");
  });

  it("takes the address inside <> from `Name <a@b.com>` and from a quoted name with a comma", () => {
    const r = commitDraft(empty, "to", 'Jane Doe <jane@x.com>, "Smith, John" <j@x.com>');
    expect(r.fields.to).toEqual(["jane@x.com", "j@x.com"]);
    expect(r.error).toBeNull();
    expect(r.remaining).toBe("");
  });

  it("works the same for a suggested contact's address as for a typed one", () => {
    expect(commitDraft(empty, "to", contacts[0].email).fields.to).toEqual(["jane@acme.com"]);
  });
});

describe("removing chips", () => {
  const f = { to: ["a@x.com", "b@x.com"], cc: ["c@x.com"], bcc: [] };
  it("removes one chip, case-insensitively, from its own field only", () => {
    expect(removeChip(f, "to", "A@X.com").to).toEqual(["b@x.com"]);
    expect(removeChip(f, "to", "c@x.com").cc).toEqual(["c@x.com"]);
  });
  it("removes the last chip", () => {
    expect(removeLastChip(f, "to").to).toEqual(["a@x.com"]);
    expect(removeLastChip(f, "bcc").bcc).toEqual([]);
  });
});

describe("chipKeyAction", () => {
  const s = (over: Partial<Parameters<typeof chipKeyAction>[1]> = {}) => ({
    draft: "",
    hasHighlight: false,
    listOpen: false,
    ...over,
  });
  it("commits on Enter and comma only when there is text", () => {
    expect(chipKeyAction("Enter", s({ draft: "a@x.com" }))).toBe("commit");
    expect(chipKeyAction(",", s({ draft: "a@x.com" }))).toBe("commit");
    expect(chipKeyAction("Enter", s())).toBeNull();
    expect(chipKeyAction(",", s())).toBeNull();
  });
  it("picks the highlighted suggestion on Enter", () => {
    expect(chipKeyAction("Enter", s({ draft: "ja", hasHighlight: true, listOpen: true }))).toBe(
      "pick",
    );
  });
  it("Backspace removes the last chip only when the box is empty", () => {
    expect(chipKeyAction("Backspace", s())).toBe("removeLast");
    expect(chipKeyAction("Backspace", s({ draft: "a" }))).toBeNull();
  });
  it("arrows and Escape act only while the suggestion list is open", () => {
    expect(chipKeyAction("ArrowDown", s({ listOpen: true }))).toBe("next");
    expect(chipKeyAction("ArrowUp", s({ listOpen: true }))).toBe("prev");
    expect(chipKeyAction("Escape", s({ listOpen: true }))).toBe("close");
    expect(chipKeyAction("ArrowDown", s())).toBeNull();
  });
});

describe("pickSuggestion", () => {
  it("adds a valid suggestion and clears the box", () => {
    const r = pickSuggestion(empty, "to", "jane@acme.com", "ja");
    expect(r).toEqual({
      fields: { to: ["jane@acme.com"], cc: [], bcc: [] },
      remaining: "",
      error: null,
    });
  });

  it("keeps the typed text and shows the error when the stored email is malformed", () => {
    const r = pickSuggestion(empty, "to", "not-an-email", "ja");
    expect(r.fields).toEqual(empty);
    expect(r.remaining).toBe("ja");
    expect(r.error).toMatch(/not a valid email/);
  });

  it("validates the whole stored string, never a space-separated piece of it", () => {
    for (const stored of ["a b@c.com", "x@y.com z"]) {
      const r = pickSuggestion(empty, "to", stored, "ja");
      expect(r.fields, stored).toEqual(empty);
      expect(r.remaining).toBe("ja");
      expect(r.error).toBeTruthy();
    }
  });
});

describe("a comma inside a name or <address", () => {
  it("detects an open quote or angle bracket", () => {
    expect(isInsideNameOrAngle('"Smith')).toBe(true);
    expect(isInsideNameOrAngle("Jane <jane@x")).toBe(true);
    expect(isInsideNameOrAngle('"Smith, John" <j@x.com>')).toBe(false);
    expect(isInsideNameOrAngle("a@x.com")).toBe(false);
  });

  it("is not committed by the comma key while inside, but is once closed", () => {
    const s = { hasHighlight: false, listOpen: false };
    expect(chipKeyAction(",", { ...s, draft: '"Smith' })).toBeNull();
    expect(chipKeyAction(",", { ...s, draft: '"Smith, John" <j@x.com>' })).toBe("commit");
  });
});
