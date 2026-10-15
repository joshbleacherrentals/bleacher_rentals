import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// Spec: docs/specs/quote-detail-03-history-panels.md §7 (test 4).
//
// The Contact and Venue history panels watch their events only while they are open. A server
// render shows one state at a time, so what is checked here is what each state draws and which
// hook calls it makes: none while closed, one while open.

type Buckets = {
  past: Array<Record<string, unknown>>;
  future: Array<Record<string, unknown>>;
} | null;

const mocks = vi.hoisted(() => ({
  contact: { buckets: null, isLoading: true } as { buckets: unknown; isLoading: boolean },
  venue: { buckets: null, isLoading: true } as { buckets: unknown; isLoading: boolean },
  contactCalls: [] as string[],
  venueCalls: [] as string[],
}));

vi.mock("../../../hooks/useContactEvents", () => ({
  useContactEvents: (id: string) => {
    mocks.contactCalls.push(id);
    return mocks.contact;
  },
}));
vi.mock("../../../hooks/useVenueEvents", () => ({
  useVenueEvents: (id: string) => {
    mocks.venueCalls.push(id);
    return mocks.venue;
  },
}));

import { ContactHistorySheet } from "./ContactHistorySheet";
import { VenueHistorySheet } from "./VenueHistorySheet";

const event = (id: string, over: Record<string, unknown> = {}) => ({
  id,
  eventName: `Event ${id}`,
  invoiceNumber: 1001,
  eventStart: "2026-01-01",
  eventEnd: "2026-01-02",
  eventStatus: "booked",
  ...over,
});

const contactSheet = (open: boolean) =>
  renderToStaticMarkup(
    <ContactHistorySheet
      contactId="c0"
      contactName="Dana Whitfield"
      open={open}
      onOpenChange={() => {}}
    />,
  );
const venueSheet = (open: boolean) =>
  renderToStaticMarkup(
    <VenueHistorySheet venueId="v0" venueName="Arena" open={open} onOpenChange={() => {}} />,
  );

beforeEach(() => {
  mocks.contact = { buckets: null, isLoading: true };
  mocks.venue = { buckets: null, isLoading: true };
  mocks.contactCalls = [];
  mocks.venueCalls = [];
});

describe("ContactHistorySheet", () => {
  it("draws nothing and watches nothing while closed", () => {
    expect(contactSheet(false)).toBe("");
    expect(mocks.contactCalls).toEqual([]);
  });

  it("watches its own contact while open", () => {
    contactSheet(true);
    expect(mocks.contactCalls.length).toBeGreaterThan(0);
    expect(new Set(mocks.contactCalls)).toEqual(new Set(["c0"]));
  });

  it("shows the title, the subtitle and a loading message until the events arrive", () => {
    const html = contactSheet(true);
    expect(html).toContain("Dana Whitfield");
    expect(html).toContain("Past and future events for this contact");
    expect(html).toContain("Loading events...");
  });

  it("lists Future and Past events with their counts, each tagged with how it matched", () => {
    mocks.contact = {
      isLoading: false,
      buckets: {
        future: [{ ...event("f1"), relation: "primary" }],
        past: [
          { ...event("p1"), relation: "finance" },
          { ...event("p2"), relation: "primary" },
        ],
      } as Buckets,
    };
    const html = contactSheet(true);
    expect(html).toContain("Future Events (1)");
    expect(html).toContain("Past Events (2)");
    expect(html).toContain("Event f1");
    expect(html).toContain("Event p1");
    expect(html).toMatch(/finance/);
    expect(html).toMatch(/primary/);
    expect(html).not.toContain("Loading events...");
  });

  it("says so when there are no events", () => {
    mocks.contact = { isLoading: false, buckets: { future: [], past: [] } as Buckets };
    const html = contactSheet(true);
    expect(html).toContain("No upcoming events");
    expect(html).toContain("No past events");
  });
});

describe("VenueHistorySheet", () => {
  it("draws nothing and watches nothing while closed", () => {
    expect(venueSheet(false)).toBe("");
    expect(mocks.venueCalls).toEqual([]);
  });

  it("watches its own venue while open", () => {
    venueSheet(true);
    expect(new Set(mocks.venueCalls)).toEqual(new Set(["v0"]));
  });

  it("lists the venue's events, with no tag", () => {
    mocks.venue = {
      isLoading: false,
      buckets: { future: [event("f1")], past: [event("p1")] } as Buckets,
    };
    const html = venueSheet(true);
    expect(html).toContain("Past and future events at this venue");
    expect(html).toContain("Future Events (1)");
    expect(html).toContain("Past Events (1)");
    expect(html).not.toMatch(/primary|finance/);
  });
});

describe("EventHistorySheet", () => {
  it("no longer fetches by itself: its data comes from the hooks", () => {
    // A server render never runs effects, so a render cannot show a one-time fetch. The source can.
    const source = readFileSync(join(__dirname, "EventHistorySheet.tsx"), "utf8");
    expect(source).not.toMatch(/fetchEvents/);
    expect(source).not.toMatch(/useEffect/);
    expect(source).not.toMatch(/db\/fetch(Contact|Venue)Events/);
  });
});
