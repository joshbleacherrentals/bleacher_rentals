import { describe, it, expect } from "vitest";
import { computeDamageOverlayRanges, type DamageOverlayReport } from "./damageOverlayRanges";

/** Grid window: 2025-03-10 .. 2025-03-19 (10 columns). */
const DATES = [
  "2025-03-10",
  "2025-03-11",
  "2025-03-12",
  "2025-03-13",
  "2025-03-14",
  "2025-03-15",
  "2025-03-16",
  "2025-03-17",
  "2025-03-18",
  "2025-03-19",
];

function report(overrides: Partial<DamageOverlayReport> = {}): DamageOverlayReport {
  return {
    createdAt: "2025-03-12T08:30:00Z",
    resolvedAt: null,
    maintenanceEventUuid: null,
    seatDamage: "major",
    haulDamage: "none",
    ...overrides,
  };
}

function maintenance(eventStart: string, maintenanceEventUuid = "me-1") {
  return { maintenanceEventUuid, eventStart };
}

describe("computeDamageOverlayRanges", () => {
  it("starts on the day the report was created (inclusive)", () => {
    expect(computeDamageOverlayRanges([report()], [], DATES)).toEqual([
      { startCol: 2, endCol: 9, severity: "major" },
    ]);
  });

  it("ends the day before the maintenance event starts", () => {
    const ranges = computeDamageOverlayRanges([report()], [maintenance("2025-03-16")], DATES);
    expect(ranges).toEqual([{ startCol: 2, endCol: 5, severity: "major" }]);
  });

  it("uses the earliest maintenance event starting on or after the report", () => {
    const ranges = computeDamageOverlayRanges(
      [report()],
      [
        maintenance("2025-03-18", "a"),
        maintenance("2025-03-15", "b"),
        maintenance("2025-03-11", "c"),
      ],
      DATES,
    );
    expect(ranges).toEqual([{ startCol: 2, endCol: 4, severity: "major" }]);
  });

  it("runs to the end of the grid when maintenance starts past the window", () => {
    const ranges = computeDamageOverlayRanges([report()], [maintenance("2025-04-02")], DATES);
    expect(ranges).toEqual([{ startCol: 2, endCol: 9, severity: "major" }]);
  });

  it("clamps to the first column when the report predates the window", () => {
    const ranges = computeDamageOverlayRanges(
      [report({ createdAt: "2025-02-01T10:00:00Z" })],
      [],
      DATES,
    );
    expect(ranges).toEqual([{ startCol: 0, endCol: 9, severity: "major" }]);
  });

  it("drops reports created after the visible window", () => {
    expect(
      computeDamageOverlayRanges([report({ createdAt: "2025-05-01T10:00:00Z" })], [], DATES),
    ).toEqual([]);
  });

  it("drops damage already repaired before the window opens", () => {
    const ranges = computeDamageOverlayRanges(
      [report({ createdAt: "2025-02-01T10:00:00Z" })],
      [maintenance("2025-02-20")],
      DATES,
    );
    expect(ranges).toEqual([]);
  });

  it("still draws a report that maintenance auto-resolved, up to the repair day", () => {
    // createMaintenanceEvent stamps resolved_at + maintenance_event_uuid on the report.
    const ranges = computeDamageOverlayRanges(
      [report({ resolvedAt: "2025-03-16T11:00:00Z", maintenanceEventUuid: "me-1" })],
      [maintenance("2025-03-16", "me-1")],
      DATES,
    );
    expect(ranges).toEqual([{ startCol: 2, endCol: 5, severity: "major" }]);
  });

  it("prefers the linked maintenance event over an earlier unrelated one", () => {
    const ranges = computeDamageOverlayRanges(
      [report({ resolvedAt: "2025-03-18T11:00:00Z", maintenanceEventUuid: "me-2" })],
      [maintenance("2025-03-14", "me-other"), maintenance("2025-03-18", "me-2")],
      DATES,
    );
    expect(ranges).toEqual([{ startCol: 2, endCol: 7, severity: "major" }]);
  });

  it("ends on the resolution day when a report was resolved without maintenance", () => {
    const ranges = computeDamageOverlayRanges(
      [report({ resolvedAt: "2025-03-15T11:00:00Z" })],
      [],
      DATES,
    );
    expect(ranges).toEqual([{ startCol: 2, endCol: 5, severity: "major" }]);
  });

  it("drops a report resolved before the window opened", () => {
    const ranges = computeDamageOverlayRanges(
      [report({ createdAt: "2025-02-01T09:00:00Z", resolvedAt: "2025-02-09T11:00:00Z" })],
      [],
      DATES,
    );
    expect(ranges).toEqual([]);
  });

  it("ignores reports with no effective damage", () => {
    expect(
      computeDamageOverlayRanges([report({ seatDamage: "none", haulDamage: "none" })], [], DATES),
    ).toEqual([]);
  });

  it("keeps one range per report so the earliest one opens the strip", () => {
    const ranges = computeDamageOverlayRanges(
      [
        report({ createdAt: "2025-03-11T09:00:00Z", seatDamage: "minor" }),
        report({ createdAt: "2025-03-14T09:00:00Z", seatDamage: "major" }),
      ],
      [],
      DATES,
    );
    expect(ranges).toEqual([
      { startCol: 1, endCol: 9, severity: "minor" },
      { startCol: 4, endCol: 9, severity: "major" },
    ]);
  });

  it("skips reports without a usable created_at", () => {
    expect(computeDamageOverlayRanges([report({ createdAt: null })], [], DATES)).toEqual([]);
    expect(computeDamageOverlayRanges([report({ createdAt: "not-a-date" })], [], DATES)).toEqual(
      [],
    );
  });

  it("returns nothing for an empty grid", () => {
    expect(computeDamageOverlayRanges([report()], [], [])).toEqual([]);
  });
});
