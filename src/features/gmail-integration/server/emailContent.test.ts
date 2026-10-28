import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const getDelegatedAccessToken = vi.fn();
vi.mock("./delegatedAuth", () => ({
  GMAIL_READONLY_SCOPE: "readonly-scope",
  getDelegatedAccessToken: (args: unknown) => getDelegatedAccessToken(args),
}));

const getFullMessage = vi.fn();
const getAttachmentData = vi.fn();
vi.mock("./gmailMessages", () => ({
  getFullMessage: (...args: unknown[]) => getFullMessage(...args),
  getAttachmentData: (...args: unknown[]) => getAttachmentData(...args),
}));

import {
  decodeBody,
  extractEmailContent,
  getEmailContent,
  neededBodyAttachmentIds,
} from "./emailContent";

const b64 = (text: string, encoding: BufferEncoding = "utf8") =>
  Buffer.from(text, encoding).toString("base64url");

const headers = (h: Record<string, string>) =>
  Object.entries(h).map(([name, value]) => ({ name, value }));

const base = { id: "1a15f4cb7cfdac1e", threadId: "1a15f463153e30f2" };

describe("decodeBody", () => {
  it("decodes base64url as UTF-8 by default", () => {
    expect(decodeBody(b64("Café ☕ — hi"), "utf-8")).toBe("Café ☕ — hi");
  });

  it("decodes the charset the email declared", () => {
    expect(decodeBody(b64("café", "latin1"), "iso-8859-1")).toBe("café");
  });

  it("falls back to UTF-8 for a charset name it does not know", () => {
    expect(decodeBody(b64("plain"), "x-not-a-charset")).toBe("plain");
  });
});

describe("extractEmailContent", () => {
  it("reads the headers and both versions of a multipart/alternative body", () => {
    const out = extractEmailContent({
      ...base,
      internalDate: "1792600225000",
      labelIds: ["SENT"],
      payload: {
        mimeType: "multipart/alternative",
        headers: headers({
          Subject: "Quote",
          From: "Pat <pat@xyz.com>",
          To: "me@co.com",
          Cc: "boss@co.com",
          Date: "Wed, 21 Oct 2026 12:30:25 -0400",
          "Message-ID": "<abc@mail.gmail.com>",
          "In-Reply-To": "<prev@mail.gmail.com>",
          References: "<first@x> <prev@mail.gmail.com>",
          "Reply-To": "sales@xyz.com",
        }),
        parts: [
          { mimeType: "text/plain", body: { size: 5, data: b64("Hello") } },
          { mimeType: "text/html", body: { size: 12, data: b64("<p>Hello</p>") } },
        ],
      },
    });

    expect(out).toMatchObject({
      id: base.id,
      threadId: base.threadId,
      internalDate: 1792600225000,
      labelIds: ["SENT"],
      text: "Hello",
      html: "<p>Hello</p>",
      attachments: [],
      headers: {
        subject: "Quote",
        from: "Pat <pat@xyz.com>",
        to: "me@co.com",
        cc: "boss@co.com",
        bcc: null,
        replyTo: "sales@xyz.com",
        date: "Wed, 21 Oct 2026 12:30:25 -0400",
        messageId: "<abc@mail.gmail.com>",
        inReplyTo: "<prev@mail.gmail.com>",
        references: "<first@x> <prev@mail.gmail.com>",
      },
    });
  });

  it("reads a single-part message", () => {
    const out = extractEmailContent({
      ...base,
      payload: { mimeType: "text/plain", body: { data: b64("Just text") } },
    });

    expect(out.text).toBe("Just text");
    expect(out.html).toBeNull();
  });

  it("lists attachments without including their bytes, and tells inline images apart", () => {
    const out = extractEmailContent({
      ...base,
      payload: {
        mimeType: "multipart/mixed",
        parts: [
          {
            mimeType: "multipart/alternative",
            parts: [
              { mimeType: "text/plain", body: { data: b64("See attached") } },
              { mimeType: "text/html", body: { data: b64('<img src="cid:logo">') } },
            ],
          },
          {
            mimeType: "application/pdf",
            filename: "Quote 123.pdf",
            body: { size: 48210, attachmentId: "ATT-1" },
          },
          {
            mimeType: "image/png",
            filename: "logo.png",
            headers: headers({ "Content-ID": "<logo>", "Content-Disposition": "inline" }),
            body: { size: 900, attachmentId: "ATT-2" },
          },
        ],
      },
    });

    expect(out.text).toBe("See attached");
    expect(out.attachments).toEqual([
      {
        filename: "Quote 123.pdf",
        mimeType: "application/pdf",
        size: 48210,
        attachmentId: "ATT-1",
        inline: false,
        contentId: null,
      },
      {
        filename: "logo.png",
        mimeType: "image/png",
        size: 900,
        attachmentId: "ATT-2",
        inline: true,
        contentId: "logo",
      },
    ]);
  });

  it("treats a forwarded email as an attachment instead of reading into it", () => {
    const out = extractEmailContent({
      ...base,
      payload: {
        mimeType: "multipart/mixed",
        parts: [
          { mimeType: "text/plain", body: { data: b64("FYI") } },
          {
            mimeType: "message/rfc822",
            filename: "Original.eml",
            body: { size: 3000, attachmentId: "ATT-9" },
            parts: [{ mimeType: "text/plain", body: { data: b64("the forwarded body") } }],
          },
        ],
      },
    });

    expect(out.text).toBe("FYI");
    expect(out.attachments.map((a) => a.filename)).toEqual(["Original.eml"]);
  });

  it("joins several text parts in order", () => {
    const out = extractEmailContent({
      ...base,
      payload: {
        mimeType: "multipart/mixed",
        parts: [
          { mimeType: "text/plain", body: { data: b64("first") } },
          { mimeType: "text/plain", body: { data: b64("second") } },
        ],
      },
    });

    expect(out.text).toBe("first\n\nsecond");
  });

  it("reads a body in the charset its Content-Type declares", () => {
    const out = extractEmailContent({
      ...base,
      payload: {
        mimeType: "text/plain",
        headers: headers({ "Content-Type": 'text/plain; charset="ISO-8859-1"' }),
        body: { data: b64("café", "latin1") },
      },
    });

    expect(out.text).toBe("café");
  });

  it("returns no body for a message that has none", () => {
    const out = extractEmailContent({
      ...base,
      payload: { mimeType: "multipart/mixed", parts: [] },
    });

    expect(out).toMatchObject({ text: null, html: null, attachments: [] });
  });

  it("uses fetched data for a body part that was too big to come inline", () => {
    const message = {
      ...base,
      payload: {
        mimeType: "multipart/alternative",
        parts: [
          { mimeType: "text/plain", body: { size: 9_000_000, attachmentId: "BIG-1" } },
          { mimeType: "text/html", body: { data: b64("<p>small</p>") } },
        ],
      },
    };

    expect(neededBodyAttachmentIds(message)).toEqual(["BIG-1"]);
    expect(extractEmailContent(message).text).toBeNull();
    expect(extractEmailContent(message, new Map([["BIG-1", b64("a very long body")]])).text).toBe(
      "a very long body",
    );
  });
});

describe("getEmailContent", () => {
  beforeEach(() => {
    getDelegatedAccessToken.mockReset().mockResolvedValue("ya29.token");
    getFullMessage.mockReset();
    getAttachmentData.mockReset();
  });

  it("reads the email as that mailbox and returns the parsed content", async () => {
    getFullMessage.mockResolvedValue({
      ...base,
      payload: { mimeType: "text/plain", body: { data: b64("Hi") } },
    });

    const out = await getEmailContent({ mailbox: "paul@co.com", id: base.id });

    expect(getDelegatedAccessToken).toHaveBeenCalledWith({
      subject: "paul@co.com",
      scopes: ["readonly-scope"],
    });
    expect(getFullMessage).toHaveBeenCalledWith("ya29.token", base.id);
    expect(out.text).toBe("Hi");
    expect(getAttachmentData).not.toHaveBeenCalled();
  });

  it("fetches a body part that did not come inline", async () => {
    getFullMessage.mockResolvedValue({
      ...base,
      payload: {
        mimeType: "text/plain",
        body: { size: 9_000_000, attachmentId: "BIG-1" },
      },
    });
    getAttachmentData.mockResolvedValue(b64("long body"));

    const out = await getEmailContent({ mailbox: "paul@co.com", id: base.id });

    expect(getAttachmentData).toHaveBeenCalledWith("ya29.token", base.id, "BIG-1");
    expect(out.text).toBe("long body");
  });
});
