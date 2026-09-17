import { describe, it, expect } from "vitest";
import {
  filtersToSearchParams,
  searchParamsToFilters,
  hasUrlSyncedFilterParams,
  type UrlSyncedListState,
} from "./filterUrlSync";

const emptyState: UrlSyncedListState = {
  filters: {
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
  },
  searchQuery: "",
  showDeleted: false,
  page: 1,
  pageSize: 25,
};

describe("filtersToSearchParams / searchParamsToFilters round-trip", () => {
  it("round-trips a fully populated filter state", () => {
    const state: UrlSyncedListState = {
      filters: {
        statuses: ["quoted", "booked"],
        createdFrom: "2026-01-01",
        createdTo: "2026-01-31",
        eventFrom: "2026-02-01",
        eventTo: "2026-02-28",
        bookedFrom: "2026-01-15",
        bookedTo: "2026-01-20",
        accountManagerUserUuid: "am-uuid-1",
        inGoodShuffle: true,
        inQuickBooks: false,
        salesOfficeUuid: "office-uuid-1",
      },
      searchQuery: "acme corp",
      showDeleted: true,
      page: 3,
      pageSize: 50,
    };

    const params = filtersToSearchParams(state);
    const parsed = searchParamsToFilters(params);
    expect(parsed).toEqual(state);
  });

  it("round-trips the empty state to no params at all", () => {
    const params = filtersToSearchParams(emptyState);
    expect(params.toString()).toBe("");
    expect(searchParamsToFilters(params)).toEqual(emptyState);
  });

  it("omits false booleans (inQuickBooks) but keeps them distinguishable from null", () => {
    const params = filtersToSearchParams({
      ...emptyState,
      filters: { ...emptyState.filters, inQuickBooks: false },
    });
    expect(params.get("quickBooks")).toBe("0");
    expect(searchParamsToFilters(params).filters.inQuickBooks).toBe(false);
  });

  it("preserves unrelated existing params (e.g. scorecard deep-link params)", () => {
    const existing = new URLSearchParams({ template: "weeklyBookings", timeRange: "weekly" });
    const params = filtersToSearchParams({ ...emptyState, searchQuery: "hello" }, existing);
    expect(params.get("template")).toBe("weeklyBookings");
    expect(params.get("timeRange")).toBe("weekly");
    expect(params.get("q")).toBe("hello");
  });

  it("removes a param when its value clears back to empty/null", () => {
    const existing = new URLSearchParams({ q: "old search", showDeleted: "1" });
    const params = filtersToSearchParams(emptyState, existing);
    expect(params.get("q")).toBeNull();
    expect(params.get("showDeleted")).toBeNull();
  });
});

describe("hasUrlSyncedFilterParams", () => {
  it("is false when none of the owned params are present", () => {
    expect(hasUrlSyncedFilterParams(new URLSearchParams({ template: "weeklyBookings" }))).toBe(
      false,
    );
  });

  it("is true when at least one owned param is present", () => {
    expect(hasUrlSyncedFilterParams(new URLSearchParams({ q: "acme" }))).toBe(true);
    expect(hasUrlSyncedFilterParams(new URLSearchParams({ showDeleted: "1" }))).toBe(true);
  });
});

describe("page / pageSize in the URL", () => {
  it("round-trips the page and page size so a reload lands on the same page", () => {
    const params = filtersToSearchParams({ ...emptyState, page: 8, pageSize: 100 });
    expect(params.get("page")).toBe("8");
    expect(params.get("pageSize")).toBe("100");

    const parsed = searchParamsToFilters(params);
    expect(parsed.page).toBe(8);
    expect(parsed.pageSize).toBe(100);
  });

  it("keeps the first page and the default size out of the URL", () => {
    const params = filtersToSearchParams({ ...emptyState, page: 1, pageSize: 25 });
    expect(params.toString()).toBe("");
  });

  it("defaults to page 1 at 25 per page when the params are absent or bogus", () => {
    const absent = searchParamsToFilters(new URLSearchParams());
    expect(absent.page).toBe(1);
    expect(absent.pageSize).toBe(25);

    const bogus = searchParamsToFilters(new URLSearchParams({ page: "0", pageSize: "7" }));
    expect(bogus.page).toBe(1);
    expect(bogus.pageSize).toBe(25);
  });

  it("drops a stale page param when the state goes back to page 1", () => {
    const existing = new URLSearchParams({ page: "8" });
    const params = filtersToSearchParams({ ...emptyState, page: 1 }, existing);
    expect(params.get("page")).toBeNull();
  });
});
