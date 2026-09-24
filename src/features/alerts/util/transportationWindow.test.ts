import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  TRANSPORTATION_TITLE,
  hideOutOfWindowTransportationAlerts,
  isInTransportationWindow,
  transportationWindowEnd,
} from "./transportationWindow";

// Toronto noon on each day, so the UTC date is the same and the test says what it means.
const at = (isoDate: string) => new Date(`${isoDate}T16:00:00Z`);

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe("transportationWindowEnd", () => {
  it("ends this Sunday on Monday, Tuesday and Wednesday", () => {
    vi.setSystemTime(at("2026-09-14")); // Monday
    expect(transportationWindowEnd()).toBe("2026-09-20");
    vi.setSystemTime(at("2026-09-15")); // Tuesday
    expect(transportationWindowEnd()).toBe("2026-09-20");
    vi.setSystemTime(at("2026-09-16")); // Wednesday
    expect(transportationWindowEnd()).toBe("2026-09-20");
  });

  it("jumps to next Sunday on Thursday", () => {
    vi.setSystemTime(at("2026-09-17")); // Thursday
    expect(transportationWindowEnd()).toBe("2026-09-27");
  });

  it("stays on next Sunday through the weekend", () => {
    vi.setSystemTime(at("2026-09-18")); // Friday
    expect(transportationWindowEnd()).toBe("2026-09-27");
    vi.setSystemTime(at("2026-09-19")); // Saturday
    expect(transportationWindowEnd()).toBe("2026-09-27");
    vi.setSystemTime(at("2026-09-20")); // Sunday
    expect(transportationWindowEnd()).toBe("2026-09-27");
  });

  it("uses Toronto's day, not UTC's", () => {
    // 21:00 Wednesday in Toronto is already Thursday in UTC, which would jump a week early.
    vi.setSystemTime(new Date("2026-09-17T01:00:00Z"));
    expect(transportationWindowEnd()).toBe("2026-09-20");
  });
});

describe("isInTransportationWindow", () => {
  beforeEach(() => vi.setSystemTime(at("2026-09-17"))); // Thursday → window is Sep 17..27

  it("includes an event starting today and one starting on the closing Sunday", () => {
    expect(isInTransportationWindow("2026-09-17")).toBe(true);
    expect(isInTransportationWindow("2026-09-27")).toBe(true);
  });

  it("excludes an event that already started, even if it is still running", () => {
    expect(isInTransportationWindow("2026-09-16")).toBe(false);
  });

  it("excludes an event starting after the window closes", () => {
    expect(isInTransportationWindow("2026-09-28")).toBe(false);
  });

  it("excludes an event with no start date", () => {
    expect(isInTransportationWindow(null)).toBe(false);
    expect(isInTransportationWindow("")).toBe(false);
  });

  it("reads a timestamp as its Toronto day", () => {
    expect(isInTransportationWindow("2026-09-17T12:00:00Z")).toBe(true);
  });
});

describe("hideOutOfWindowTransportationAlerts", () => {
  beforeEach(() => vi.setSystemTime(at("2026-09-17"))); // Thursday → window is Sep 17..27

  const row = (id: string, title: string, entityStartDate: string | null) => ({
    id,
    title,
    entityStartDate,
  });

  it("keeps transportation alerts inside the window and drops the rest", () => {
    const rows = [
      row("in", TRANSPORTATION_TITLE, "2026-09-20"),
      row("closing-day", TRANSPORTATION_TITLE, "2026-09-27"),
      row("after", TRANSPORTATION_TITLE, "2026-09-28"),
      row("started", TRANSPORTATION_TITLE, "2026-09-16"),
    ];

    expect(hideOutOfWindowTransportationAlerts(rows).map((r) => r.id)).toEqual([
      "in",
      "closing-day",
    ]);
  });

  it("leaves every other alert alone, whatever its date", () => {
    const rows = [
      row("conflict", "Scheduling Conflict", "2026-12-01"),
      row("requirements", "Event Requirements Not Met", null),
    ];

    expect(hideOutOfWindowTransportationAlerts(rows)).toEqual(rows);
  });

  it("keeps a transportation alert whose start date is unknown locally", () => {
    // The entity may simply not be synced to this user; the server decides, not the dropdown.
    const rows = [row("unknown", TRANSPORTATION_TITLE, null)];

    expect(hideOutOfWindowTransportationAlerts(rows)).toEqual(rows);
  });
});
