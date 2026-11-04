import { describe, expect, it } from "vitest";
import { MAX_RECIPIENTS, MAX_TEXT_LENGTH, parseSendRequest } from "./sendRequest";

const ID = "9b2f6c1e-3d4a-4f5b-8c7d-1e2f3a4b5c6d";

const valid = {
  emailMessageUuid: ID,
  to: ["Pat@XYZ.com"],
  cc: ["sam@xyz.com"],
  bcc: [],
  subject: "Re: Quote",
  text: "Sounds good.",
  inReplyTo: "<b@x>",
  references: "<a@x> <b@x>",
  thread: { mailbox: "Josh@Co.com", threadId: "19abc123def" },
};

// Most tests are about something else, so they are given a valid id unless they bring their own.
const withId = (body: unknown) =>
  typeof body === "object" && body !== null && !Array.isArray(body) && !("emailMessageUuid" in body)
    ? { emailMessageUuid: ID, ...body }
    : body;

const ok = (body: unknown) => {
  const result = parseSendRequest(withId(body));
  if (!result.ok) throw new Error(`expected ok, got: ${result.error}`);
  return result.value;
};
const error = (body: unknown) => {
  const result = parseSendRequest(withId(body));
  if (result.ok) throw new Error("expected an error");
  return result.error;
};

describe("parseSendRequest", () => {
  it("accepts a whole request and returns it with addresses in lower case", () => {
    expect(ok(valid)).toEqual({
      emailMessageUuid: ID,
      to: ["pat@xyz.com"],
      cc: ["sam@xyz.com"],
      bcc: [],
      subject: "Re: Quote",
      text: "Sounds good.",
      inReplyTo: "<b@x>",
      references: "<a@x> <b@x>",
      thread: { mailbox: "josh@co.com", threadId: "19abc123def" },
    });
  });

  it("needs the id of the saved email, a UUID, which it returns in lower case", () => {
    const rest = { to: ["a@x.com"], subject: "Hi", text: "Hello" };

    for (const emailMessageUuid of [undefined, null, "", "nope", 42, `${ID}0`]) {
      const result = parseSendRequest({ ...rest, emailMessageUuid });
      expect(result.ok, String(emailMessageUuid)).toBe(false);
      if (!result.ok) expect(result.error).toMatch(/email to send/i);
    }
    expect(ok({ ...rest, emailMessageUuid: ID.toUpperCase() }).emailMessageUuid).toBe(ID);
  });

  it("makes Cc, Bcc and the reply details optional", () => {
    expect(ok({ to: ["a@x.com"], subject: "Hi", text: "Hello" })).toEqual({
      emailMessageUuid: ID,
      to: ["a@x.com"],
      cc: [],
      bcc: [],
      subject: "Hi",
      text: "Hello",
      inReplyTo: null,
      references: null,
      thread: null,
    });
  });

  it("accepts a request with only a Cc or only a Bcc, but not with nobody to send to", () => {
    expect(ok({ to: [], cc: ["a@x.com"], subject: "Hi", text: "Hello" }).cc).toEqual(["a@x.com"]);
    expect(ok({ bcc: ["a@x.com"], subject: "Hi", text: "Hello" }).bcc).toEqual(["a@x.com"]);
    expect(error({ to: [], cc: [], bcc: [], subject: "Hi", text: "Hello" })).toMatch(/recipient/i);
  });

  it("rejects anything that is not an object", () => {
    for (const body of [null, undefined, "x", 4, []]) {
      expect(error(body), String(body)).toMatch(/request/i);
    }
  });

  it("rejects an address that is not a plain email address, naming it", () => {
    expect(error({ ...valid, to: ["pat@xyz.com", "not-an-email"] })).toContain("not-an-email");
    expect(error({ ...valid, cc: ["Pat <pat@xyz.com>"] })).toContain("Pat <pat@xyz.com>");
    expect(error({ ...valid, to: "pat@xyz.com" })).toMatch(/list/i);
    expect(error({ ...valid, bcc: [4] })).toMatch(/address/i);
  });

  it("lists an address once per list", () => {
    expect(ok({ ...valid, to: ["a@x.com", "A@X.com", "b@x.com"] }).to).toEqual([
      "a@x.com",
      "b@x.com",
    ]);
  });

  it("caps the number of recipients", () => {
    const many = Array.from({ length: MAX_RECIPIENTS + 1 }, (_, i) => `p${i}@x.com`);

    expect(error({ ...valid, to: many, cc: [], bcc: [] })).toMatch(/too many/i);
    expect(ok({ ...valid, to: many.slice(0, MAX_RECIPIENTS), cc: [], bcc: [] }).to).toHaveLength(
      MAX_RECIPIENTS,
    );
  });

  it("needs text, within a limit", () => {
    expect(error({ ...valid, text: "   \n " })).toMatch(/message/i);
    expect(error({ ...valid, text: 5 })).toMatch(/message/i);
    expect(error({ ...valid, text: "x".repeat(MAX_TEXT_LENGTH + 1) })).toMatch(/too long/i);
  });

  it("needs a subject, with any line break turned into a space", () => {
    expect(error({ ...valid, subject: 4 })).toMatch(/subject/i);
    expect(ok({ ...valid, subject: "Hi\r\nBcc: e@x.com" }).subject).toBe("Hi Bcc: e@x.com");
    expect(error({ ...valid, subject: "x".repeat(501) })).toMatch(/subject/i);
  });

  it("keeps only the Message-IDs of the reply headers, in their own case", () => {
    const value = ok({
      ...valid,
      inReplyTo: "junk <CAB+Xy@mail.gmail.com> more <b@x>",
      references: "<A@x>\r\n <b@x> not-an-id",
    });

    expect(value.inReplyTo).toBe("<CAB+Xy@mail.gmail.com>");
    expect(value.references).toBe("<A@x> <b@x>");
    expect(ok({ ...valid, inReplyTo: "no id here", references: 7 }).inReplyTo).toBeNull();
    expect(ok({ ...valid, inReplyTo: "no id here", references: 7 }).references).toBeNull();
  });

  it("drops a thread that is not a mailbox and a Gmail thread id", () => {
    expect(ok({ ...valid, thread: { mailbox: "nope", threadId: "19abc" } }).thread).toBeNull();
    expect(ok({ ...valid, thread: { mailbox: "a@x.com", threadId: "bad id!" } }).thread).toBeNull();
    expect(ok({ ...valid, thread: "x" }).thread).toBeNull();
  });
});
