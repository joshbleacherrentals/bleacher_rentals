import { describe, expect, it } from "vitest";
import {
  forwardableText,
  forwardedDate,
  forwardedMessageText,
  htmlToPlainText,
} from "./emailForward";

describe("htmlToPlainText", () => {
  it("turns blocks and breaks into lines and drops the tags", () => {
    expect(htmlToPlainText("<p>Hello <b>Pat</b>,</p><p>Sounds good.<br>Thanks</p>")).toBe(
      "Hello Pat,\nSounds good.\nThanks",
    );
  });

  it("drops styles, scripts and the head, with everything in them", () => {
    expect(
      htmlToPlainText(
        "<html><head><title>x</title><style>p{color:red}</style></head><body><script>alert(1)</script><p>Hi</p></body></html>",
      ),
    ).toBe("Hi");
  });

  it("turns entities back into characters", () => {
    expect(htmlToPlainText("<p>It&#39;s Smith &amp; Sons &lt;ok&gt;&nbsp;now</p>")).toBe(
      "It's Smith & Sons <ok> now",
    );
  });

  it("does not leave long runs of blank lines or trailing spaces", () => {
    expect(htmlToPlainText("<div>a</div>  \n\n\n\n<div>b</div>")).toBe("a\n\nb");
  });

  it("is empty for nothing", () => {
    expect(htmlToPlainText("")).toBe("");
  });
});

describe("forwardableText", () => {
  it("prefers the text version", () => {
    expect(forwardableText({ bodyText: "Hi", bodyHtml: "<p>Other</p>" })).toBe("Hi");
  });

  it("falls back to the HTML as text when the text version is missing or blank", () => {
    expect(forwardableText({ bodyText: null, bodyHtml: "<p>Hi</p>" })).toBe("Hi");
    expect(forwardableText({ bodyText: "  \n", bodyHtml: "<p>Hi</p>" })).toBe("Hi");
  });

  it("is empty for an email with no body", () => {
    expect(forwardableText({ bodyText: null, bodyHtml: null })).toBe("");
  });
});

describe("forwardedDate", () => {
  it("writes the date the way Gmail does a forwarded message", () => {
    expect(forwardedDate("2026-10-26T10:00:00.000Z", "UTC")).toBe("Mon, Oct 26, 2026 at 10:00 AM");
    expect(forwardedDate("2026-10-26T22:05:00.000Z", "UTC")).toBe("Mon, Oct 26, 2026 at 10:05 PM");
  });

  it("is null for a date that is not one", () => {
    expect(forwardedDate("not a date")).toBeNull();
  });
});

describe("forwardedMessageText", () => {
  const email = {
    from: "Pat Smith <pat@xyz.com>",
    date: "2026-10-26T10:00:00.000Z",
    subject: "Quote",
    to: "Josh <josh@co.com>",
    cc: "Sam <sam@xyz.com>",
    body: "Hello,\r\nCan you send the quote?\r\n",
  };

  it("opens with room for a note, then the forwarded message header and the text", () => {
    expect(forwardedMessageText(email, "UTC")).toBe(
      [
        "",
        "",
        "---------- Forwarded message ---------",
        "From: Pat Smith <pat@xyz.com>",
        "Date: Mon, Oct 26, 2026 at 10:00 AM",
        "Subject: Quote",
        "To: Josh <josh@co.com>",
        "Cc: Sam <sam@xyz.com>",
        "",
        "Hello,",
        "Can you send the quote?",
        "",
      ].join("\n"),
    );
  });

  it("leaves out the Cc and Date lines when there are none", () => {
    const text = forwardedMessageText({ ...email, cc: "", date: null }, "UTC");

    expect(text).not.toContain("Cc:");
    expect(text).not.toContain("Date:");
    expect(text).toContain("Subject: Quote");
  });

  it("uses the line endings a text box has, whatever the email had", () => {
    expect(forwardedMessageText(email, "UTC")).not.toContain("\r");
  });
});
