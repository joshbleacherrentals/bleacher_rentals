import { describe, it, expect } from "vitest";
import type { EventLogisticsCheck } from "./logisticsPlan";
import { buildEventData, eventDataRoles, type EventDataInput } from "./eventData";

const bleacher = (over: object) => ({
  bleacherUuid: "b",
  bleacherNumber: 1,
  bleacherTypeName: null,
  matches: false,
  last: null,
  ...over,
});

describe("eventDataRoles", () => {
  it("lists the week's events and the events their bleachers are picked up from", () => {
    const events = [
      {
        eventId: "e1",
        bleachers: [
          bleacher({ last: { kind: "event", id: "prev", date: "2026-09-10" } }),
          bleacher({ matches: true, last: { kind: "event", id: "already-there" } }),
          bleacher({ last: { kind: "work_tracker", id: "wt" } }),
        ],
      },
      { eventId: "e2", bleachers: [bleacher({ last: { kind: "event", id: "e1" } })] },
    ] as unknown as EventLogisticsCheck[];
    expect(Object.fromEntries(eventDataRoles(events))).toEqual({
      e1: ["starts", "pickup"],
      prev: ["pickup"],
      e2: ["starts"],
    });
  });
});

describe("buildEventData", () => {
  const event = (over: Partial<EventDataInput>): EventDataInput => ({
    eventId: "e",
    eventName: "Fair",
    startDate: "2026-09-15",
    addressUuid: "a",
    address: null,
    roles: ["starts"],
    ...over,
  });

  it("checks the address and orders by start date, then name", () => {
    const result = buildEventData([
      event({ eventId: "b", eventName: "Rodeo", startDate: "2026-09-16" }),
      event({ eventId: "a", eventName: "Zoo", startDate: "2026-09-14" }),
      event({ eventId: "c", eventName: "Expo", startDate: "2026-09-14" }),
    ]);
    expect(result.map((e) => e.eventId)).toEqual(["c", "a", "b"]);
    expect(result[0].results.address).toEqual({ ok: false, problem: "No address" });
    expect(result[0].ok).toBe(false);
  });
});
