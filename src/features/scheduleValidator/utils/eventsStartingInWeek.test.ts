import { describe, it, expect } from "vitest";
import { eventsStartingInWeek } from "./eventsStartingInWeek";

const WEEK = "2026-11-09"; // Monday; the week ends Sunday 2026-11-15

const row = (id: string, name: string | null, eventStart: string | null) => ({
  id,
  eventName: name,
  eventStart,
});

describe("eventsStartingInWeek", () => {
  it("keeps events starting from Monday through Sunday and drops the days either side", () => {
    const rows = [
      row("before", "Before", "2026-11-08T12:00:00"),
      row("mon", "Monday", "2026-11-09T09:00:00"),
      row("sun", "Sunday", "2026-11-15T20:00:00"),
      row("after", "After", "2026-11-16T09:00:00"),
    ];
    expect(eventsStartingInWeek(rows, WEEK).map((e) => e.id)).toEqual(["mon", "sun"]);
  });

  it("orders by start, then name", () => {
    const rows = [
      row("c", "Zed", "2026-11-12T10:00:00"),
      row("a", "Bee", "2026-11-10T10:00:00"),
      row("b", "Ace", "2026-11-10T10:00:00"),
    ];
    expect(eventsStartingInWeek(rows, WEEK).map((e) => e.id)).toEqual(["b", "a", "c"]);
  });

  it("skips events with no start and names an unnamed event", () => {
    const rows = [row("none", "No start", null), row("x", null, "2026-11-10T10:00:00")];
    expect(eventsStartingInWeek(rows, WEEK)).toEqual([{ id: "x", name: "Untitled event" }]);
  });
});
