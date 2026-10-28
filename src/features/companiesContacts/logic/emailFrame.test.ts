import { describe, expect, it } from "vitest";
import { buildEmailFrameDocument, EMAIL_FRAME_SANDBOX } from "./emailFrame";

describe("buildEmailFrameDocument", () => {
  const doc = buildEmailFrameDocument("<p>Hello</p>");

  it("wraps the email's HTML in a document with a policy that blocks everything remote", () => {
    expect(doc).toContain("<p>Hello</p>");
    expect(doc).toContain('http-equiv="Content-Security-Policy"');
    expect(doc).toContain("default-src 'none'");
    expect(doc).toContain("img-src data:");
    expect(doc).not.toMatch(/img-src[^"]*https?:/);
  });

  it("opens links in a new tab", () => {
    expect(doc).toContain('<base target="_blank">');
  });

  it("puts the policy before the email's own markup", () => {
    expect(doc.indexOf("Content-Security-Policy")).toBeLessThan(doc.indexOf("<p>Hello</p>"));
  });

  it("drops a meta refresh, which would send the frame to a remote page", () => {
    const out = buildEmailFrameDocument(
      '<meta http-equiv="refresh" content="0; url=https://evil.example"><p>x</p><META HTTP-EQUIV=Refresh CONTENT="1">',
    );

    expect(out).not.toMatch(/refresh/i);
    expect(out).toContain("<p>x</p>");
  });
});

describe("EMAIL_FRAME_SANDBOX", () => {
  it("allows links to open and nothing else: no scripts, no same-origin access", () => {
    expect(EMAIL_FRAME_SANDBOX.split(" ").sort()).toEqual([
      "allow-popups",
      "allow-popups-to-escape-sandbox",
    ]);
  });
});
