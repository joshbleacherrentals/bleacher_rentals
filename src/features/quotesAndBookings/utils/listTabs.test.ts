import { describe, it, expect } from "vitest";
import { DEFAULT_SORT } from "./sortEvents";
import { defaultSortForTab, parseListTab, tabUsesStatusFilter } from "./listTabs";

describe("parseListTab", () => {
  it("reads the AR tabs back from the URL", () => {
    expect(parseListTab("ar")).toBe("ar");
    expect(parseListTab("ar_deposits")).toBe("ar_deposits");
  });

  it("falls back to All Events for a missing or unknown value", () => {
    expect(parseListTab(null)).toBe("all");
    expect(parseListTab("all")).toBe("all");
    expect(parseListTab("receivables")).toBe("all");
  });
});

describe("defaultSortForTab", () => {
  it("keeps newest-created first on All Events", () => {
    expect(defaultSortForTab("all")).toEqual(DEFAULT_SORT);
  });

  it("starts AR from the most recent event and walks back into the past", () => {
    expect(defaultSortForTab("ar")).toEqual({ key: "start_date", direction: "desc" });
  });

  it("starts AR Deposits from the next event and walks forward", () => {
    expect(defaultSortForTab("ar_deposits")).toEqual({ key: "start_date", direction: "asc" });
  });
});

describe("tabUsesStatusFilter", () => {
  it("offers the Status filter on All Events only — the AR tabs are booked events by definition", () => {
    expect(tabUsesStatusFilter("all")).toBe(true);
    expect(tabUsesStatusFilter("ar")).toBe(false);
    expect(tabUsesStatusFilter("ar_deposits")).toBe(false);
  });
});
