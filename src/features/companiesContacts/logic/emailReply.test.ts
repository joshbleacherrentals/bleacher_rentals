import { describe, expect, it } from "vitest";
import { forwardSubject, replyReferences, replySubject } from "./emailReply";

describe("replySubject", () => {
  it("puts Re: in front of a subject that does not have it", () => {
    expect(replySubject("Quote")).toBe("Re: Quote");
    expect(replySubject("  Quote  ")).toBe("Re: Quote");
    expect(replySubject("Fwd: Quote")).toBe("Re: Fwd: Quote");
  });

  it("leaves a subject that already starts with Re: alone, whatever its case", () => {
    expect(replySubject("Re: Quote")).toBe("Re: Quote");
    expect(replySubject("RE: Quote")).toBe("RE: Quote");
    expect(replySubject("re:Quote")).toBe("re:Quote");
  });

  it("is just Re: for an email with no subject", () => {
    expect(replySubject("")).toBe("Re:");
    expect(replySubject("   ")).toBe("Re:");
  });
});

describe("replyReferences", () => {
  it("lists the thread so far and then the email being answered", () => {
    expect(replyReferences({ messageId: "<b@x>", references: "<a@x>" })).toBe("<a@x> <b@x>");
    expect(replyReferences({ messageId: "<b@x>", references: null })).toBe("<b@x>");
  });

  it("keeps the case of the IDs, since a mail program matches them exactly", () => {
    expect(replyReferences({ messageId: "<CAB+Xy@mail.gmail.com>", references: "<Zq@x>" })).toBe(
      "<Zq@x> <CAB+Xy@mail.gmail.com>",
    );
  });

  it("lists an ID once, and reads a header that has line breaks", () => {
    expect(replyReferences({ messageId: "<b@x>", references: "<a@x>\r\n <b@x>" })).toBe(
      "<a@x> <b@x>",
    );
  });

  it("is null when there is nothing to refer to", () => {
    expect(replyReferences({ messageId: null, references: null })).toBeNull();
    expect(replyReferences({ messageId: "", references: "  " })).toBeNull();
  });

  it("keeps the first ID and the most recent ones when the chain is very long", () => {
    const ids = Array.from({ length: 40 }, (_, i) => `<m${i}@x>`);
    const result = replyReferences({ messageId: "<last@x>", references: ids.join(" ") })!;
    const listed = result.split(" ");

    expect(listed).toHaveLength(30);
    expect(listed[0]).toBe("<m0@x>");
    expect(listed[listed.length - 1]).toBe("<last@x>");
  });
});

describe("forwardSubject", () => {
  it("puts Fwd: in front of a subject that does not have it", () => {
    expect(forwardSubject("Quote")).toBe("Fwd: Quote");
    expect(forwardSubject("  Quote  ")).toBe("Fwd: Quote");
    expect(forwardSubject("Re: Quote")).toBe("Fwd: Re: Quote");
  });

  it("leaves a subject that already starts with Fwd: or Fw: alone, whatever its case", () => {
    expect(forwardSubject("Fwd: Quote")).toBe("Fwd: Quote");
    expect(forwardSubject("FWD: Quote")).toBe("FWD: Quote");
    expect(forwardSubject("Fw: Quote")).toBe("Fw: Quote");
    expect(forwardSubject("fwd:Quote")).toBe("fwd:Quote");
  });

  it("is just Fwd: for an email with no subject", () => {
    expect(forwardSubject("")).toBe("Fwd:");
    expect(forwardSubject("   ")).toBe("Fwd:");
  });
});
