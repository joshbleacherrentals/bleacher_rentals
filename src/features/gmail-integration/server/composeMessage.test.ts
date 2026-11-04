import { describe, expect, it } from "vitest";
import { buildRawMessage, type OutgoingEmail } from "./composeMessage";

const email = (over: Partial<OutgoingEmail> = {}): OutgoingEmail => ({
  from: { name: "Josh Redgrift", address: "josh@co.com" },
  to: ["pat@xyz.com"],
  cc: [],
  bcc: [],
  subject: "Re: Quote",
  text: "Sounds good.\nSee you Friday.",
  inReplyTo: null,
  references: null,
  ...over,
});

/** The message as Gmail will read it: its header lines, and its body decoded. */
function read(raw: string) {
  const message = Buffer.from(raw, "base64url").toString("utf8");
  const [head, body = ""] = message.split("\r\n\r\n");
  const headers = new Map<string, string>();
  let last = "";
  for (const line of head.split("\r\n")) {
    if (/^[ \t]/.test(line)) {
      headers.set(last, headers.get(last) + line); // a folded header carries on
      continue;
    }
    const colon = line.indexOf(":");
    last = line.slice(0, colon);
    headers.set(last, line.slice(colon + 1).trim());
  }
  const text = Buffer.from(body.replace(/\r\n/g, ""), "base64").toString("utf8");
  return { message, head, body, headers, text };
}

describe("buildRawMessage", () => {
  it("is base64url, as the Gmail API wants it", () => {
    expect(buildRawMessage(email({ text: "???>>>~~~" }))).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it("writes the sender, recipients, subject and the headers that make it plain UTF-8 text", () => {
    const { headers, head } = read(
      buildRawMessage(email({ cc: ["sam@xyz.com", "kim@xyz.com"], bcc: ["boss@co.com"] })),
    );

    expect(headers.get("From")).toBe('"Josh Redgrift" <josh@co.com>');
    expect(headers.get("To")).toBe("pat@xyz.com");
    expect(headers.get("Cc")).toBe("sam@xyz.com, kim@xyz.com");
    expect(headers.get("Bcc")).toBe("boss@co.com");
    expect(headers.get("Subject")).toBe("Re: Quote");
    expect(headers.get("MIME-Version")).toBe("1.0");
    expect(headers.get("Content-Type")).toBe('text/plain; charset="UTF-8"');
    expect(headers.get("Content-Transfer-Encoding")).toBe("base64");
    expect(head).not.toMatch(/[^\r]\n/); // every line break is CRLF
  });

  it("leaves out Cc, Bcc and the reply headers when there are none, and a name when there is none", () => {
    const { headers } = read(
      buildRawMessage(email({ from: { name: null, address: "josh@co.com" } })),
    );

    expect(headers.get("From")).toBe("josh@co.com");
    expect(headers.has("Cc")).toBe(false);
    expect(headers.has("Bcc")).toBe(false);
    expect(headers.has("In-Reply-To")).toBe(false);
    expect(headers.has("References")).toBe(false);
  });

  it("carries the reply headers so the reply is threaded", () => {
    const { headers } = read(
      buildRawMessage(email({ inReplyTo: "<b@x>", references: "<a@x> <b@x>" })),
    );

    expect(headers.get("In-Reply-To")).toBe("<b@x>");
    expect(headers.get("References")).toBe("<a@x> <b@x>");
  });

  it("sends the text with CRLF line breaks, in base64 lines no longer than 76 characters", () => {
    const long = "word ".repeat(400);
    const { body, text } = read(buildRawMessage(email({ text: `${long}\nsecond line` })));

    expect(text).toBe(`${long}\r\nsecond line`);
    expect(Math.max(...body.split("\r\n").map((line) => line.length))).toBeLessThanOrEqual(76);
  });

  it("keeps accents, emoji and other languages in the text", () => {
    const { text } = read(buildRawMessage(email({ text: "Merci beaucoup, à bientôt 👍 你好" })));

    expect(text).toBe("Merci beaucoup, à bientôt 👍 你好");
  });

  it("encodes a subject or name that is not plain ASCII, in words of 75 characters or fewer", () => {
    const subject = "Re: Réunion à l'équipe — résumé de la soumission pour le stade 👍 "
      .repeat(3)
      .trim(); // the builder trims the ends of a subject
    const { head, headers } = read(
      buildRawMessage(email({ subject, from: { name: "Zoë Müller", address: "z@co.com" } })),
    );

    const subjectWords = head.match(/=\?UTF-8\?B\?[A-Za-z0-9+/=]+\?=/g) ?? [];
    expect(subjectWords.length).toBeGreaterThan(2);
    expect(subjectWords.every((word) => word.length <= 75)).toBe(true);
    expect(head).toContain("=?UTF-8?B?"); // the name is encoded too

    const decoded = headers
      .get("Subject")!
      .match(/=\?UTF-8\?B\?([A-Za-z0-9+/=]+)\?=/g)!
      .map((word) => Buffer.from(word.slice(10, -2), "base64").toString("utf8"))
      .join("");
    expect(decoded).toBe(subject);
  });

  it("turns a line break in the subject into a space, so a header cannot be added through it", () => {
    const { headers, head } = read(buildRawMessage(email({ subject: "Hi\r\nBcc: evil@x.com" })));

    expect(headers.get("Subject")).toBe("Hi Bcc: evil@x.com");
    expect(head.split("\r\n").filter((line) => line.startsWith("Bcc:"))).toHaveLength(0);
  });

  it("refuses an address that could add a header or another recipient", () => {
    for (const bad of [
      "a@x.com\r\nBcc: evil@x.com",
      "a@x.com,b@x.com",
      "a b@x.com",
      "<a@x.com>",
      "",
    ]) {
      expect(() => buildRawMessage(email({ to: [bad] })), bad).toThrow(/address/i);
      expect(() => buildRawMessage(email({ cc: [bad] })), bad).toThrow(/address/i);
      expect(() => buildRawMessage(email({ bcc: [bad] })), bad).toThrow(/address/i);
    }
    expect(() =>
      buildRawMessage(email({ from: { name: null, address: "a@x.com\nBcc: e@x.com" } })),
    ).toThrow(/address/i);
  });

  it("cleans a name of quotes and line breaks rather than letting them break the From line", () => {
    const { headers } = read(
      buildRawMessage(
        email({ from: { name: 'Jo "The Boss"\r\nBcc: e@x.com', address: "jo@co.com" } }),
      ),
    );

    expect(headers.get("From")).toBe('"Jo The Boss Bcc: e@x.com" <jo@co.com>');
  });

  it("ignores a reply header that is not a list of IDs in angle brackets", () => {
    const { headers } = read(
      buildRawMessage(email({ inReplyTo: "not an id\r\nBcc: e@x.com", references: "junk" })),
    );

    expect(headers.has("In-Reply-To")).toBe(false);
    expect(headers.has("References")).toBe(false);
    expect(headers.has("Bcc")).toBe(false);
  });
});
