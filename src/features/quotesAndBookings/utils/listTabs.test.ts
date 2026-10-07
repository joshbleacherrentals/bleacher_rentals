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
  it("has the AR and AR Deposits tabs, opens on AR, and writes the tab to the URL", () => {
    expect(ACCOUNTANT_TABS.tabs.map((tab) => tab.id)).toEqual(["ar", "ar_deposits"]);
    expect(ACCOUNTANT_TABS.openingTab).toBe("ar");
    expect(ACCOUNTANT_TABS.writeTabToUrl).toBe(true);
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

  it("offers no Status filter on either tab — they are booked events by definition", () => {
    expect(tabUsesStatusFilter("ar", ACCOUNTANT_TABS)).toBe(false);
    expect(tabUsesStatusFilter("ar_deposits", ACCOUNTANT_TABS)).toBe(false);
  });

  it("reads the AR tabs back from the URL", () => {
    expect(parseListTab("ar", ACCOUNTANT_TABS)).toBe("ar");
    expect(parseListTab("ar_deposits", ACCOUNTANT_TABS)).toBe("ar_deposits");
  });

  it("opens AR for a missing or unknown value, including the old All Events", () => {
    expect(parseListTab(null, ACCOUNTANT_TABS)).toBe("ar");
    expect(parseListTab("all", ACCOUNTANT_TABS)).toBe("ar");
    expect(parseListTab("receivables", ACCOUNTANT_TABS)).toBe("ar");
  });
});
