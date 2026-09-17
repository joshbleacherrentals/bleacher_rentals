import { describe, expect, it } from "vitest";
import {
  resolveAdjacentEvents,
  type AdjacentEventCandidate,
} from "./resolveAdjacentEventsForWorkTracker";

function row(overrides: Partial<AdjacentEventCandidate> = {}): AdjacentEventCandidate {
  return {
    id: "evt-1",
    eventName: "Homecoming",
    eventStart: "2026-06-10T00:00:00.000Z",
    eventEnd: "2026-06-11T00:00:00.000Z",
    booked: true,
    ...overrides,
  };
}

describe("resolveAdjacentEvents", () => {
  it("picks the nearest booked event before and after targetDate", () => {
    const rows = [
      row({ id: "too-early", eventStart: "2026-06-01T00:00:00.000Z" }),
      row({ id: "previous", eventStart: "2026-06-05T00:00:00.000Z" }),
      row({ id: "next", eventStart: "2026-06-15T00:00:00.000Z" }),
      row({ id: "too-late", eventStart: "2026-06-20T00:00:00.000Z" }),
    ];
    const result = resolveAdjacentEvents(rows, "2026-06-10");
    expect(result.previous?.id).toBe("previous");
    expect(result.next?.id).toBe("next");
  });

  it("ignores non-booked events even when nearest", () => {
    const rows = [
      row({ id: "unbooked", eventStart: "2026-06-09T00:00:00.000Z", booked: false }),
      row({ id: "booked-further", eventStart: "2026-06-05T00:00:00.000Z" }),
    ];
    expect(resolveAdjacentEvents(rows, "2026-06-10").previous?.id).toBe("booked-further");
  });

  it("an event exactly on targetDate counts for both directions", () => {
    const rows = [row({ id: "same-day", eventStart: "2026-06-10T00:00:00.000Z" })];
    const result = resolveAdjacentEvents(rows, "2026-06-10");
    expect(result.previous?.id).toBe("same-day");
    expect(result.next?.id).toBe("same-day");
  });

  it("returns nulls when nothing qualifies", () => {
    expect(resolveAdjacentEvents([], "2026-06-10")).toEqual({ previous: null, next: null });
  });

  it("carries eventName and eventEnd through on the winner", () => {
    const rows = [
      row({
        id: "evt-2",
        eventName: "State Finals",
        eventStart: "2026-06-05T00:00:00.000Z",
        eventEnd: "2026-06-07T00:00:00.000Z",
      }),
    ];
    const result = resolveAdjacentEvents(rows, "2026-06-10");
    expect(result.previous).toEqual({
      id: "evt-2",
      eventName: "State Finals",
      eventStart: "2026-06-05T00:00:00.000Z",
      eventEnd: "2026-06-07T00:00:00.000Z",
    });
  });
});
