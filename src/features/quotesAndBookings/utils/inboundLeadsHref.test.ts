import { describe, expect, it } from "vitest";
import { inboundLeadsHref } from "./inboundLeadsHref";
import { searchParamsToFilters } from "./filterUrlSync";
import { QUOTES_BOOKINGS_TABS } from "./listTabs";

describe("inboundLeadsHref", () => {
  it("names only the template", () => {
    expect(inboundLeadsHref()).toBe("/quotes-bookings?template=my_inbound_leads");
  });

  it("opens the list with the template on and no other filter", () => {
    const params = new URLSearchParams(inboundLeadsHref().split("?")[1]);
    const read = searchParamsToFilters(params, QUOTES_BOOKINGS_TABS);
    expect(read.leadsTemplate).toBe(true);
    expect(read.filters.statuses).toEqual([]);
    expect(read.filters.zoneUuids).toEqual([]);
    expect(read.filters.inbound).toBeNull();
  });
});
