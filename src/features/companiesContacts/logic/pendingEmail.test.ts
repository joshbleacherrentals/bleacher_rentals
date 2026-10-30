import { describe, expect, it } from "vitest";
import {
  buildPendingEmail,
  fromHeader,
  pendingSnippet,
  type PendingEmailInput,
} from "./pendingEmail";

const input: PendingEmailInput = {
  ids: { message: "m-1", link: "l-1", details: "d-1" },
  now: "2026-10-29T15:00:00.000Z",
  contactUuid: "contact-1",
  sender: { address: "Josh@BleacherRentals.com", name: "Josh Redgrift" },
  to: ["pat@xyz.com", "alex@xyz.com"],
  cc: ["sam@xyz.com"],
  subject: "Re: Quote",
  text: "Sounds good.\n\nTalk soon,\nJosh",
  inReplyTo: "<b@x>",
  references: "<a@x> <b@x>",
};

describe("fromHeader", () => {
  it("quotes the name the way Gmail returns an email we send", () => {
    expect(fromHeader({ name: "Josh Redgrift", address: "josh@bleacherrentals.com" })).toBe(
      '"Josh Redgrift" <josh@bleacherrentals.com>',
    );
  });

  it("escapes quotes and backslashes in a name", () => {
    expect(fromHeader({ name: 'Jo "JJ" \\ Lee', address: "jo@x.com" })).toBe(
      '"Jo \\"JJ\\" \\\\ Lee" <jo@x.com>',
    );
  });

  it("is just the address when there is no name", () => {
    expect(fromHeader({ name: null, address: "josh@x.com" })).toBe("josh@x.com");
    expect(fromHeader({ name: "  ", address: "josh@x.com" })).toBe("josh@x.com");
  });
});

describe("pendingSnippet", () => {
  it("puts the text on one line", () => {
    expect(pendingSnippet("Sounds good.\n\nTalk   soon,\nJosh")).toBe(
      "Sounds good. Talk soon, Josh",
    );
  });

  it("keeps the start of a long text", () => {
    const snippet = pendingSnippet("word ".repeat(100));
    expect(snippet.length).toBeLessThanOrEqual(100);
    expect(snippet.startsWith("word word")).toBe(true);
  });
});

describe("buildPendingEmail", () => {
  const { message, link, details } = buildPendingEmail(input);

  it("makes an email being sent, from the sender, in the sender's own mailbox", () => {
    expect(message).toMatchObject({
      id: "m-1",
      created_at: "2026-10-29T15:00:00.000Z",
      mailbox: "josh@bleacherrentals.com",
      direction: "sent",
      status: "sending",
      error_text: null,
      from_address: '"Josh Redgrift" <josh@bleacherrentals.com>',
    });
  });

  it("leaves what only Gmail can say empty", () => {
    expect(message.google_id).toBeNull();
    expect(message.google_thread_id).toBeNull();
    expect(message.google_message_id).toBeNull();
  });

  it("fills in what the writer knows, including what threads it under the email it answers", () => {
    expect(message).toMatchObject({
      to_addresses: "pat@xyz.com, alex@xyz.com",
      cc_addresses: "sam@xyz.com",
      subject: "Re: Quote",
      date: "2026-10-29T15:00:00.000Z",
      snippet: "Sounds good. Talk soon, Josh",
      google_in_reply_to: "<b@x>",
      google_references: "<a@x> <b@x>",
    });
  });

  it("saves no empty address lists", () => {
    const only = buildPendingEmail({ ...input, to: [], cc: [] }).message;
    expect(only.to_addresses).toBeNull();
    expect(only.cc_addresses).toBeNull();
  });

  it("links the contact to the email, and saves the typed text as its body", () => {
    expect(link).toEqual({
      id: "l-1",
      created_at: "2026-10-29T15:00:00.000Z",
      contact_uuid: "contact-1",
      email_message_uuid: "m-1",
    });
    expect(details).toEqual({
      id: "d-1",
      created_at: "2026-10-29T15:00:00.000Z",
      email_message_uuid: "m-1",
      body_text: "Sounds good.\n\nTalk soon,\nJosh",
      body_html: null,
    });
  });

  it("saves a new email, one that answers nothing, with no thread headers", () => {
    const { message } = buildPendingEmail({
      ...input,
      subject: "Your quote",
      inReplyTo: null,
      references: null,
    });

    expect(message.subject).toBe("Your quote");
    expect(message.google_in_reply_to).toBeNull();
    expect(message.google_references).toBeNull();
  });
});
