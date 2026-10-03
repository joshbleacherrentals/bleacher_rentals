import { describe, it, expect } from "vitest";
import type { QuotesBookingsFilters } from "../types";
import { DEFAULT_SORT } from "./sortEvents";
import { defaultSortForTab } from "./listTabs";
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

describe("queryStringToWrite", () => {
  it("writes nothing when the URL already says what the state says", () => {
    expect(queryStringToWrite(state, "")).toBeNull();
    const withSearch = { ...state, searchQuery: "acme" };
    expect(queryStringToWrite(withSearch, "q=acme")).toBeNull();
  });

  it("writes the new query string when the state differs from the URL", () => {
    expect(queryStringToWrite({ ...state, searchQuery: "acme" }, "")).toBe("q=acme");
    expect(queryStringToWrite({ ...state, showDeleted: true }, "q=acme")).toBe("showDeleted=1");
  });

  it("keeps query parameters the list does not own", () => {
    expect(
      queryStringToWrite({ ...state, searchQuery: "acme" }, "template=x&timeRange=weekly"),
    ).toBe("template=x&timeRange=weekly&q=acme");
  });

  it("writes an empty string when the last synced parameter is cleared", () => {
    expect(queryStringToWrite(state, "q=acme")).toBe("");
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
    expect(tabSwitchOutcome("ar", false).sort).toEqual(defaultSortForTab("ar"));
    expect(tabSwitchOutcome("ar_deposits", false).sort).toEqual(defaultSortForTab("ar_deposits"));
    expect(tabSwitchOutcome("all", false).sort).toEqual(defaultSortForTab("all"));
  });

  it("drops a status filter when the tab does not offer one", () => {
    expect(tabSwitchOutcome("ar", true).dropStatuses).toBe(true);
    expect(tabSwitchOutcome("ar_deposits", true).dropStatuses).toBe(true);
  });

  it("keeps the status filter on All Events", () => {
    expect(tabSwitchOutcome("all", true).dropStatuses).toBe(false);
  });

  it("has nothing to drop when no status is chosen", () => {
    expect(tabSwitchOutcome("ar", false).dropStatuses).toBe(false);
  });
});
