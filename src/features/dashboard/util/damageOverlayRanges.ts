import { DateTime } from "luxon";
import { overlaySeverityFromEffective } from "@/lib/damageReportSeverity";
import type { DamageSeverity } from "../types";

/** Severity actually painted on the grid — "none" never produces a strip. */
export type OverlaySeverity = "major" | "minor";

/** Column range (inclusive) where a damage strip should be drawn. */
export type DamageOverlayRange = {
  startCol: number;
  endCol: number;
  severity: OverlaySeverity;
};

/** The damage-report fields the overlay math needs. */
export type DamageOverlayReport = {
  createdAt: string | null;
  resolvedAt: string | null;
  seatDamage: DamageSeverity;
  haulDamage: DamageSeverity;
};

/** The maintenance-event fields the overlay math needs. */
export type DamageOverlayMaintenanceEvent = {
  eventStart: string;
};

/** First column whose date is at or after `iso`, or null when the whole window precedes it. */
function firstColAtOrAfter(dates: readonly string[], iso: string): number | null {
  for (let i = 0; i < dates.length; i++) {
    if (dates[i] >= iso) return i;
  }
  return null;
}

/** Last column whose date is strictly before `iso`, or null when the window starts at/after it. */
function lastColBefore(dates: readonly string[], iso: string): number | null {
  for (let i = dates.length - 1; i >= 0; i--) {
    if (dates[i] < iso) return i;
  }
  return null;
}

/** Date part of an ISO timestamp, or null when it cannot be parsed. */
function toISODate(value: string | null | undefined): string | null {
  if (!value) return null;
  return DateTime.fromISO(value).toISODate();
}

/**
 * Column ranges for one bleacher row's damage strips.
 *
 * Each unresolved damage report with effective damage produces one range:
 * - it starts on the day the report was created (inclusive), clamped to the first
 *   visible column when the report predates the window;
 * - it ends the day before the earliest maintenance event that starts on or after
 *   the report, and otherwise runs to the last visible column.
 *
 * Reports created after the window, and damage already repaired before the window
 * opens, produce no range. Overlapping ranges are resolved by the caller
 * (major wins over minor).
 */
export function computeDamageOverlayRanges(
  reports: readonly DamageOverlayReport[],
  maintenanceEvents: readonly DamageOverlayMaintenanceEvent[],
  dates: readonly string[],
): DamageOverlayRange[] {
  if (dates.length === 0) return [];
  const lastCol = dates.length - 1;

  const maintStarts = maintenanceEvents
    .map((me) => toISODate(me.eventStart))
    .filter((d): d is string => d !== null)
    .sort((a, b) => a.localeCompare(b));

  const ranges: DamageOverlayRange[] = [];

  for (const report of reports) {
    if (report.resolvedAt) continue;

    const severity = overlaySeverityFromEffective(report.seatDamage, report.haulDamage);
    if (!severity) continue;

    const createdISO = toISODate(report.createdAt);
    if (!createdISO) continue;

    // Damage opens on its creation day; earlier damage is clamped to the first column.
    const startCol = firstColAtOrAfter(dates, createdISO);
    if (startCol === null) continue;

    // Maintenance closes the strip the day before work begins.
    const repairStart = maintStarts.find((d) => d >= createdISO);
    let endCol = lastCol;
    if (repairStart !== undefined) {
      const beforeRepair = lastColBefore(dates, repairStart);
      if (beforeRepair === null) continue; // repaired before the window opened
      endCol = beforeRepair;
    }

    if (startCol <= endCol) {
      ranges.push({ startCol, endCol, severity });
    }
  }

  return ranges;
}
