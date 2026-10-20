import { describe, expect, it } from "vitest";
import { oldestCreatedAtMs } from "./oldestCreatedAt";

describe("oldestCreatedAtMs", () => {
  it("is the earliest created_at, whatever the order", () => {
    expect(
      oldestCreatedAtMs([
        { created_at: "2026-10-19T12:00:00.000Z" },
        { created_at: "2026-10-17T08:30:00+00:00" },
        { created_at: "2026-10-18T00:00:00Z" },
      ]),
    ).toBe(Date.parse("2026-10-17T08:30:00Z"));
  });

  it("skips rows with no or unreadable time", () => {
    expect(oldestCreatedAtMs([{ created_at: null }, { created_at: "soon" }])).toBeNull();
    expect(oldestCreatedAtMs([{ created_at: null }, { created_at: "2026-10-18T00:00:00Z" }])).toBe(
      Date.parse("2026-10-18T00:00:00Z"),
    );
  });

  it("is null for no rows", () => {
    expect(oldestCreatedAtMs([])).toBeNull();
  });
});
