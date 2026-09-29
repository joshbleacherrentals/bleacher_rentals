import { describe, expect, it } from "vitest";
import { DateTime } from "luxon";
import { msUntilNextDay, todayInZone } from "./todayInZone";

const at = (iso: string) => DateTime.fromISO(iso, { setZone: true });

describe("todayInZone", () => {
  it("is the date in the given timezone, not in UTC", () => {
    // 02:30 UTC on the 30th is still the evening of the 29th in Toronto (EDT, UTC-4).
    const now = at("2026-09-30T02:30:00Z");
    expect(todayInZone("America/Toronto", now)).toBe("2026-09-29");
    expect(todayInZone("UTC", now)).toBe("2026-09-30");
  });

  it("falls back to a date for a timezone it does not know", () => {
    expect(todayInZone("Not/AZone", at("2026-09-30T02:30:00Z"))).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe("msUntilNextDay", () => {
  it("counts to the next midnight in the timezone", () => {
    // 22:00 in Toronto: two hours to go.
    const now = at("2026-09-30T02:00:00Z");
    expect(msUntilNextDay("America/Toronto", now)).toBe(2 * 60 * 60 * 1000);
  });

  it("is a full day right at midnight", () => {
    const now = at("2026-09-29T04:00:00Z"); // 00:00 in Toronto
    expect(msUntilNextDay("America/Toronto", now)).toBe(24 * 60 * 60 * 1000);
  });

  it("follows a daylight-saving day, which is 25 hours long", () => {
    // Toronto falls back on 2026-11-01: from 00:00 that day, the next midnight is 25h away.
    const now = DateTime.fromISO("2026-11-01T00:00:00", { zone: "America/Toronto" });
    expect(msUntilNextDay("America/Toronto", now)).toBe(25 * 60 * 60 * 1000);
  });

  it("never returns less than a second, so a timer cannot spin", () => {
    const now = DateTime.fromISO("2026-09-29T23:59:59.999", { zone: "America/Toronto" });
    expect(msUntilNextDay("America/Toronto", now)).toBeGreaterThanOrEqual(1000);
  });

  it("checks back within the hour for a timezone it does not know", () => {
    const wait = msUntilNextDay("Not/AZone", at("2026-09-30T02:00:00Z"));
    expect(wait).toBeGreaterThanOrEqual(1000);
    expect(wait).toBeLessThanOrEqual(60 * 60 * 1000);
  });
});
