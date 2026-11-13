import { describe, expect, it } from "vitest";
import { bookedAtDay, bookedAtFromDay, formatBookedDay } from "./bookedAt";

describe("bookedAtFromDay", () => {
  it("saves the chosen day at 12:00 in the app's timezone, as UTC", () => {
    // Toronto is UTC-5 in November and UTC-4 in July.
    expect(bookedAtFromDay("2026-11-12", "America/Toronto")).toBe("2026-11-12T17:00:00.000Z");
    expect(bookedAtFromDay("2026-07-01", "America/Toronto")).toBe("2026-07-01T16:00:00.000Z");
    expect(bookedAtFromDay("2026-11-12", "UTC")).toBe("2026-11-12T12:00:00.000Z");
  });

  it("keeps the same noon across the day the clocks change", () => {
    // Toronto goes back an hour on 1 November 2026 at 02:00; noon that day is already UTC-5.
    expect(bookedAtFromDay("2026-11-01", "America/Toronto")).toBe("2026-11-01T17:00:00.000Z");
  });

  it("refuses a day that is not a day", () => {
    expect(() => bookedAtFromDay("2026-13-45", "UTC")).toThrow();
    expect(() => bookedAtFromDay("", "UTC")).toThrow();
  });
});

describe("bookedAtDay", () => {
  it("names the day in the app's timezone, not in UTC", () => {
    // 22:30 in Toronto on the 12th is already the 13th in UTC.
    expect(bookedAtDay("2026-11-13T03:30:00.000Z", "America/Toronto")).toBe("2026-11-12");
    expect(bookedAtDay("2026-11-13T03:30:00.000Z", "UTC")).toBe("2026-11-13");
  });

  it("reads a value with an offset, as the database gives it", () => {
    expect(bookedAtDay("2026-11-15T12:00:00+00:00", "America/Toronto")).toBe("2026-11-15");
  });

  it("is null for no value and for text that is not a time", () => {
    expect(bookedAtDay(null, "UTC")).toBeNull();
    expect(bookedAtDay("", "UTC")).toBeNull();
    expect(bookedAtDay("not a date", "UTC")).toBeNull();
  });

  it("gives back the day that was chosen, in every timezone", () => {
    for (const zone of [
      "America/Toronto",
      "America/Los_Angeles",
      "Europe/London",
      "Asia/Kolkata",
      "Pacific/Auckland",
      "Pacific/Pago_Pago",
      "Pacific/Kiritimati",
    ]) {
      for (const day of ["2026-01-01", "2026-03-08", "2026-11-01", "2026-12-31"]) {
        expect(bookedAtDay(bookedAtFromDay(day, zone), zone), `${day} in ${zone}`).toBe(day);
      }
    }
  });
});

describe("formatBookedDay", () => {
  it("writes the day the way the list does", () => {
    expect(formatBookedDay("2026-11-05")).toBe("Nov 5, 2026");
    expect(formatBookedDay("2026-12-31")).toBe("Dec 31, 2026");
  });

  it("writes a dash when there is no day", () => {
    expect(formatBookedDay(null)).toBe("—");
  });
});
