import { describe, expect, it } from "vitest";
import { businessToday, hidePastAlerts, isPastBusinessDate, toBusinessDate } from "./pastAlerts";

describe("businessToday", () => {
  it("uses Toronto's date, not UTC's, late in the evening", () => {
    // 22:30 in Toronto on the 17th is already the 18th in UTC.
    expect(businessToday(new Date("2026-09-18T02:30:00Z"))).toBe("2026-09-17");
  });

  it("rolls over at Toronto midnight", () => {
    expect(businessToday(new Date("2026-09-18T04:00:00Z"))).toBe("2026-09-18");
  });
});

describe("toBusinessDate", () => {
  it("leaves a plain date alone", () => {
    expect(toBusinessDate("2026-09-17")).toBe("2026-09-17");
  });

  it("reads a timestamp as its Toronto date", () => {
    expect(toBusinessDate("2026-09-18T02:30:00Z")).toBe("2026-09-17");
  });

  it("returns null for missing or unreadable values", () => {
    expect(toBusinessDate(null)).toBeNull();
    expect(toBusinessDate("")).toBeNull();
    expect(toBusinessDate("not a date")).toBeNull();
  });
});

describe("isPastBusinessDate", () => {
  const today = "2026-09-18";

  it("is past before today", () => {
    expect(isPastBusinessDate("2026-09-17", today)).toBe(true);
  });

  it("is not past today — an event ending today is still on", () => {
    expect(isPastBusinessDate("2026-09-18", today)).toBe(false);
  });

  it("is not past in the future", () => {
    expect(isPastBusinessDate("2026-10-01", today)).toBe(false);
  });

  it("is not past when the date is unknown", () => {
    expect(isPastBusinessDate(null, today)).toBe(false);
  });
});

describe("hidePastAlerts", () => {
  const today = "2026-09-18";

  it("drops alerts whose entity is past and keeps current, future and undated ones", () => {
    const rows = [
      { id: "past", entityDate: "2026-09-17" },
      { id: "today", entityDate: "2026-09-18" },
      { id: "future", entityDate: "2026-12-01" },
      { id: "unknown", entityDate: null },
    ];

    expect(hidePastAlerts(rows, today).map((r) => r.id)).toEqual(["today", "future", "unknown"]);
  });
});
