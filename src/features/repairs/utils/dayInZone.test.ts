import { describe, expect, it } from "vitest";
import { dayInZone } from "./dayInZone";

// docs/specs/repairs-03-list-query.md §2 ("day(x)") and D37.

describe("dayInZone", () => {
  it("takes the day in the given zone", () => {
    // 02:00 UTC on March 5 is 21:00 on March 4 in Toronto (EST).
    expect(dayInZone("2026-03-05T02:00:00Z", "America/Toronto")).toBe("2026-03-04");
    expect(dayInZone("2026-03-05T02:00:00Z", "UTC")).toBe("2026-03-05");
  });

  it("honours the offset written in the value", () => {
    expect(dayInZone("2026-03-05T02:00:00+00:00", "America/Toronto")).toBe("2026-03-04");
    expect(dayInZone("2026-03-05T02:00:00-05:00", "UTC")).toBe("2026-03-05");
  });

  it("reads a value with a space instead of the T", () => {
    expect(dayInZone("2026-03-05 02:00:00+00", "America/Toronto")).toBe("2026-03-04");
  });

  it("reads a value with no offset as UTC", () => {
    expect(dayInZone("2026-03-05T02:00:00", "America/Toronto")).toBe("2026-03-04");
  });

  it("gives nothing for an empty or unreadable value", () => {
    expect(dayInZone(null, "UTC")).toBeNull();
    expect(dayInZone(undefined, "UTC")).toBeNull();
    expect(dayInZone("", "UTC")).toBeNull();
    expect(dayInZone("not a date", "UTC")).toBeNull();
  });
});
