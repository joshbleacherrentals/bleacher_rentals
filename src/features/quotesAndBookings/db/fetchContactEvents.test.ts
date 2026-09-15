import { describe, it, expect } from "vitest";
import { bucketAndSortContactEvents, type ContactEventRow } from "./fetchContactEvents";

const CONTACT_ID = "contact-1";
const NOW = "2026-09-11T12:00:00.000Z";

function makeRow(overrides: Partial<ContactEventRow> = {}): ContactEventRow {
  return {
    id: "evt-1",
    event_name: "Homecoming",
    invoice_number: 1001,
    event_start: "2026-01-01",
    event_end: "2026-01-02",
    event_status: "booked",
    contact_uuid: CONTACT_ID,
    finance_contact_uuid: null,
    ...overrides,
  };
}

describe("bucketAndSortContactEvents", () => {
  it("puts an event with event_end before now into past", () => {
    const rows = [makeRow({ id: "past-1", event_end: "2026-01-02" })];
    const { past, future } = bucketAndSortContactEvents(rows, CONTACT_ID, NOW);
    expect(past.map((e) => e.id)).toEqual(["past-1"]);
    expect(future).toEqual([]);
  });

  it("puts an event with event_end after now into future", () => {
    const rows = [makeRow({ id: "future-1", event_end: "2026-12-31" })];
    const { past, future } = bucketAndSortContactEvents(rows, CONTACT_ID, NOW);
    expect(future.map((e) => e.id)).toEqual(["future-1"]);
    expect(past).toEqual([]);
  });

  it("treats an event with no event_end as future", () => {
    const rows = [makeRow({ id: "no-end", event_end: null })];
    const { future, past } = bucketAndSortContactEvents(rows, CONTACT_ID, NOW);
    expect(future.map((e) => e.id)).toEqual(["no-end"]);
    expect(past).toEqual([]);
  });

  it("tags relation as primary when contact_uuid matches", () => {
    const rows = [
      makeRow({
        id: "e1",
        contact_uuid: CONTACT_ID,
        finance_contact_uuid: null,
        event_end: "2027-01-01",
      }),
    ];
    const { future } = bucketAndSortContactEvents(rows, CONTACT_ID, NOW);
    expect(future[0].relation).toBe("primary");
  });

  it("tags relation as finance when only finance_contact_uuid matches", () => {
    const rows = [
      makeRow({
        id: "e1",
        contact_uuid: "someone-else",
        finance_contact_uuid: CONTACT_ID,
        event_end: "2027-01-01",
      }),
    ];
    const { future } = bucketAndSortContactEvents(rows, CONTACT_ID, NOW);
    expect(future[0].relation).toBe("finance");
  });

  it("sorts future events ascending (soonest first) by event_end", () => {
    const rows = [
      makeRow({ id: "later", event_end: "2027-06-01" }),
      makeRow({ id: "sooner", event_end: "2026-10-01" }),
    ];
    const { future } = bucketAndSortContactEvents(rows, CONTACT_ID, NOW);
    expect(future.map((e) => e.id)).toEqual(["sooner", "later"]);
  });

  it("sorts past events descending (most recently ended first) by event_end", () => {
    const rows = [
      makeRow({ id: "older", event_end: "2025-01-01" }),
      makeRow({ id: "recent", event_end: "2026-08-01" }),
    ];
    const { past } = bucketAndSortContactEvents(rows, CONTACT_ID, NOW);
    expect(past.map((e) => e.id)).toEqual(["recent", "older"]);
  });

  it("splits a mixed list into both buckets correctly", () => {
    const rows = [
      makeRow({ id: "p1", event_end: "2025-01-01" }),
      makeRow({ id: "f1", event_end: "2027-01-01" }),
      makeRow({ id: "p2", event_end: "2026-01-01" }),
    ];
    const { past, future } = bucketAndSortContactEvents(rows, CONTACT_ID, NOW);
    expect(past.map((e) => e.id)).toEqual(["p2", "p1"]);
    expect(future.map((e) => e.id)).toEqual(["f1"]);
  });

  it("maps row fields onto the ContactEvent shape", () => {
    const rows = [
      makeRow({
        id: "e1",
        event_name: "Big Game",
        invoice_number: 4242,
        event_start: "2026-11-01",
        event_end: "2026-11-02",
        event_status: "quoted",
      }),
    ];
    const { future } = bucketAndSortContactEvents(rows, CONTACT_ID, NOW);
    expect(future[0]).toEqual({
      id: "e1",
      eventName: "Big Game",
      invoiceNumber: 4242,
      eventStart: "2026-11-01",
      eventEnd: "2026-11-02",
      eventStatus: "quoted",
      relation: "primary",
    });
  });
});
