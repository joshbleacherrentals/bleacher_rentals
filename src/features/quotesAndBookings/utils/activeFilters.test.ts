import { describe, it, expect } from "vitest";
import type { QuotesBookingsFilters } from "../types";
import {
  describeActiveFilters,
  withoutFilter,
  type ActiveFilterState,
  type ActiveFilterNames,
} from "./activeFilters";

const noFilters: Omit<QuotesBookingsFilters, "isOpen"> = {
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
  inbound: null,
  zoneUuids: [],
  salesOfficeUuid: null,
};

const names: ActiveFilterNames = {
  userName: (id) => (id === "am-1" ? "Dana Whitfield" : undefined),
  officeName: (id) => (id === "office-1" ? "Bleacher Rentals Florida LLC" : undefined),
  zoneName: (id) => (id === "zone-1" ? "Zone 1" : undefined),
};

function state(overrides: Partial<ActiveFilterState> = {}): ActiveFilterState {
  return {
    filters: noFilters,
    searchQuery: "",
    showDeleted: false,
    showStatus: true,
    ...overrides,
  };
}

const labels = (s: ActiveFilterState) => describeActiveFilters(s, names).map((f) => f.label);

describe("describeActiveFilters", () => {
  it("has nothing to show when nothing narrows the list", () => {
    expect(describeActiveFilters(state(), names)).toEqual([]);
  });

  it("names every applied filter, one chip each, in the order the panel lists them", () => {
    const all = state({
      searchQuery: "  acme ",
      showDeleted: true,
      filters: {
        statuses: ["quoted", "booked"],
        createdFrom: "2026-09-01",
        createdTo: "2026-09-30",
        eventFrom: "2026-10-01",
        eventTo: null,
        bookedFrom: null,
        bookedTo: "2026-09-15",
        accountManagerUserUuid: "am-1",
        inGoodShuffle: true,
        inQuickBooks: false,
        salesOfficeUuid: "office-1",
        inbound: true,
        zoneUuids: ["zone-1", "unknown"],
      },
    });
    expect(describeActiveFilters(all, names)).toEqual([
      { key: "search", label: "Search: “acme”" },
      { key: "statuses", label: "Status: Quoted, Booked" },
      { key: "created", label: "Created: Sep 1, 2026 – Sep 30, 2026" },
      { key: "event", label: "Event Start: from Oct 1, 2026" },
      { key: "booked", label: "Booked: until Sep 15, 2026" },
      { key: "accountManager", label: "Account Manager: Dana Whitfield" },
      { key: "salesOffice", label: "Sales Office: Bleacher Rentals Florida LLC" },
      { key: "goodShuffle", label: "In GoodShuffle: Yes" },
      { key: "quickBooks", label: "In QuickBooks: No" },
      { key: "inbound", label: "Inbound: Yes" },
      { key: "zones", label: "Zones: Zone 1, Zone Unknown" },
      { key: "showDeleted", label: "Deleted only" },
    ]);
  });

  it("leaves Status out where the page does not offer it (the AR tabs)", () => {
    const withStatus = { ...noFilters, statuses: ["booked"] };
    expect(labels(state({ showStatus: false, filters: withStatus }))).toEqual([]);
    expect(labels(state({ showStatus: true, filters: withStatus }))).toEqual(["Status: Booked"]);
  });

  it("names a zone that has not loaded as Unknown, and the no-zone choice as Zone Unknown", () => {
    const filters = { ...noFilters, zoneUuids: ["gone", "unknown"] };
    expect(labels(state({ filters }))).toEqual(["Zones: Unknown, Zone Unknown"]);
  });

  it("labels the matches-nothing zone choice as No zones", () => {
    const filters = { ...noFilters, zoneUuids: ["no-zones"] };
    expect(labels(state({ filters }))).toEqual(["Zones: No zones"]);
  });

  it("still says what is filtered when a name has not loaded", () => {
    const filters = { ...noFilters, accountManagerUserUuid: "gone", salesOfficeUuid: "gone" };
    expect(labels(state({ filters }))).toEqual([
      "Account Manager: Unknown",
      "Sales Office: Unknown",
    ]);
  });
});

describe("withoutFilter", () => {
  const full: QuotesBookingsFilters = {
    isOpen: true,
    statuses: ["lost"],
    createdFrom: "2026-09-01",
    createdTo: "2026-09-30",
    eventFrom: "2026-10-01",
    eventTo: "2026-10-31",
    bookedFrom: "2026-08-01",
    bookedTo: "2026-08-31",
    accountManagerUserUuid: "am-1",
    inGoodShuffle: false,
    inQuickBooks: true,
    salesOfficeUuid: "office-1",
    inbound: false,
    zoneUuids: ["zone-1"],
  };

  it("clears one filter and leaves the others alone", () => {
    expect(withoutFilter(full, "created")).toEqual({
      ...full,
      createdFrom: null,
      createdTo: null,
    });
    expect(withoutFilter(full, "statuses")).toEqual({ ...full, statuses: [] });
    expect(withoutFilter(full, "event")).toEqual({ ...full, eventFrom: null, eventTo: null });
    expect(withoutFilter(full, "booked")).toEqual({ ...full, bookedFrom: null, bookedTo: null });
    expect(withoutFilter(full, "accountManager")).toEqual({
      ...full,
      accountManagerUserUuid: null,
    });
    expect(withoutFilter(full, "salesOffice")).toEqual({ ...full, salesOfficeUuid: null });
    expect(withoutFilter(full, "goodShuffle")).toEqual({ ...full, inGoodShuffle: null });
    expect(withoutFilter(full, "quickBooks")).toEqual({ ...full, inQuickBooks: null });
    expect(withoutFilter(full, "inbound")).toEqual({ ...full, inbound: null });
    expect(withoutFilter(full, "zones")).toEqual({ ...full, zoneUuids: [] });
  });

  it("does not touch the panel for filters that live outside it", () => {
    expect(withoutFilter(full, "search")).toBe(full);
    expect(withoutFilter(full, "showDeleted")).toBe(full);
  });
});
