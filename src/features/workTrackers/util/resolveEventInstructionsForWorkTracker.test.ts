import { describe, expect, it } from "vitest";
import {
  resolveEventInstructions,
  type EventInstructionsRow,
} from "./resolveEventInstructionsForWorkTracker";

function row(overrides: Partial<EventInstructionsRow> = {}): EventInstructionsRow {
  return {
    eventStart: "2026-06-10T00:00:00.000Z",
    booked: true,
    pickupInstructions: null,
    dropoffInstructions: null,
    ...overrides,
  };
}

describe("resolveEventInstructions", () => {
  it("past picks the latest booked event on or before targetDate", () => {
    const rows = [
      row({ eventStart: "2026-06-01T00:00:00.000Z", pickupInstructions: "too early" }),
      row({ eventStart: "2026-06-05T00:00:00.000Z", pickupInstructions: "correct" }),
      row({ eventStart: "2026-06-20T00:00:00.000Z", pickupInstructions: "in the future" }),
    ];
    expect(resolveEventInstructions(rows, "2026-06-10", "past")).toBe("correct");
  });

  it("future picks the earliest booked event on or after targetDate", () => {
    const rows = [
      row({ eventStart: "2026-06-01T00:00:00.000Z", dropoffInstructions: "too early" }),
      row({ eventStart: "2026-06-15T00:00:00.000Z", dropoffInstructions: "correct" }),
      row({ eventStart: "2026-06-20T00:00:00.000Z", dropoffInstructions: "too late... wait no" }),
    ];
    expect(resolveEventInstructions(rows, "2026-06-10", "future")).toBe("correct");
  });

  it("ignores non-booked events even when nearest", () => {
    const rows = [
      row({
        eventStart: "2026-06-09T00:00:00.000Z",
        booked: false,
        pickupInstructions: "unbooked",
      }),
      row({ eventStart: "2026-06-05T00:00:00.000Z", pickupInstructions: "booked and further" }),
    ];
    expect(resolveEventInstructions(rows, "2026-06-10", "past")).toBe("booked and further");
  });

  it("skips a nearer candidate with blank instructions in favour of the next-nearest qualifying one", () => {
    const rows = [
      row({ eventStart: "2026-06-09T00:00:00.000Z", pickupInstructions: "" }),
      row({ eventStart: "2026-06-08T00:00:00.000Z", pickupInstructions: null }),
      row({ eventStart: "2026-06-05T00:00:00.000Z", pickupInstructions: "the real answer" }),
    ];
    expect(resolveEventInstructions(rows, "2026-06-10", "past")).toBe("the real answer");
  });

  it("reads pickupInstructions for past and dropoffInstructions for future", () => {
    const rows = [
      row({
        eventStart: "2026-06-05T00:00:00.000Z",
        pickupInstructions: "pickup text",
        dropoffInstructions: "dropoff text",
      }),
    ];
    expect(resolveEventInstructions(rows, "2026-06-10", "past")).toBe("pickup text");
    expect(resolveEventInstructions(rows, "2026-06-01", "future")).toBe("dropoff text");
  });

  it("an event exactly on targetDate is in range for both directions", () => {
    const rows = [row({ eventStart: "2026-06-10T00:00:00.000Z", pickupInstructions: "same day" })];
    expect(resolveEventInstructions(rows, "2026-06-10", "past")).toBe("same day");
  });

  it("returns null when nothing qualifies", () => {
    expect(resolveEventInstructions([], "2026-06-10", "past")).toBeNull();
    expect(
      resolveEventInstructions(
        [
          row({
            eventStart: "2026-06-20T00:00:00.000Z",
            pickupInstructions: "too far in the future",
          }),
        ],
        "2026-06-10",
        "past",
      ),
    ).toBeNull();
  });

  it("trims surrounding whitespace off the winning text", () => {
    const rows = [
      row({ eventStart: "2026-06-05T00:00:00.000Z", pickupInstructions: "  padded  " }),
    ];
    expect(resolveEventInstructions(rows, "2026-06-10", "past")).toBe("padded");
  });
});
