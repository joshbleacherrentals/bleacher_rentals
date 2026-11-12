import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

import { InvoicePageFrameView } from "./InvoicePageFrame";

// docs/specs/accountant-collections-22-side-task-buttons.md §3 and §5. Static markup of the pure
// view; the width measuring around it is `usePageWidth` (its own test).

const PREVIOUS = "/accountant/invoice?id=evt-0&tab=info";
const NEXT = "/accountant/invoice?id=evt-2&tab=info";

function render(props: { rails: boolean; previousHref?: string | null; nextHref?: string | null }) {
  return renderToStaticMarkup(
    <InvoicePageFrameView
      rails={props.rails}
      previousHref={props.previousHref === undefined ? PREVIOUS : props.previousHref}
      nextHref={props.nextHref === undefined ? NEXT : props.nextHref}
      frameRef={null}
    >
      <p>the page</p>
    </InvoicePageFrameView>,
  );
}

/** The opening tags of the elements that carry `aria-hidden="true"`: the rails. */
const railTags = (html: string) => html.match(/<div[^>]*aria-hidden="true"[^>]*>/g) ?? [];
/** The column: the element that holds the page, as a string up to its first child. */
const columnTag = (html: string) => /<div[^>]*>(?=<p>the page<\/p>)/.exec(html)![0];

describe("InvoicePageFrameView with the rails", () => {
  const html = render({ rails: true });

  it("draws two rails, each hidden from assistive technology", () => {
    expect(railTags(html)).toHaveLength(2);
    for (const tag of railTags(html)) expect(tag).toContain('aria-hidden="true"');
  });

  it("sizes each rail at 168 px, never shrinking, 48 px below the top", () => {
    for (const tag of railTags(html)) {
      expect(tag).toMatch(/class="[^"]*\bw-\[168px\]/);
      expect(tag).toMatch(/class="[^"]*\bshrink-0\b/);
      expect(tag).toMatch(/class="[^"]*\bpt-12\b/);
    }
  });

  it("puts a link in each rail, out of the tab order, sticky 24 px below the top", () => {
    const links = html.match(/<a [^>]*>/g) ?? [];
    expect(links).toHaveLength(2);
    for (const tag of links) {
      expect(tag).toContain('tabindex="-1"');
      expect(tag).toMatch(/class="[^"]*\bsticky\b/);
      expect(tag).toMatch(/class="[^"]*\btop-6\b/);
    }
  });

  it("links Previous Task on the left and Next Task on the right to the given addresses", () => {
    const hrefs = [...html.matchAll(/<a [^>]*href="([^"]*)"/g)].map((m) =>
      m[1].replace(/&amp;/g, "&"),
    );
    expect(hrefs).toEqual([PREVIOUS, NEXT]);
  });

  it("puts the left rail, then the page, then the right rail", () => {
    const previous = html.indexOf("Previous Task");
    const page = html.indexOf("the page");
    const next = html.indexOf("Next Task");
    expect(previous).toBeGreaterThan(-1);
    expect(previous).toBeLessThan(page);
    expect(page).toBeLessThan(next);
  });

  it("points the arrow left before Previous Task and right after Next Task", () => {
    const left = html.indexOf("lucide-arrow-left");
    const previous = html.indexOf("Previous Task");
    const next = html.indexOf("Next Task");
    const right = html.indexOf("lucide-arrow-right");
    expect(left).toBeGreaterThan(-1);
    expect(left).toBeLessThan(previous);
    expect(next).toBeLessThan(right);
    // The arrows are decoration.
    for (const arrow of html.match(/<svg[^>]*>/g) ?? [])
      expect(arrow).toContain('aria-hidden="true"');
  });

  it("looks as drawn: 48 px high, rounded, white, a dark blue border and text", () => {
    const link = (html.match(/<a [^>]*>/g) ?? [])[0];
    expect(link).toMatch(/class="[^"]*\bh-12\b/);
    expect(link).toMatch(/class="[^"]*\brounded-lg\b/);
    expect(link).toMatch(/class="[^"]*\bbg-white\b/);
    expect(link).toMatch(/class="[^"]*\bborder-darkBlue\b/);
    expect(link).toMatch(/class="[^"]*\btext-darkBlue\b/);
    expect(link).toMatch(/class="[^"]*\bw-full\b/);
  });
});

describe("InvoicePageFrameView without the rails", () => {
  const html = render({ rails: false });

  it("draws no rails, no side buttons and no link", () => {
    expect(railTags(html)).toHaveLength(0);
    expect(html).not.toContain("Previous Task");
    expect(html).not.toContain("Next Task");
    expect(html).not.toContain("<a ");
  });

  it("draws the page as it is", () => {
    expect(html).toContain("<p>the page</p>");
  });

  it("leaves the column exactly as it is with the rails", () => {
    expect(columnTag(html)).toBe(columnTag(render({ rails: true })));
  });
});

describe("the frame and the column", () => {
  const html = render({ rails: true });

  it("is one full-width box holding a centred row with a 16 px gap", () => {
    expect(html).toMatch(/^<div class="[^"]*\bw-full\b[^"]*">/);
    expect(html).toMatch(/<div class="[^"]*\bflex\b[^"]*\bitems-stretch\b[^"]*"/);
    expect(html).toMatch(/<div class="[^"]*\bjustify-center\b[^"]*"/);
    expect(html).toMatch(/<div class="[^"]*\bgap-4\b[^"]*"/);
  });

  it("gives the column today's root padding and a 1040 px basis that can shrink", () => {
    const column = columnTag(html);
    for (const cls of ["min-w-0", "flex-[0_1_1040px]", "px-8", "pb-14", "pt-2"]) {
      expect(column).toContain(cls);
    }
    expect(column).not.toContain("mx-auto");
    expect(column).not.toContain("max-w-");
  });
});

describe("a rail without a destination", () => {
  it("draws a dimmed stand-in, not a link, for a null address", () => {
    const html = render({ rails: true, previousHref: null });
    expect(html.match(/<a [^>]*>/g)).toHaveLength(1);
    const dimmed = /<span[^>]*aria-disabled="true"[^>]*>(?:(?!<\/span>)[^])*Previous Task/.exec(
      html,
    );
    expect(dimmed).not.toBeNull();
    expect(dimmed![0]).toMatch(/class="[^"]*\bopacity-50\b/);
    expect(dimmed![0]).toMatch(/class="[^"]*\bcursor-not-allowed\b/);
    expect(dimmed![0]).not.toContain("href");
    expect(html).toMatch(/<a [^>]*href="[^"]*"[^>]*>(?:(?!<\/a>)[^])*Next Task/);
  });

  it("dims both when neither has an address (the neighbours are not ready)", () => {
    const html = render({ rails: true, previousHref: null, nextHref: null });
    expect(html).not.toContain("<a ");
    expect(html.match(/aria-disabled="true"/g)).toHaveLength(2);
    expect(html).toContain("Previous Task");
    expect(html).toContain("Next Task");
  });

  it("keeps the dimmed stand-in out of the tab order", () => {
    const html = render({ rails: true, previousHref: null, nextHref: null });
    expect(html).not.toContain("tabindex");
  });
});
