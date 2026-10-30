import { describe, expect, it } from "vitest";
import { collapseQuotedHtml, splitQuotedText } from "./emailQuotes";

const count = (html: string, needle: string) => html.split(needle).length - 1;

describe("collapseQuotedHtml", () => {
  it("folds a Gmail quote, with its 'On ... wrote:' line, behind one button", () => {
    const html =
      "<div>Thanks, see you then.</div>" +
      '<div class="gmail_quote gmail_quote_container"><div class="gmail_attr">On Mon, Pat wrote:<br></div>' +
      '<blockquote class="gmail_quote"><div>Can we meet Friday?</div></blockquote></div>';

    const out = collapseQuotedHtml(html);

    expect(count(out, "<details")).toBe(1); // the inner blockquote is not folded again
    expect(out.startsWith("<div>Thanks, see you then.</div><details")).toBe(true);
    expect(out).toContain("Show quoted text");
    expect(out).toContain("Can we meet Friday?");
    expect(out.endsWith("</blockquote></div></details>")).toBe(true);
  });

  it("finds the end of a quote that has divs inside it, and leaves what follows showing", () => {
    const out = collapseQuotedHtml(
      '<div class="gmail_quote"><div>a<div>b</div></div></div><p>after</p>',
    );

    expect(out).toContain("<div>b</div></div></div></details><p>after</p>");
  });

  it("folds the quotes of an inline reply separately and leaves the text between them", () => {
    const out = collapseQuotedHtml(
      '<blockquote class="gmail_quote">Q1</blockquote><p>My answer</p><blockquote class="gmail_quote">Q2</blockquote>',
    );

    expect(count(out, "<details")).toBe(2);
    expect(out).toContain("</details><p>My answer</p><details");
  });

  it.each([
    ['<blockquote type="cite">quoted</blockquote>'],
    ['<div class="yahoo_quoted">quoted</div>'],
    ['<div class="protonmail_quote">quoted</div>'],
  ])("recognises %s", (quote) => {
    const out = collapseQuotedHtml(`<p>new</p>${quote}`);

    expect(out).toBe(
      `<p>new</p><details class="br-quote">${out.match(/<summary.*?<\/summary>/)![0]}${quote}</details>`,
    );
  });

  it("folds everything after Outlook's marker, up to the end of the body", () => {
    const out = collapseQuotedHtml(
      '<html><body><div>New text</div><div id="appendonsend"></div><hr><div id="divRplyFwdMsg">From: Pat</div><div>Old text</div></body></html>',
    );

    expect(out.startsWith("<html><body><div>New text</div><details")).toBe(true);
    expect(out).toContain("Old text</div></details></body></html>");
  });

  it("leaves an email with no quote exactly as it was", () => {
    const html = "<div>Hello</div><blockquote>A plain quotation</blockquote>";

    expect(collapseQuotedHtml(html)).toBe(html);
  });

  it("leaves a quote alone when its element is never closed", () => {
    const html = '<p>x</p><div class="gmail_quote"><div>unclosed';

    expect(collapseQuotedHtml(html)).toBe(html);
  });
});

describe("splitQuotedText", () => {
  it("separates the new text from a quoted reply and its 'On ... wrote:' line", () => {
    const text = [
      "Sounds good.",
      "",
      "On Mon, Oct 26, 2026 at 9:00 AM Pat <pat@x.com> wrote:",
      "> Can we meet?",
      "> Friday?",
    ].join("\n");

    expect(splitQuotedText(text)).toEqual([
      { text: "Sounds good.\n", quoted: false },
      {
        text: "On Mon, Oct 26, 2026 at 9:00 AM Pat <pat@x.com> wrote:\n> Can we meet?\n> Friday?",
        quoted: true,
      },
    ]);
  });

  it("takes in a lead-in that wraps onto two lines, or is followed by a blank line", () => {
    const wrapped = splitQuotedText(
      "Ok\nOn Mon, Oct 26, 2026 at 9:00 AM Pat <pat@x.com>\nwrote:\n> hi",
    );
    const spaced = splitQuotedText("Ok\nOn Oct 26, Pat wrote:\n\n> hi");

    expect(wrapped.map((p) => p.quoted)).toEqual([false, true]);
    expect(wrapped[1].text.startsWith("On Mon")).toBe(true);
    expect(spaced.map((p) => p.quoted)).toEqual([false, true]);
    expect(spaced[1].text).toBe("On Oct 26, Pat wrote:\n\n> hi");
  });

  it("understands a French lead-in", () => {
    const parts = splitQuotedText("Merci\nLe 26 oct. 2026, Pat a écrit :\n> Bonjour");

    expect(parts.map((p) => p.quoted)).toEqual([false, true]);
  });

  it("keeps the text between two quotes of an inline reply showing", () => {
    const parts = splitQuotedText("> Q1\nMy answer\n> Q2");

    expect(parts).toEqual([
      { text: "> Q1", quoted: true },
      { text: "My answer", quoted: false },
      { text: "> Q2", quoted: true },
    ]);
  });

  it("treats everything after an Original Message divider as quoted", () => {
    const parts = splitQuotedText("Reply\n-----Original Message-----\nFrom: Pat\nOld");

    expect(parts).toEqual([
      { text: "Reply", quoted: false },
      { text: "-----Original Message-----\nFrom: Pat\nOld", quoted: true },
    ]);
  });

  it("treats a line of underscores above a From: line as the start of the quote", () => {
    const quoted = splitQuotedText("Reply\n________________________________\nFrom: Pat\nOld");
    const justARule = splitQuotedText("Reply\n________________________________\nSincerely");

    expect(quoted.map((p) => p.quoted)).toEqual([false, true]);
    expect(justARule).toEqual([
      { text: "Reply\n________________________________\nSincerely", quoted: false },
    ]);
  });

  it("returns an email with no quote as one part, and reads Windows line endings", () => {
    expect(splitQuotedText("Hello\r\nthere")).toEqual([{ text: "Hello\nthere", quoted: false }]);
  });
});
