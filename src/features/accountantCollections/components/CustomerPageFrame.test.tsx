import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import {
  CustomerPageFrame,
  CustomerPageFrameView,
  MIN_FRAME_HEIGHT,
  frameSrc,
  onFrameMessage,
} from "./CustomerPageFrame";

// Spec: docs/specs/accountant-collections-16-customer-page-view.md §3 and §5. The frame that shows
// the customer's page under the invoice header, and what it does with the page's messages.

const unescape = (html: string) => html.replace(/&amp;/g, "&");

describe("frameSrc", () => {
  it("is the customer's page of the event, embedded, on the given tab", () => {
    expect(frameSrc("evt-1", "quote")).toBe("/quote/evt-1?embed=1&tab=quote");
    expect(frameSrc("evt-1", "contract")).toBe("/quote/evt-1?embed=1&tab=contract");
    expect(frameSrc("evt-1", "pay")).toBe("/quote/evt-1?embed=1&tab=pay");
  });

  it("keeps an unusual id inside the path", () => {
    expect(frameSrc("a/b?c", "quote")).toBe("/quote/a%2Fb%3Fc?embed=1&tab=quote");
  });
});

describe("CustomerPageFrame markup", () => {
  const html = renderToStaticMarkup(<CustomerPageFrame eventId="evt-1" tab="pay" />);

  it("is an iframe titled Customer page, on the customer's page with embed=1 and the tab", () => {
    expect(html).toMatch(/<iframe[^>]*title="Customer page"/);
    expect(unescape(html)).toContain('src="/quote/evt-1?embed=1&tab=pay"');
  });

  it("is 480 px tall until the page reports its height, under the loading text", () => {
    expect(html).toContain("height:480px");
    expect(html).toContain("Loading customer page…");
    expect(html.indexOf("Loading customer page…")).toBeLessThan(html.indexOf("<iframe"));
  });

  it("says nothing about a connection while online", () => {
    expect(html).not.toContain("needs a connection");
  });
});

describe("CustomerPageFrameView", () => {
  const view = (over: Partial<Parameters<typeof CustomerPageFrameView>[0]> = {}) =>
    renderToStaticMarkup(
      <CustomerPageFrameView
        online
        src="/quote/evt-1?embed=1&tab=quote"
        height={900}
        loaded
        {...over}
      />,
    );

  it("is as tall as the page reported, and has no loading text once it has", () => {
    const html = view();
    expect(html).toContain("height:900px");
    expect(html).not.toContain("Loading customer page");
  });

  it("replaces the frame with the connection text offline", () => {
    const html = view({ online: false });
    expect(html).toContain("The customer page needs a connection.");
    expect(html).not.toContain("<iframe");
  });
});

describe("onFrameMessage", () => {
  it("answers ready with the tab to send", () => {
    expect(onFrameMessage({ type: "quote-embed:ready" }, "contract")).toEqual({
      kind: "send-tab",
      tab: "contract",
    });
  });

  it("sets the height the page reports", () => {
    expect(onFrameMessage({ type: "quote-embed:height", height: 1300 }, "quote")).toEqual({
      kind: "set-height",
      height: 1300,
    });
  });

  it("raises a height below 480 to 480", () => {
    expect(MIN_FRAME_HEIGHT).toBe(480);
    expect(onFrameMessage({ type: "quote-embed:height", height: 120 }, "quote")).toEqual({
      kind: "set-height",
      height: 480,
    });
    expect(onFrameMessage({ type: "quote-embed:height", height: 0 }, "quote")).toEqual({
      kind: "set-height",
      height: 480,
    });
  });

  it("ignores a foreign or malformed message", () => {
    for (const data of [
      null,
      "quote-embed:ready",
      { type: "something-else" },
      { type: "quote-embed:set-tab", tab: "pay" },
      { type: "quote-embed:height", height: -5 },
      { type: "quote-embed:height", height: "900" },
    ]) {
      expect(onFrameMessage(data, "quote")).toBeNull();
    }
  });
});
