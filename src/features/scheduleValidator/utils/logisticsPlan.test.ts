import { describe, it, expect } from "vitest";
import {
  checkLogisticsPlans,
  lastKnownLocation,
  type HistoryItem,
  type PlannedEvent,
} from "./logisticsPlan";

const item = (
  kind: HistoryItem["kind"],
  id: string,
  date: string,
  street: string | null,
  label = id,
): HistoryItem => ({ kind, id, date, street, label });

const START = "2026-11-10";

describe("lastKnownLocation", () => {
  it("takes the latest item on or before the start date", () => {
    const history = [
      item("event", "e1", "2026-11-01", "1 Main St"),
      item("work_tracker", "w1", "2026-11-08", "2 Oak Ave"),
      item("event", "e2", "2026-11-12", "3 Pine Rd"),
    ];
    expect(lastKnownLocation(history, START, "current")?.id).toBe("w1");
  });

  it("includes an item dated on the start date itself", () => {
    const history = [item("work_tracker", "w1", START, "2 Oak Ave")];
    expect(lastKnownLocation(history, START, "current")?.id).toBe("w1");
  });

  it("ignores the event being checked", () => {
    const history = [item("event", "current", START, "9 Here St")];
    expect(lastKnownLocation(history, START, "current")).toBeNull();
  });

  it("prefers the work tracker, then maintenance, then the event, when they share a date", () => {
    const day = "2026-11-08";
    const all = [
      item("event", "e", day, "a"),
      item("maintenance", "m", day, "b"),
      item("work_tracker", "w", day, "c"),
    ];
    expect(lastKnownLocation(all, START, "current")?.id).toBe("w");
    expect(lastKnownLocation(all.slice(0, 2), START, "current")?.id).toBe("m");
  });

  it("is null when there is no earlier history", () => {
    expect(lastKnownLocation([], START, "current")).toBeNull();
  });
});

const planned = (history: HistoryItem[], overrides: Partial<PlannedEvent> = {}): PlannedEvent => ({
  eventId: "current",
  eventName: "The Event",
  startDate: START,
  street: "9 Here St",
  bleachers: [{ bleacherUuid: "b1", bleacherNumber: 1, bleacherTypeName: "7 Row", history }],
  ...overrides,
});

describe("checkLogisticsPlans", () => {
  it("matches when the last work tracker dropped the bleacher at the event's street", () => {
    const [event] = checkLogisticsPlans([
      planned([item("work_tracker", "w", "2026-11-08", "9 Here St.")]),
    ]);
    expect(event.bleachers[0].matches).toBe(true);
    expect(event.bleachers[0].last?.kind).toBe("work_tracker");
  });

  it("does not match when the last place is a different street", () => {
    const [event] = checkLogisticsPlans([
      planned([item("work_tracker", "w", "2026-11-08", "2 Oak Ave")]),
    ]);
    expect(event.bleachers[0].matches).toBe(false);
  });

  it("matches a bleacher still at the previous event when it is at the same street", () => {
    const [event] = checkLogisticsPlans([
      planned([item("event", "prev", "2026-11-09", "9 here st")]),
    ]);
    expect(event.bleachers[0].matches).toBe(true);
  });

  it("does not match when the last item has no street, or the event has none", () => {
    const noStreet = checkLogisticsPlans([planned([item("event", "prev", "2026-11-09", null)])]);
    expect(noStreet[0].bleachers[0].matches).toBe(false);
    const eventNoStreet = checkLogisticsPlans([
      planned([item("event", "prev", "2026-11-09", "9 Here St")], { street: null }),
    ]);
    expect(eventNoStreet[0].bleachers[0].matches).toBe(false);
  });

  it("does not match a bleacher with no history, and says it has no last location", () => {
    const [event] = checkLogisticsPlans([planned([])]);
    expect(event.bleachers[0]).toMatchObject({ last: null, matches: false });
  });

  it("ignores items after the start date, so a later work tracker cannot cover it", () => {
    const history = [
      item("event", "prev", "2026-11-01", "9 Here St"),
      item("work_tracker", "later", "2026-11-11", "2 Oak Ave"),
    ];
    const [event] = checkLogisticsPlans([planned(history)]);
    expect(event.bleachers[0].last?.id).toBe("prev");
    expect(event.bleachers[0].matches).toBe(true);
  });

  it("orders events by start then name, and bleachers by number", () => {
    const b = (n: number) => ({
      bleacherUuid: `b${n}`,
      bleacherNumber: n,
      bleacherTypeName: null,
      history: [],
    });
    const result = checkLogisticsPlans([
      planned([], {
        eventId: "z",
        eventName: "Zed",
        startDate: "2026-11-11",
        bleachers: [b(2), b(1)],
      }),
      planned([], {
        eventId: "a",
        eventName: "Ace",
        startDate: "2026-11-10",
        bleachers: [b(30), b(4)],
      }),
    ]);
    expect(result.map((e) => e.eventId)).toEqual(["a", "z"]);
    expect(result[0].bleachers.map((x) => x.bleacherNumber)).toEqual([4, 30]);
  });

  it("leaves out an event with no bleachers assigned", () => {
    expect(checkLogisticsPlans([planned([], { bleachers: [] })])).toEqual([]);
  });
});
