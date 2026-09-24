import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { getUpcomingWindowEnd } from "./getUpcomingWindow";
import { businessToday } from "./pastAlerts";

// A Tuesday, noon in Toronto. The upcoming window therefore closes on Sunday 2026-09-27.
const TUESDAY_NOON_TORONTO = new Date("2026-09-15T16:00:00Z");

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(TUESDAY_NOON_TORONTO);
});

afterEach(() => {
  vi.useRealTimers();
});

describe("getUpcomingWindowEnd", () => {
  it("closes on the Sunday after next", () => {
    expect(getUpcomingWindowEnd()).toBe("2026-09-27");
  });

  it("is a plain date, comparable with the date columns the queries filter on", () => {
    // Events.event_start, Events.event_end and WorkTrackers.date are DATE columns, stored locally
    // as "YYYY-MM-DD". An instant like "2026-09-27T23:59:59.999Z" sorts AFTER every row on its own
    // day as text, and — the bug this replaces — a start bound as an instant sorts after every row
    // on today, dropping them from the window.
    const lastDayOfWindow = "2026-09-27";

    expect(businessToday() <= lastDayOfWindow).toBe(true);
    expect(lastDayOfWindow <= getUpcomingWindowEnd()).toBe(true);
  });

  it("includes rows dated today", () => {
    expect("2026-09-15" >= businessToday()).toBe(true);
  });

  it("excludes the day after the window closes", () => {
    expect("2026-09-28" <= getUpcomingWindowEnd()).toBe(false);
  });

  it("closes a week earlier than a UTC reading would, on a Sunday evening", () => {
    // 21:00 Sunday in Toronto is Monday in UTC. Toronto sees Sunday and closes the window on the
    // Sunday a week out; a UTC reading would see Monday and run it to 2026-10-04.
    vi.setSystemTime(new Date("2026-09-21T01:00:00Z")); // Sun 2026-09-20, 21:00 in Toronto

    expect(businessToday()).toBe("2026-09-20");
    expect(getUpcomingWindowEnd()).toBe("2026-09-27");
  });

  it("uses Toronto's week, not UTC's", () => {
    // 21:00 Saturday in Toronto is already Sunday in UTC. Reading the day in UTC would close the
    // window a week early.
    vi.setSystemTime(new Date("2026-09-20T01:00:00Z")); // Sat 2026-09-19, 21:00 in Toronto

    expect(businessToday()).toBe("2026-09-19");
    expect(getUpcomingWindowEnd()).toBe("2026-09-27");
  });
});
