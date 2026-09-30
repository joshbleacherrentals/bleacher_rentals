import { describe, it, expect } from "vitest";
import type { QuotesBookingsFilters } from "../types";
import type { ListTab } from "./listTabs";
import { DEFAULT_SORT } from "./sortEvents";
import { narrowingKey } from "./narrowingKey";

const filters: QuotesBookingsFilters = {
  isOpen: true,
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

const keyFor = (f: QuotesBookingsFilters, search = "", deleted = false, tab: ListTab = "all") =>
  narrowingKey(f, search, deleted, DEFAULT_SORT, tab);

describe("narrowingKey", () => {
  it("does not change when the filter sidebar is opened or closed", () => {
    expect(keyFor({ ...filters, isOpen: false })).toBe(keyFor({ ...filters, isOpen: true }));
  });

  it("changes when a filter value changes", () => {
    expect(keyFor({ ...filters, statuses: ["booked"] })).not.toBe(keyFor(filters));
    expect(keyFor({ ...filters, salesOfficeUuid: "office-1" })).not.toBe(keyFor(filters));
  });

  it("changes with the search text, Show Deleted, the sort order and the tab", () => {
    const base = keyFor(filters);
    expect(keyFor(filters, "acme")).not.toBe(base);
    expect(keyFor(filters, "", true)).not.toBe(base);
    expect(
      narrowingKey(filters, "", false, { key: "event_name", direction: "asc" }, "all"),
    ).not.toBe(base);
    expect(keyFor(filters, "", false, "ar")).not.toBe(base);
  });
});
