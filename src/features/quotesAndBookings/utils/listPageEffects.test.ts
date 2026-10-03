import { describe, it, expect } from "vitest";
import type { QuotesBookingsFilters } from "../types";
import { DEFAULT_SORT } from "./sortEvents";
import { ACCOUNTANT_TABS, QUOTES_BOOKINGS_TABS, defaultSortForTab } from "./listTabs";
import {
  queryStringToWrite,
  urlWriteDelayMs,
  pageAfterChange,
  tabSwitchOutcome,
} from "./listPageEffects";
import type { UrlSyncedListState } from "./filterUrlSync";

const filters: Omit<QuotesBookingsFilters, "isOpen"> = {
  statuses: [],
  createdFrom: null,
  createdTo: null,
  eventFrom: null,
  eventTo: null,
  bookedFrom: null,
  bookedTo: null,
  accountManagerUserUuid: null,
  inGoodShuffle: null,
  inQuickBooks: null,
  salesOfficeUuid: null,
};

const state: UrlSyncedListState = {
  filters,
  searchQuery: "",
  showDeleted: false,
  page: 1,
  pageSize: 25,
  sort: DEFAULT_SORT,
  tab: "all",
};

const QB = QUOTES_BOOKINGS_TABS;
const ACCT = ACCOUNTANT_TABS;

describe("queryStringToWrite", () => {
  it("writes nothing when the URL already says what the state says", () => {
    expect(queryStringToWrite(state, "", QB)).toBeNull();
    const withSearch = { ...state, searchQuery: "acme" };
    expect(queryStringToWrite(withSearch, "q=acme", QB)).toBeNull();
  });

  it("writes the new query string when the state differs from the URL", () => {
    expect(queryStringToWrite({ ...state, searchQuery: "acme" }, "", QB)).toBe("q=acme");
    expect(queryStringToWrite({ ...state, showDeleted: true }, "q=acme", QB)).toBe("showDeleted=1");
  });

  it("keeps query parameters the list does not own", () => {
    expect(
      queryStringToWrite({ ...state, searchQuery: "acme" }, "template=x&timeRange=weekly", QB),
    ).toBe("template=x&timeRange=weekly&q=acme");
  });

  it("writes an empty string when the last synced parameter is cleared", () => {
    expect(queryStringToWrite(state, "q=acme", QB)).toBe("");
  });

  it("removes a stale ?tab on /quotes-bookings, where the tab is not written", () => {
    expect(queryStringToWrite(state, "tab=ar", QB)).toBe("");
    expect(queryStringToWrite(state, "tab=ar&template=x", QB)).toBe("template=x");
  });

  it("writes ?tab=ar on /accountant when the URL has none — the first sync rewrites it", () => {
    const arState: UrlSyncedListState = {
      ...state,
      tab: "ar",
      sort: { key: "start_date", direction: "desc" },
    };
    expect(queryStringToWrite(arState, "", ACCT)).toBe("tab=ar");
    expect(queryStringToWrite(arState, "tab=all&statuses=quoted", ACCT)).toBe("tab=ar");
    expect(queryStringToWrite(arState, "tab=ar", ACCT)).toBeNull();
  });
});

describe("urlWriteDelayMs", () => {
  it("does not wait on the first sync", () => {
    expect(urlWriteDelayMs(true)).toBe(0);
  });

  it("waits 300 ms on every later sync", () => {
    expect(urlWriteDelayMs(false)).toBe(300);
  });
});

describe("pageAfterChange", () => {
  it("goes back to page 1 when the narrowing key changed", () => {
    expect(pageAfterChange(3, "before", "after")).toBe(1);
  });

  it("keeps the page when the narrowing key is the same", () => {
    expect(pageAfterChange(3, "same", "same")).toBe(3);
  });
});

describe("tabSwitchOutcome", () => {
  it("starts the new tab on its own sort", () => {
    expect(tabSwitchOutcome("ar", false, ACCT).sort).toEqual(defaultSortForTab("ar", ACCT));
    expect(tabSwitchOutcome("ar_deposits", false, ACCT).sort).toEqual(
      defaultSortForTab("ar_deposits", ACCT),
    );
    expect(tabSwitchOutcome("all", false, QB).sort).toEqual(defaultSortForTab("all", QB));
  });

  it("drops a status filter when the tab does not offer one", () => {
    expect(tabSwitchOutcome("ar", true, ACCT).dropStatuses).toBe(true);
    expect(tabSwitchOutcome("ar_deposits", true, ACCT).dropStatuses).toBe(true);
  });

  it("keeps the status filter on a tab that offers it", () => {
    expect(tabSwitchOutcome("all", true, QB).dropStatuses).toBe(false);
  });

  it("has nothing to drop when no status is chosen", () => {
    expect(tabSwitchOutcome("ar", false, ACCT).dropStatuses).toBe(false);
  });
});
