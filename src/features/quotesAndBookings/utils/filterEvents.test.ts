import { describe, it, expect } from "vitest";
import { filterQuotesBookingsEvents } from "./filterEvents";
import type { QuotesBookingsEvent, QuotesBookingsFilters } from "../types";

const noFilters: QuotesBookingsFilters = {
  isOpen: false,
  statuses: [],
  createdFrom: null,
  createdTo: null,
  eventFrom: null,
  eventTo: null,
  bookedFrom: null,
  bookedTo: null,
  quoteSentFrom: null,
  quoteSentTo: null,
  accountManagerUserUuid: null,
  inGoodShuffle: null,
  inQuickBooks: null,
  inbound: null,
  zoneUuids: [],
  salesOfficeUuid: null,
};

const event = (id: string, goodshuffle_url: string | null): QuotesBookingsEvent =>
  ({ id, goodshuffle_url }) as QuotesBookingsEvent;

const linked = event("linked", "https://goodshuffle.com/e/123");
const absent = event("absent", null);
const blank = event("blank", "");
const whitespace = event("whitespace", "   ");

const ids = (filters: Partial<QuotesBookingsFilters>) =>
  filterQuotesBookingsEvents([linked, absent, blank, whitespace], {
    ...noFilters,
    ...filters,
  }).map((e) => e.id);

describe("In GoodShuffle filter", () => {
  it("shows everything when the filter is off", () => {
    expect(ids({ inGoodShuffle: null })).toEqual(["linked", "absent", "blank", "whitespace"]);
  });

  it("shows only events carrying a URL", () => {
    expect(ids({ inGoodShuffle: true })).toEqual(["linked"]);
  });

  it("shows only events without one", () => {
    expect(ids({ inGoodShuffle: false })).toEqual(["absent", "blank", "whitespace"]);
  });

  it("treats a blank or whitespace-only URL as not in GoodShuffle", () => {
    // A field someone opened and left empty. Counting it as linked would tell
    // the user an event is synced when it is not — and there are such rows.
    expect(ids({ inGoodShuffle: true })).not.toContain("blank");
    expect(ids({ inGoodShuffle: true })).not.toContain("whitespace");
  });

  it("combines with the other filters rather than replacing them", () => {
    const quoted = { ...event("quoted", "https://x"), event_status: "quoted" };
    const booked = { ...event("booked", "https://x"), event_status: "booked" };
    const result = filterQuotesBookingsEvents([quoted, booked, absent], {
      ...noFilters,
      statuses: ["quoted"],
      inGoodShuffle: true,
    });
    expect(result.map((e) => e.id)).toEqual(["quoted"]);
  });
});

const officeEvent = (id: string, sales_office_uuid: string | null): QuotesBookingsEvent =>
  ({ id, sales_office_uuid }) as QuotesBookingsEvent;

describe("Sales Office filter", () => {
  const north = officeEvent("north", "office-north");
  const south = officeEvent("south", "office-south");
  const unassigned = officeEvent("unassigned", null);

  const officeIds = (filters: Partial<QuotesBookingsFilters>) =>
    filterQuotesBookingsEvents([north, south, unassigned], {
      ...noFilters,
      ...filters,
    }).map((e) => e.id);

  it("shows every event when no office is picked", () => {
    expect(officeIds({ salesOfficeUuid: null })).toEqual(["north", "south", "unassigned"]);
  });

  it("shows only the events belonging to the picked office", () => {
    expect(officeIds({ salesOfficeUuid: "office-north" })).toEqual(["north"]);
  });

  it("hides events with no office once one is picked", () => {
    // An event without an office belongs to no office, so it cannot pass a
    // filter that asks for a specific one.
    expect(officeIds({ salesOfficeUuid: "office-south" })).not.toContain("unassigned");
  });

  it("combines with the other filters rather than replacing them", () => {
    const quoted = { ...officeEvent("quoted", "office-north"), event_status: "quoted" };
    const booked = { ...officeEvent("booked", "office-north"), event_status: "booked" };
    const result = filterQuotesBookingsEvents([quoted, booked, south], {
      ...noFilters,
      statuses: ["quoted"],
      salesOfficeUuid: "office-north",
    });
    expect(result.map((e) => e.id)).toEqual(["quoted"]);
  });
});

const qboEvent = (id: string, is_qbo: number | null): QuotesBookingsEvent =>
  ({ id, is_qbo }) as QuotesBookingsEvent;

const inQbo = qboEvent("in-qbo", 1);
const notInQbo = qboEvent("not-in-qbo", 0);
const unsetQbo = qboEvent("unset-qbo", null);

const qboIds = (filters: Partial<QuotesBookingsFilters>) =>
  filterQuotesBookingsEvents([inQbo, notInQbo, unsetQbo], {
    ...noFilters,
    ...filters,
  }).map((e) => e.id);

describe("In QuickBooks filter", () => {
  it("shows everything when the filter is off", () => {
    expect(qboIds({ inQuickBooks: null })).toEqual(["in-qbo", "not-in-qbo", "unset-qbo"]);
  });

  it("shows only events flagged as entered in QuickBooks", () => {
    expect(qboIds({ inQuickBooks: true })).toEqual(["in-qbo"]);
  });

  it("shows only events not flagged", () => {
    expect(qboIds({ inQuickBooks: false })).toEqual(["not-in-qbo", "unset-qbo"]);
  });

  it("treats a missing flag as not in QuickBooks", () => {
    // The column defaults to false, and older rows sync as null — to a user
    // neither one has been entered in QuickBooks.
    expect(qboIds({ inQuickBooks: true })).not.toContain("unset-qbo");
  });

  it("combines with the other filters rather than replacing them", () => {
    const quoted = { ...qboEvent("quoted", 1), event_status: "quoted" };
    const booked = { ...qboEvent("booked", 1), event_status: "booked" };
    const result = filterQuotesBookingsEvents([quoted, booked, notInQbo], {
      ...noFilters,
      statuses: ["quoted"],
      inQuickBooks: true,
    });
    expect(result.map((e) => e.id)).toEqual(["quoted"]);
  });
});

describe("Inbound filter", () => {
  const web = {
    ...event("web", null),
    lead_submission: '{"name":"Ada"}',
  } as QuotesBookingsEvent & { lead_submission: string };
  const app = event("app", null);
  const emptyText = { ...event("empty", null), lead_submission: "  " } as QuotesBookingsEvent;
  const all = [web, app, emptyText];
  const run = (inbound: boolean | null) =>
    filterQuotesBookingsEvents(all, { ...noFilters, inbound }).map((e) => e.id);

  it("shows everything when it is off", () => {
    expect(run(null)).toEqual(["web", "app", "empty"]);
  });

  it("shows only quotes made from the website form", () => {
    expect(run(true)).toEqual(["web"]);
  });

  it("shows only the others, a blank submission counting as none", () => {
    expect(run(false)).toEqual(["app", "empty"]);
  });
});

describe("Zones filter", () => {
  const inZone = (id: string, zone_uuid: string | null) =>
    ({ ...event(id, null), zone_uuid }) as QuotesBookingsEvent;
  const rows = [
    inZone("a", "zone-1"),
    inZone("b", "zone-2"),
    inZone("c", null),
    inZone("d", "zone-1"),
  ];
  const run = (zoneUuids: string[]) =>
    filterQuotesBookingsEvents(rows, { ...noFilters, zoneUuids }).map((e) => e.id);

  it("shows every zone when none is chosen", () => {
    expect(run([])).toEqual(["a", "b", "c", "d"]);
  });

  it("shows the events of the chosen zones, any number of them", () => {
    expect(run(["zone-1"])).toEqual(["a", "d"]);
    expect(run(["zone-1", "zone-2"])).toEqual(["a", "b", "d"]);
  });

  it("treats an event with no zone as Zone Unknown", () => {
    expect(run(["unknown"])).toEqual(["c"]);
    expect(run(["zone-2", "unknown"])).toEqual(["b", "c"]);
  });

  it("combines with the other filters", () => {
    const booked = { ...inZone("e", "zone-1"), event_status: "booked" } as QuotesBookingsEvent;
    const quoted = { ...inZone("f", "zone-1"), event_status: "quoted" } as QuotesBookingsEvent;
    expect(
      filterQuotesBookingsEvents([booked, quoted], {
        ...noFilters,
        zoneUuids: ["zone-1"],
        statuses: ["booked"],
      }).map((e) => e.id),
    ).toEqual(["e"]);
  });
});
