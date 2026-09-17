import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { todayStart, upcomingWindowEndInstant } from "./getUpcomingWindow";

// A Tuesday. The upcoming window therefore closes on Sunday 2026-09-27.
const TUESDAY_NOON = new Date(2026, 8, 15, 12, 0, 0);

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(TUESDAY_NOON);
});

afterEach(() => {
  vi.useRealTimers();
});

describe("upcomingWindowEndInstant", () => {
  it("is comparable with the timestamps the ripple query filters on", () => {
    // `todayStart()` is an instant, and `event_start` is a timestamp column, so
    // the upper bound has to be an instant too — comparing a timestamp against
    // the bare "2026-09-27" date string would drop every event on the last day
    // of the window.
    const lastDayEvening = new Date(2026, 8, 27, 20, 0, 0).toISOString();

    expect(todayStart() <= lastDayEvening).toBe(true);
    expect(lastDayEvening <= upcomingWindowEndInstant()).toBe(true);
  });

  it("excludes the day after the window closes", () => {
    const justAfterWindow = new Date(2026, 8, 28, 0, 30, 0).toISOString();

    expect(justAfterWindow <= upcomingWindowEndInstant()).toBe(false);
  });
});
