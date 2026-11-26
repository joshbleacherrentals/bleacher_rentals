import { describe, it, expect } from "vitest";
import { canCheckDeliveryNow, listStatus, proofCounts, sortWorstFirst } from "./proofList";

const row = (status: string | null, completed_at: string) => ({ status, completed_at });

describe("proof list", () => {
  it("treats a tracker with no proof row as not checked yet", () => {
    expect(listStatus(null)).toBe("unchecked");
    expect(listStatus("something-new")).toBe("unchecked");
    expect(listStatus("verified")).toBe("verified");
  });

  it("sorts worst first, then the oldest completion first", () => {
    const sorted = sortWorstFirst([
      row("verified", "2026-11-20"),
      row(null, "2026-11-21"),
      row("not_found", "2026-11-22"),
      row("waiting", "2026-11-20"),
      row("not_found", "2026-11-19"),
      row("no_gps", "2026-11-20"),
    ]);
    expect(sorted.map((r) => `${r.status}@${r.completed_at}`)).toEqual([
      "not_found@2026-11-19",
      "not_found@2026-11-22",
      "no_gps@2026-11-20",
      "waiting@2026-11-20",
      "null@2026-11-21",
      "verified@2026-11-20",
    ]);
  });

  it("counts every status, zero when none", () => {
    expect(proofCounts([row("verified", ""), row("verified", ""), row(null, "")])).toEqual({
      not_found: 0,
      no_gps: 0,
      no_location: 0,
      waiting: 0,
      unchecked: 1,
      verified: 2,
    });
  });

  it("lets administrators and account managers check now, nobody else", () => {
    expect(canCheckDeliveryNow(["admin"])).toBe(true);
    expect(canCheckDeliveryNow(["account_manager"])).toBe(true);
    for (const role of ["viewer", "accountant", "driver", "developer", "maintainer"] as const) {
      expect(canCheckDeliveryNow([role]), role).toBe(false);
    }
  });
});
