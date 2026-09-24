/**
 * "Last report" as an age, so a stale report is obvious at a glance: a phone
 * that reported 9 days ago has not synced successfully in 9 days.
 */

import { describe, it, expect } from "vitest";
import { formatReportAge } from "./formatReportAge";

const NOW = new Date("2026-09-21T12:00:00Z");
const ago = (ms: number) => new Date(NOW.getTime() - ms).toISOString();
const MIN = 60 * 1000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

describe("formatReportAge", () => {
  it("under a minute is 'just now'", () => {
    expect(formatReportAge(ago(30 * 1000), NOW)).toBe("just now");
  });

  it("minutes", () => {
    expect(formatReportAge(ago(5 * MIN), NOW)).toBe("5m ago");
  });

  it("hours", () => {
    expect(formatReportAge(ago(2 * HOUR + 10 * MIN), NOW)).toBe("2h ago");
  });

  it("days", () => {
    expect(formatReportAge(ago(9 * DAY + 3 * HOUR), NOW)).toBe("9d ago");
  });

  it("a report stamped in the future (device clock ahead) is 'just now'", () => {
    expect(formatReportAge(ago(-10 * MIN), NOW)).toBe("just now");
  });

  it("an unparseable timestamp is —", () => {
    expect(formatReportAge("not a date", NOW)).toBe("—");
  });
});
