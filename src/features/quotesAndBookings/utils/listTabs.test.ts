import { describe, it, expect } from "vitest";
import { DEFAULT_SORT } from "./sortEvents";
import {
  ACCOUNTANT_TABS,
  QUOTES_BOOKINGS_TABS,
  defaultSortForTab,
  parseListTab,
  tabUsesStatusFilter,
} from "./listTabs";

describe("the /quotes-bookings declaration", () => {
  it("has one tab, All Events, that is not written to the URL", () => {
    expect(QUOTES_BOOKINGS_TABS.tabs.map((tab) => tab.id)).toEqual(["all"]);
    expect(QUOTES_BOOKINGS_TABS.openingTab).toBe("all");
    expect(QUOTES_BOOKINGS_TABS.writeTabToUrl).toBe(false);
  });

  it("keeps newest-created first and offers the Status filter", () => {
    expect(defaultSortForTab("all", QUOTES_BOOKINGS_TABS)).toEqual(DEFAULT_SORT);
    expect(tabUsesStatusFilter("all", QUOTES_BOOKINGS_TABS)).toBe(true);
  });

  it("opens All Events for any ?tab, including a stale AR one", () => {
    expect(parseListTab(null, QUOTES_BOOKINGS_TABS)).toBe("all");
    expect(parseListTab("all", QUOTES_BOOKINGS_TABS)).toBe("all");
    expect(parseListTab("ar", QUOTES_BOOKINGS_TABS)).toBe("all");
    expect(parseListTab("ar_deposits", QUOTES_BOOKINGS_TABS)).toBe("all");
  });
});

describe("the /accountant declaration", () => {
  // docs/specs/accountant-collections-07-collections-list.md §3.
  it("has Collections first, then AR, AR Deposits and Need attention; opens on Collections; writes the tab to the URL", () => {
    expect(ACCOUNTANT_TABS.tabs.map((tab) => tab.id)).toEqual([
      "collections",
      "ar",
      "ar_deposits",
      "need_attention",
    ]);
    expect(ACCOUNTANT_TABS.openingTab).toBe("collections");
    expect(ACCOUNTANT_TABS.writeTabToUrl).toBe(true);
  });

  it("gives Collections the default sort (it owns its own order) and no Status filter", () => {
    expect(defaultSortForTab("collections", ACCOUNTANT_TABS)).toEqual(DEFAULT_SORT);
    expect(tabUsesStatusFilter("collections", ACCOUNTANT_TABS)).toBe(false);
  });

  it("starts AR from the most recent event and walks back into the past", () => {
    expect(defaultSortForTab("ar", ACCOUNTANT_TABS)).toEqual({
      key: "start_date",
      direction: "desc",
    });
  });

  it("starts AR Deposits from the next event and walks forward", () => {
    expect(defaultSortForTab("ar_deposits", ACCOUNTANT_TABS)).toEqual({
      key: "start_date",
      direction: "asc",
    });
  });

  // docs/specs/qbo-invoice-10-need-attention-tab.md §4: the newest event first.
  it("starts Need attention from the newest event and walks back", () => {
    expect(defaultSortForTab("need_attention", ACCOUNTANT_TABS)).toEqual({
      key: "start_date",
      direction: "desc",
    });
  });

  it("offers no Status filter on any tab — the AR tabs are booked events by definition, and Need attention is about an invoice", () => {
    expect(tabUsesStatusFilter("ar", ACCOUNTANT_TABS)).toBe(false);
    expect(tabUsesStatusFilter("ar_deposits", ACCOUNTANT_TABS)).toBe(false);
    expect(tabUsesStatusFilter("need_attention", ACCOUNTANT_TABS)).toBe(false);
  });

  it("reads the tabs back from the URL", () => {
    expect(parseListTab("collections", ACCOUNTANT_TABS)).toBe("collections");
    expect(parseListTab("ar", ACCOUNTANT_TABS)).toBe("ar");
    expect(parseListTab("ar_deposits", ACCOUNTANT_TABS)).toBe("ar_deposits");
    expect(parseListTab("need_attention", ACCOUNTANT_TABS)).toBe("need_attention");
  });

  it("opens Collections for a missing or unknown value, including the old All Events", () => {
    expect(parseListTab(null, ACCOUNTANT_TABS)).toBe("collections");
    expect(parseListTab("all", ACCOUNTANT_TABS)).toBe("collections");
    expect(parseListTab("receivables", ACCOUNTANT_TABS)).toBe("collections");
    expect(parseListTab("need-attention", ACCOUNTANT_TABS)).toBe("collections");
  });

  it("still opens AR from a bookmarked ?tab=ar", () => {
    expect(parseListTab("ar", ACCOUNTANT_TABS)).toBe("ar");
  });
});
