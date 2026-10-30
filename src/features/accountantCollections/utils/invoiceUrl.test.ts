import { describe, expect, it } from "vitest";
import type { CollectionsListState } from "./collectionsListState";
import {
  collectionsHref,
  invoiceHref,
  parseInvoiceTab,
  withCollectionsListState,
} from "./invoiceUrl";

const DEFAULT: CollectionsListState = { sort: "followUp", dir: "asc", showNotDue: false };
const CHANGED: CollectionsListState = { sort: "amount", dir: "desc", showNotDue: true };

describe("invoiceHref", () => {
  it("opens the invoice on the tab asked for, with no list parameters for the default list", () => {
    expect(invoiceHref({ eventId: "evt-1", tab: "info", listState: DEFAULT })).toBe(
      "/accountant/invoice?id=evt-1&tab=info",
    );
    expect(invoiceHref({ eventId: "evt-1", tab: "tasks", listState: DEFAULT })).toBe(
      "/accountant/invoice?id=evt-1&tab=tasks",
    );
  });

  it("carries the list's parameters after id and tab", () => {
    expect(invoiceHref({ eventId: "evt-1", tab: "info", listState: CHANGED })).toBe(
      "/accountant/invoice?id=evt-1&tab=info&csort=amount&cdir=desc&cnotdue=1",
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
});

describe("parseInvoiceTab", () => {
  it("opens Tasks only for tasks, and Information for anything else", () => {
    expect(parseInvoiceTab("tasks")).toBe("tasks");
    expect(parseInvoiceTab("info")).toBe("info");
    expect(parseInvoiceTab("bogus")).toBe("info");
    expect(parseInvoiceTab("")).toBe("info");
    expect(parseInvoiceTab(null)).toBe("info");
  });
});
