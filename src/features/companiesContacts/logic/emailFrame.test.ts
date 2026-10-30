import { describe, expect, it } from "vitest";
import {
  buildEmailFrameDocument,
  EMAIL_FRAME_HEIGHT_MESSAGE,
  EMAIL_FRAME_SANDBOX,
} from "./emailFrame";

describe("buildEmailFrameDocument", () => {
  const doc = buildEmailFrameDocument("<p>Hello</p>", "abc123");

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

  it("runs only a script that carries its nonce, and that script is the one that reports the height", () => {
    expect(doc).toContain("script-src 'nonce-abc123'");
    expect(doc).not.toContain("unsafe-eval");
    expect(doc.match(/<script/g)).toHaveLength(1);
    expect(doc).toContain(`<script nonce="abc123">`);
    expect(doc).toContain(EMAIL_FRAME_HEIGHT_MESSAGE);
  });

  it("puts the height script ahead of the email, so a broken email cannot swallow it", () => {
    const hostile = buildEmailFrameDocument("<!-- never closed <p>x</p>", "n");

    expect(hostile.indexOf("<script")).toBeLessThan(hostile.indexOf("never closed"));
  });

  it("makes a different nonce each time unless given one", () => {
    const nonce = (html: string) => html.match(/script-src 'nonce-([^']+)'/)![1];

    expect(nonce(buildEmailFrameDocument("x"))).not.toBe(nonce(buildEmailFrameDocument("x")));
  });

  it("folds a quoted reply behind a button that needs no script", () => {
    const out = buildEmailFrameDocument(
      '<p>New</p><blockquote class="gmail_quote">Old</blockquote>',
    );

    expect(out).toContain('<details class="br-quote">');
    expect(out).toContain("details.br-quote>summary");
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
  it("lets the height script run and links open, but never shares our origin", () => {
    expect(EMAIL_FRAME_SANDBOX.split(" ").sort()).toEqual([
      "allow-popups",
      "allow-popups-to-escape-sandbox",
      "allow-scripts",
    ]);
    expect(EMAIL_FRAME_SANDBOX).not.toContain("allow-same-origin");
  });
});
