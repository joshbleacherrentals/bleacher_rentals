import { describe, expect, it } from "vitest";
import { DEFAULT_LIST_STATE, type CollectionsListState } from "./collectionsListState";
import {
  collectionsHref,
  invoiceHref,
  parseInvoiceTab,
  quoteCardHref,
  withCollectionsListState,
} from "./invoiceUrl";

const DEFAULT: CollectionsListState = DEFAULT_LIST_STATE;
const CHANGED: CollectionsListState = {
  sort: "amount",
  dir: "desc",
  showNotDue: true,
  type: "collections",
};
const DEPOSITS: CollectionsListState = { ...DEFAULT_LIST_STATE, type: "deposits" };
const ALL: CollectionsListState = { ...CHANGED, type: "all" };

describe("invoiceHref", () => {
  it("opens the invoice on the tab asked for, with no list parameters for the default list", () => {
    expect(invoiceHref({ eventId: "evt-1", tab: "info", listState: DEFAULT })).toBe(
      "/accountant/invoice?id=evt-1&tab=info",
    );
  });

  it("writes tab=messages for the Messages tab", () => {
    expect(invoiceHref({ eventId: "evt-1", tab: "messages", listState: DEFAULT })).toBe(
      "/accountant/invoice?id=evt-1&tab=messages",
    );
    expect(invoiceHref({ eventId: "evt-1", tab: "messages", listState: CHANGED })).toBe(
      "/accountant/invoice?id=evt-1&tab=messages&csort=amount&cdir=desc&cnotdue=1",
    );
  });

  it("carries the list's parameters after id and tab", () => {
    expect(invoiceHref({ eventId: "evt-1", tab: "info", listState: CHANGED })).toBe(
      "/accountant/invoice?id=evt-1&tab=info&csort=amount&cdir=desc&cnotdue=1",
    );
  });

  // docs/specs/accountant-collections-23-amount-type-switch.md §1 (D4) and §5.
  it("carries type when it is not Collections, and nothing for Collections", () => {
    expect(invoiceHref({ eventId: "evt-1", tab: "info", listState: DEPOSITS })).toBe(
      "/accountant/invoice?id=evt-1&tab=info&type=deposits",
    );
    expect(invoiceHref({ eventId: "evt-1", tab: "messages", listState: ALL })).toBe(
      "/accountant/invoice?id=evt-1&tab=messages&csort=amount&cdir=desc&cnotdue=1&type=all",
    );
    expect(invoiceHref({ eventId: "evt-1", tab: "info", listState: CHANGED })).not.toContain(
      "type=",
    );
  });

  it("encodes an id that needs it", () => {
    expect(invoiceHref({ eventId: "a b&c", tab: "info", listState: DEFAULT })).toBe(
      "/accountant/invoice?id=a+b%26c&tab=info",
    );
  });
});

describe("collectionsHref", () => {
  it("goes back to the Collections tab", () => {
    expect(collectionsHref(DEFAULT)).toBe("/accountant?tab=collections");
  });

  it("brings the list's parameters back", () => {
    expect(collectionsHref(CHANGED)).toBe(
      "/accountant?tab=collections&csort=amount&cdir=desc&cnotdue=1",
    );
  });

  it("brings the type back when it is not Collections", () => {
    expect(collectionsHref(DEPOSITS)).toBe("/accountant?tab=collections&type=deposits");
    expect(collectionsHref(ALL)).toBe(
      "/accountant?tab=collections&csort=amount&cdir=desc&cnotdue=1&type=all",
    );
  });
});

// docs/specs/accountant-collections-17-open-qi-button.md §3 and §5: the address Open Q/I opens.
describe("quoteCardHref", () => {
  it("is the quote card of the event, with no tab and no list parameters", () => {
    expect(quoteCardHref("0b5a3c1e-7d2f-4c8a-9e61-3f4d5a6b7c8d")).toBe(
      "/quotes-bookings/0b5a3c1e-7d2f-4c8a-9e61-3f4d5a6b7c8d",
    );
  });

  it("encodes an id that needs it", () => {
    expect(quoteCardHref("a b/c?d#e")).toBe("/quotes-bookings/a%20b%2Fc%3Fd%23e");
  });
});

describe("withCollectionsListState", () => {
  it("replaces the list's parameters and keeps every other one", () => {
    const current = new URLSearchParams("tab=collections&csort=overdue&cdir=asc&q=abc");
    const next = new URLSearchParams(withCollectionsListState(current, CHANGED));
    expect(next.get("tab")).toBe("collections");
    expect(next.get("q")).toBe("abc");
    expect(next.get("csort")).toBe("amount");
    expect(next.get("cdir")).toBe("desc");
    expect(next.get("cnotdue")).toBe("1");
  });

  it("drops the parameters that are back to their default", () => {
    const current = new URLSearchParams("tab=collections&csort=amount&cdir=desc&cnotdue=1");
    expect(withCollectionsListState(current, DEFAULT)).toBe("tab=collections");
  });

  it("writes type for Deposits and All", () => {
    const current = new URLSearchParams("tab=collections");
    expect(withCollectionsListState(current, DEPOSITS)).toBe("tab=collections&type=deposits");
    expect(new URLSearchParams(withCollectionsListState(current, ALL)).get("type")).toBe("all");
  });

  it("replaces an old type", () => {
    const current = new URLSearchParams("tab=collections&type=deposits");
    const next = new URLSearchParams(withCollectionsListState(current, ALL));
    expect(next.getAll("type")).toEqual(["all"]);
  });

  it("removes the type when the new state is Collections, and keeps every other parameter", () => {
    const current = new URLSearchParams("tab=collections&q=abc&type=all&csort=amount&page=2");
    const next = new URLSearchParams(
      withCollectionsListState(current, { ...DEFAULT_LIST_STATE, sort: "amount" }),
    );
    expect(next.has("type")).toBe(false);
    expect(next.get("tab")).toBe("collections");
    expect(next.get("q")).toBe("abc");
    expect(next.get("page")).toBe("2");
    expect(next.get("csort")).toBe("amount");
  });

  it("changing the type keeps the sort and Show Not Due Yet", () => {
    const current = new URLSearchParams("tab=collections&csort=amount&cdir=desc&cnotdue=1");
    const next = new URLSearchParams(
      withCollectionsListState(current, { ...CHANGED, type: "deposits" }),
    );
    expect(next.get("csort")).toBe("amount");
    expect(next.get("cdir")).toBe("desc");
    expect(next.get("cnotdue")).toBe("1");
    expect(next.get("type")).toBe("deposits");
  });
});

describe("parseInvoiceTab", () => {
  it("opens Messages for messages, and Information for anything else", () => {
    expect(parseInvoiceTab("messages")).toBe("messages");
    expect(parseInvoiceTab("info")).toBe("info");
    expect(parseInvoiceTab("bogus")).toBe("info");
    expect(parseInvoiceTab("")).toBe("info");
    expect(parseInvoiceTab(null)).toBe("info");
  });

  // docs/specs/accountant-collections-13-task-history-and-files.md §3: the Tasks tab is gone, so
  // an old link lands on Information.
  it("opens Information for an old tab=tasks link", () => {
    expect(parseInvoiceTab("tasks")).toBe("info");
  });
});
