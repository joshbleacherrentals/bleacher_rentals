import { describe, expect, it } from "vitest";
import { inboundLeadsHref } from "./inboundLeadsHref";
import { inboundLeadsFilters } from "./inboundLeadsZones";
import { searchParamsToFilters } from "./filterUrlSync";
import { QUOTES_BOOKINGS_TABS } from "./listTabs";

describe("inboundLeadsHref", () => {
  it("opens the list on the template: the same filters, oldest first", () => {
    const href = inboundLeadsHref(["zone-1", "unknown"]);
    expect(href.startsWith("/quotes-bookings?")).toBe(true);

    const params = new URLSearchParams(href.split("?")[1]);
    const read = searchParamsToFilters(params, QUOTES_BOOKINGS_TABS);
    const { isOpen: _isOpen, ...expected } = inboundLeadsFilters(["zone-1", "unknown"]);
    expect(read.filters).toEqual(expected);
    expect(read.sort).toEqual({ key: "created_at", direction: "asc" });
    expect(read.searchQuery).toBe("");
    expect(read.showDeleted).toBe(false);
  });

  it("leaves the zones out for someone who has no zone filter", () => {
    const params = new URLSearchParams(inboundLeadsHref([]).split("?")[1]);
    expect(params.get("zones")).toBeNull();
    expect(params.get("inbound")).toBe("1");
  });
});
