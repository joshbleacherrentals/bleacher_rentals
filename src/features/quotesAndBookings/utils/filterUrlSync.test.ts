import { describe, it, expect } from "vitest";
import {
  filtersToSearchParams,
  searchParamsToFilters,
  hasUrlSyncedFilterParams,
  type UrlSyncedListState,
} from "./filterUrlSync";
import { ACCOUNTANT_TABS, QUOTES_BOOKINGS_TABS } from "./listTabs";

const QB = QUOTES_BOOKINGS_TABS;
const ACCT = ACCOUNTANT_TABS;

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
  sort: { key: "created_at", direction: "desc" },
  tab: "all",
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
      sort: { key: "subtotal", direction: "asc" },
      tab: "all",
    };

    const params = filtersToSearchParams(state, QB);
    const parsed = searchParamsToFilters(params, QB);
    expect(parsed).toEqual(state);
  });

  it("round-trips the empty state to no params at all", () => {
    const params = filtersToSearchParams(emptyState, QB);
    expect(params.toString()).toBe("");
    expect(searchParamsToFilters(params, QB)).toEqual(emptyState);
  });

  it("omits false booleans (inQuickBooks) but keeps them distinguishable from null", () => {
    const params = filtersToSearchParams(
      { ...emptyState, filters: { ...emptyState.filters, inQuickBooks: false } },
      QB,
    );
    expect(params.get("quickBooks")).toBe("0");
    expect(searchParamsToFilters(params, QB).filters.inQuickBooks).toBe(false);
  });

  it("preserves unrelated existing params (e.g. scorecard deep-link params)", () => {
    const existing = new URLSearchParams({ template: "weeklyBookings", timeRange: "weekly" });
    const params = filtersToSearchParams({ ...emptyState, searchQuery: "hello" }, QB, existing);
    expect(params.get("template")).toBe("weeklyBookings");
    expect(params.get("timeRange")).toBe("weekly");
    expect(params.get("q")).toBe("hello");
  });

  it("removes a param when its value clears back to empty/null", () => {
    const existing = new URLSearchParams({ q: "old search", showDeleted: "1" });
    const params = filtersToSearchParams(emptyState, QB, existing);
    expect(params.get("q")).toBeNull();
    expect(params.get("showDeleted")).toBeNull();
  });
});

describe("hasUrlSyncedFilterParams", () => {
  it("is false when none of the owned params are present", () => {
    expect(hasUrlSyncedFilterParams(new URLSearchParams({ template: "weeklyBookings" }), QB)).toBe(
      false,
    );
  });

  it("is true when at least one owned param is present", () => {
    expect(hasUrlSyncedFilterParams(new URLSearchParams({ q: "acme" }), QB)).toBe(true);
    expect(hasUrlSyncedFilterParams(new URLSearchParams({ showDeleted: "1" }), QB)).toBe(true);
  });
});

describe("page / pageSize in the URL", () => {
  it("round-trips the page and page size so a reload lands on the same page", () => {
    const params = filtersToSearchParams({ ...emptyState, page: 8, pageSize: 100 }, QB);
    expect(params.get("page")).toBe("8");
    expect(params.get("pageSize")).toBe("100");

    const parsed = searchParamsToFilters(params, QB);
    expect(parsed.page).toBe(8);
    expect(parsed.pageSize).toBe(100);
  });

  it("keeps the first page and the default size out of the URL", () => {
    const params = filtersToSearchParams({ ...emptyState, page: 1, pageSize: 25 }, QB);
    expect(params.toString()).toBe("");
  });

  it("defaults to page 1 at 25 per page when the params are absent or bogus", () => {
    const absent = searchParamsToFilters(new URLSearchParams(), QB);
    expect(absent.page).toBe(1);
    expect(absent.pageSize).toBe(25);

    const bogus = searchParamsToFilters(new URLSearchParams({ page: "0", pageSize: "7" }), QB);
    expect(bogus.page).toBe(1);
    expect(bogus.pageSize).toBe(25);
  });

  it("drops a stale page param when the state goes back to page 1", () => {
    const existing = new URLSearchParams({ page: "8" });
    const params = filtersToSearchParams({ ...emptyState, page: 1 }, QB, existing);
    expect(params.get("page")).toBeNull();
  });
});

describe("sort in the URL", () => {
  it("round-trips a column sort so the back button restores it", () => {
    const params = filtersToSearchParams(
      { ...emptyState, sort: { key: "event_name", direction: "desc" } },
      QB,
    );
    expect(params.get("sort")).toBe("event_name:desc");
    expect(searchParamsToFilters(params, QB).sort).toEqual({
      key: "event_name",
      direction: "desc",
    });
    expect(hasUrlSyncedFilterParams(params, QB)).toBe(true);
  });

  it("keeps the default newest-created sort out of the URL", () => {
    const existing = new URLSearchParams({ sort: "tax:asc" });
    const params = filtersToSearchParams(emptyState, QB, existing);
    expect(params.get("sort")).toBeNull();
  });
});

describe("tab in the URL — /quotes-bookings (one tab, never written)", () => {
  it("never writes ?tab, and drops a stale one on the first write (the old AR bookmark)", () => {
    const params = filtersToSearchParams(emptyState, QB, new URLSearchParams({ tab: "ar" }));
    expect(params.get("tab")).toBeNull();
    expect(params.toString()).toBe("");
  });

  it("keeps the other parameters of a stale AR bookmark", () => {
    const params = filtersToSearchParams(
      { ...emptyState, searchQuery: "acme" },
      QB,
      new URLSearchParams({ tab: "ar", template: "revenue" }),
    );
    expect(params.get("tab")).toBeNull();
    expect(params.get("template")).toBe("revenue");
    expect(params.get("q")).toBe("acme");
  });

  it("opens All Events for ?tab=ar and keeps the Status filter from the URL", () => {
    const parsed = searchParamsToFilters(
      new URLSearchParams({ tab: "ar", statuses: "quoted,lost" }),
      QB,
    );
    expect(parsed.tab).toBe("all");
    expect(parsed.filters.statuses).toEqual(["quoted", "lost"]);
    expect(parsed.sort).toEqual({ key: "created_at", direction: "desc" });
  });

  it("does not count a stale ?tab as a synced parameter, so scorecard overrides still apply", () => {
    expect(hasUrlSyncedFilterParams(new URLSearchParams({ tab: "ar" }), QB)).toBe(false);
    expect(
      hasUrlSyncedFilterParams(new URLSearchParams({ tab: "ar", template: "revenue" }), QB),
    ).toBe(false);
    expect(hasUrlSyncedFilterParams(new URLSearchParams({ tab: "ar", q: "acme" }), QB)).toBe(true);
  });
});

describe("tab in the URL — /accountant (AR and AR Deposits, always written)", () => {
  const arState: UrlSyncedListState = {
    ...emptyState,
    tab: "ar",
    sort: { key: "start_date", direction: "desc" },
  };

  it("always writes ?tab, even for the opening tab, and keeps the tab's own sort out", () => {
    const params = filtersToSearchParams(arState, ACCT);
    expect(params.get("tab")).toBe("ar");
    expect(params.get("sort")).toBeNull();

    const deposits = filtersToSearchParams(
      { ...arState, tab: "ar_deposits", sort: { key: "start_date", direction: "asc" } },
      ACCT,
    );
    expect(deposits.get("tab")).toBe("ar_deposits");
    expect(deposits.get("sort")).toBeNull();
  });

  it("round-trips the AR tab", () => {
    const parsed = searchParamsToFilters(filtersToSearchParams(arState, ACCT), ACCT);
    expect(parsed).toEqual(arState);
  });

  it("restores AR Deposits with its nearest-first default sort", () => {
    const parsed = searchParamsToFilters(new URLSearchParams({ tab: "ar_deposits" }), ACCT);
    expect(parsed.tab).toBe("ar_deposits");
    expect(parsed.sort).toEqual({ key: "start_date", direction: "asc" });
  });

  it("writes a sort that differs from the tab's default", () => {
    const params = filtersToSearchParams(
      { ...arState, sort: { key: "amount_due", direction: "desc" } },
      ACCT,
    );
    expect(params.get("sort")).toBe("amount_due:desc");
    expect(searchParamsToFilters(params, ACCT).sort).toEqual({
      key: "amount_due",
      direction: "desc",
    });
  });

  it("opens AR for a missing, unknown or old ?tab and ignores a status in the URL", () => {
    for (const raw of [undefined, "bogus", "all"]) {
      const params = new URLSearchParams({ statuses: "quoted", am: "am-1" });
      if (raw) params.set("tab", raw);
      const parsed = searchParamsToFilters(params, ACCT);
      expect(parsed.tab).toBe("ar");
      expect(parsed.filters.statuses).toEqual([]);
      expect(parsed.filters.accountManagerUserUuid).toBe("am-1");
    }
  });

  it("never writes a status filter", () => {
    const params = filtersToSearchParams(
      { ...arState, filters: { ...emptyState.filters, statuses: ["quoted"] } },
      ACCT,
    );
    expect(params.get("statuses")).toBeNull();
  });

  it("counts ?tab as a synced parameter — it is always written there", () => {
    expect(hasUrlSyncedFilterParams(new URLSearchParams({ tab: "ar" }), ACCT)).toBe(true);
    expect(hasUrlSyncedFilterParams(new URLSearchParams({ template: "revenue" }), ACCT)).toBe(
      false,
    );
  });
});
