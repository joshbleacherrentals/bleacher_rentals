import { afterEach, describe, expect, it, vi } from "vitest";
import {
  EMBED_PARAM,
  isEmbeddedQuotePage,
  isSameOriginFrom,
  parseEmbedTab,
  parseToChild,
  parseToParent,
  trackUnlessEmbedded,
} from "./quoteEmbed";

// Spec: docs/specs/accountant-collections-16-customer-page-view.md §3 and §5. The protocol the
// invoice page and the customer page's frame share, and the one test the app's shell and the
// customer page agree on.

describe("EMBED_PARAM", () => {
  it("is embed", () => {
    expect(EMBED_PARAM).toBe("embed");
  });
});

describe("parseEmbedTab", () => {
  it.each(["quote", "contract", "pay"] as const)("accepts %s", (tab) => {
    expect(parseEmbedTab(tab)).toBe(tab);
  });

  it.each([null, undefined, "", "Quote", "tasks", "info", 1, {}, ["quote"]])(
    "gives null for %j",
    (raw) => {
      expect(parseEmbedTab(raw)).toBeNull();
    },
  );
});

describe("parseToChild", () => {
  it("accepts a set-tab message for each tab", () => {
    for (const tab of ["quote", "contract", "pay"] as const) {
      expect(parseToChild({ type: "quote-embed:set-tab", tab })).toEqual({
        type: "quote-embed:set-tab",
        tab,
      });
    }
  });

  it("gives null for a wrong type, a wrong tab, a missing tab and a message to the parent", () => {
    expect(parseToChild({ type: "quote-embed:ready" })).toBeNull();
    expect(parseToChild({ type: "something-else", tab: "quote" })).toBeNull();
    expect(parseToChild({ type: "quote-embed:set-tab", tab: "info" })).toBeNull();
    expect(parseToChild({ type: "quote-embed:set-tab" })).toBeNull();
  });

  it("gives null when it is not an object", () => {
    for (const data of [null, undefined, "quote-embed:set-tab", 7, true, []]) {
      expect(parseToChild(data)).toBeNull();
    }
  });
});

describe("parseToParent", () => {
  it("accepts ready", () => {
    expect(parseToParent({ type: "quote-embed:ready" })).toEqual({ type: "quote-embed:ready" });
  });

  it("accepts a height, rounded as sent", () => {
    expect(parseToParent({ type: "quote-embed:height", height: 1300 })).toEqual({
      type: "quote-embed:height",
      height: 1300,
    });
    expect(parseToParent({ type: "quote-embed:height", height: 0 })).toEqual({
      type: "quote-embed:height",
      height: 0,
    });
  });

  it("gives null for a non-numeric, negative, infinite or missing height", () => {
    expect(parseToParent({ type: "quote-embed:height", height: "1300" })).toBeNull();
    expect(parseToParent({ type: "quote-embed:height", height: -1 })).toBeNull();
    expect(parseToParent({ type: "quote-embed:height", height: Number.NaN })).toBeNull();
    expect(parseToParent({ type: "quote-embed:height", height: Infinity })).toBeNull();
    expect(parseToParent({ type: "quote-embed:height" })).toBeNull();
  });

  it("gives null for a wrong type and for a message to the child", () => {
    expect(parseToParent({ type: "quote-embed:set-tab", tab: "pay" })).toBeNull();
    expect(parseToParent({ type: "other" })).toBeNull();
  });

  it("gives null when it is not an object", () => {
    for (const data of [null, undefined, "quote-embed:ready", 7, false, []]) {
      expect(parseToParent(data)).toBeNull();
    }
  });
});

describe("isSameOriginFrom", () => {
  afterEach(() => vi.unstubAllGlobals());

  const frame = { name: "the frame" };
  const stranger = { name: "another window" };

  it("is true for the expected source on the page's own origin", () => {
    vi.stubGlobal("location", { origin: "https://app.example.com" });
    expect(isSameOriginFrom({ origin: "https://app.example.com", source: frame }, frame)).toBe(
      true,
    );
  });

  it("is false for another origin", () => {
    vi.stubGlobal("location", { origin: "https://app.example.com" });
    expect(isSameOriginFrom({ origin: "https://evil.example.org", source: frame }, frame)).toBe(
      false,
    );
    expect(isSameOriginFrom({ origin: "http://app.example.com", source: frame }, frame)).toBe(
      false,
    );
  });

  it("is false for another source, and when there is no source to compare with", () => {
    vi.stubGlobal("location", { origin: "https://app.example.com" });
    expect(isSameOriginFrom({ origin: "https://app.example.com", source: stranger }, frame)).toBe(
      false,
    );
    expect(isSameOriginFrom({ origin: "https://app.example.com", source: null }, null)).toBe(false);
    expect(isSameOriginFrom({ origin: "https://app.example.com", source: frame }, undefined)).toBe(
      false,
    );
  });
});

describe("isEmbeddedQuotePage", () => {
  const params = (query: string) => new URLSearchParams(query);

  it("is true for a quote path with embed=1", () => {
    expect(isEmbeddedQuotePage("/quote/evt-1", params("embed=1"))).toBe(true);
    expect(isEmbeddedQuotePage("/quote/evt-1", params("embed=1&tab=pay"))).toBe(true);
  });

  it("is false without embed=1, and with any other value", () => {
    expect(isEmbeddedQuotePage("/quote/evt-1", params(""))).toBe(false);
    expect(isEmbeddedQuotePage("/quote/evt-1", params("embed=0"))).toBe(false);
    expect(isEmbeddedQuotePage("/quote/evt-1", params("embed=true"))).toBe(false);
    expect(isEmbeddedQuotePage("/quote/evt-1", params("tab=pay"))).toBe(false);
  });

  it("is false for any path outside /quote/, whatever the query says", () => {
    expect(isEmbeddedQuotePage("/accountant/invoice", params("embed=1"))).toBe(false);
    expect(isEmbeddedQuotePage("/quotes-bookings/evt-1", params("embed=1"))).toBe(false);
    expect(isEmbeddedQuotePage("/quote", params("embed=1"))).toBe(false);
    expect(isEmbeddedQuotePage("/", params("embed=1"))).toBe(false);
  });

  it("is false when there are no search params at all", () => {
    expect(isEmbeddedQuotePage("/quote/evt-1", null)).toBe(false);
  });
});

describe("trackUnlessEmbedded", () => {
  it("does not call the tracker when embedded", () => {
    const track = vi.fn();
    trackUnlessEmbedded(true, track)({ action_type: "client_page_view" });
    expect(track).not.toHaveBeenCalled();
  });

  it("calls the tracker with the same event when not embedded", () => {
    const track = vi.fn();
    const event = { action_type: "client_tab_change", field_name: "tab" };
    trackUnlessEmbedded(false, track)(event);
    expect(track).toHaveBeenCalledExactlyOnceWith(event);
  });
});
