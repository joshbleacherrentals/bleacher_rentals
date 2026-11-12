import { DateTime } from "luxon";
import { WorkTrackersResult } from "@/features/workTrackers/db/db";
import {
  resolveDriverPayRateCents,
  type DriverPayRange,
} from "@/features/manageTeam/logic/driverPayRanges";
import type { Enums } from "../../../database.types";

export type WorkTrackerTimeMode = Enums<"work_tracker_time_mode">;

export function getDateRange(startDate: string): string {
  const start = DateTime.fromISO(startDate, { zone: "utc" });
  const end = start.plus({ days: 6 });

  return `${start.toFormat("MMM d")} - ${end.toFormat("MMM d")}`;
}

export function calculateFinancialTotals(WorkTrackersResult: WorkTrackersResult) {
  const workTrackers = WorkTrackersResult.workTrackers;
  const subtotal = workTrackers.reduce((acc, row) => {
    return acc + (row.workTracker.pay_cents ?? 0);
  }, 0);
  const driverTax = WorkTrackersResult.driverTax / 100;
  const tax = Math.round(subtotal * driverTax);
  const total = Math.round(subtotal + tax);
  const taxPercent = WorkTrackersResult.driverTax;

  return { subtotal, tax, taxPercent, total };
}

/** Meters per mile — matches the conversion already used for driver pay (tripValue). */
export const METERS_PER_MILE = 1609.34;

/** e.g. "21.4 mi (34.4 km)". Empty string when there is nothing to show. */
export function formatMileage(distanceMeters: number | null | undefined): string {
  if (distanceMeters == null) return "";
  const miles = distanceMeters / METERS_PER_MILE;
  const km = distanceMeters / 1000;
  return `${miles.toFixed(1)} mi (${km.toFixed(1)} km)`;
}

/** e.g. "2.4 hrs". Empty string when there is nothing to show. */
export function formatDriveTime(driveMinutes: number | null | undefined): string {
  if (driveMinutes == null) return "";
  const hours = driveMinutes / 60;
  return `${hours.toFixed(1)} hrs`;
}

/** Shown for a pickup/dropoff in `any_time` mode — including every
 * pre-existing work tracker, since nothing was backfilled from the old
 * free-text columns. Also the explicit "no specific time" state a user can
 * pick going forward (see WorkTrackerTimeField's mode toggle). */
export const ANY_TIME_LABEL = "Any Time";

/**
 * Postgres `time` comes back as "HH:MM:SS" (or "HH:MM"). Parsed as plain
 * text — never through `Date`, which would silently apply the browser's own
 * timezone to a value that was never zoned in the first place.
 */
function formatPlainTime(value: string): string | null {
  const match = /^(\d{1,2}):(\d{2})/.exec(value);
  if (!match) return null;
  const hour24 = Number(match[1]);
  const minute = match[2];
  if (hour24 < 0 || hour24 > 23) return null;
  const dayPeriod = hour24 < 12 ? "AM" : "PM";
  const hour12 = String(hour24 % 12 === 0 ? 12 : hour24 % 12).padStart(2, "0");
  return `${hour12}:${minute} ${dayPeriod}`;
}

/**
 * e.g. "10:00 AM" (exact), "10:00 AM - 12:00 PM" (flexible), "Any Time" —
 * the same text `sync_work_tracker_time_text()` writes into the legacy
 * pickup_time/dropoff_time columns (kept only for the driver app), computed
 * client-side instead of waiting on that DB trigger's write to sync back.
 */
export function formatWorkTrackerTime(
  mode: WorkTrackerTimeMode | null | undefined,
  start: string | null | undefined,
  end: string | null | undefined,
): string {
  if (mode === "exact" && start) {
    const formatted = formatPlainTime(start);
    if (formatted) return formatted;
  }
  if (mode === "flexible" && start && end) {
    const startFormatted = formatPlainTime(start);
    const endFormatted = formatPlainTime(end);
    if (startFormatted && endFormatted) return `${startFormatted} - ${endFormatted}`;
  }
  return ANY_TIME_LABEL;
}

/** Sums of the Drive Time / Milage columns, for the week's SubTotal row. */
export function calculateTravelTotals(WorkTrackersResult: WorkTrackersResult) {
  const workTrackers = WorkTrackersResult.workTrackers;
  const totalDistanceMeters = workTrackers.reduce(
    (acc, row) => acc + (row.workTracker.distance_meters ?? 0),
    0,
  );
  const totalDriveMinutes = workTrackers.reduce(
    (acc, row) => acc + (row.workTracker.drive_minutes ?? 0),
    0,
  );

  return { totalDistanceMeters, totalDriveMinutes };
}

export function toLatLngString(a?: { lat?: number; lng?: number }) {
  return a?.lat != null && a?.lng != null ? `${a.lat},${a.lng}` : "";
}

export type DistanceData = {
  distanceMeters: number | null;
  distanceText: string | null;
  durationSeconds: number | null;
  durationText: string | null;
  durationInTrafficSeconds?: number | null;
  durationInTrafficText?: string | null;
};

export type DriverPaymentData = {
  /** Tax rate in percent, 3 decimals — `Drivers.tax_dec`. */
  taxDec: number;
  payRateCents: number;
  /** Flat amount paid per payPerUnit for deadhead travel — no tiers. */
  deadheadRateCents?: number;
  payCurrency: "CAD" | "USD";
  payPerUnit: "KM" | "MI" | "HR";
  /** Tiered rates (DriverPayRanges). Empty or absent = the flat payRateCents applies. */
  payRanges?: DriverPayRange[];
};

export type DriverPayBreakdown = {
  /** Trip size in the driver's pay unit: kilometres, miles or hours. */
  value: number;
  unit: "KM" | "MI" | "HR";
  /** The rate that applied — from the matching range, else the flat rate. */
  rateCents: number;
  amount: number;
  /** e.g. "52.5MI × $2.25/MI = $118.13" */
  text: string;
};

/** The trip size the rate is charged against, in the driver's own unit. */
function tripValue(unit: "KM" | "MI" | "HR", distanceData: DistanceData): number | null {
  switch (unit) {
    case "KM":
      return distanceData.distanceMeters != null ? distanceData.distanceMeters / 1000 : null;
    case "MI":
      return distanceData.distanceMeters != null ? distanceData.distanceMeters / 1609.34 : null;
    case "HR":
      return distanceData.durationSeconds != null ? distanceData.durationSeconds / 3600 : null;
  }
}

/**
 * How the driver's pay for one leg is arrived at, for showing the work.
 *
 * One rate covers the whole trip — the range the trip falls into, not a
 * progressive sum across ranges. A driver with no ranges (or a trip outside
 * every range) is paid the flat `payRateCents`, exactly as before ranges existed.
 */
export function describeDriverPay(
  driverPaymentData: DriverPaymentData,
  distanceData: DistanceData,
): DriverPayBreakdown | null {
  if (!driverPaymentData || !distanceData) return null;

  const unit = driverPaymentData.payPerUnit;
  const value = tripValue(unit, distanceData);
  if (value === null) return null;

  const rateCents =
    resolveDriverPayRateCents({
      ranges: driverPaymentData.payRanges ?? [],
      value,
      fallbackRateCents: driverPaymentData.payRateCents,
    }) ?? driverPaymentData.payRateCents;

  const amount = (rateCents / 100) * value;
  if (!(amount > 0)) return null;

  const rate = `$${(rateCents / 100).toFixed(2)}`;
  const shownValue = value.toFixed(1);

  return {
    value,
    unit,
    rateCents,
    amount,
    text: `${shownValue}${unit} × ${rate}/${unit} = $${amount.toFixed(2)}`,
  };
}

export function calculateDriverPay(
  driverPaymentData: DriverPaymentData,
  distanceData: DistanceData,
): number | null {
  return describeDriverPay(driverPaymentData, distanceData)?.amount ?? null;
}

/**
 * How the driver's deadhead pay for one leg is arrived at — same trip size as
 * `describeDriverPay` (same pickup/dropoff leg), but at the driver's flat
 * deadhead rate instead of their (possibly tiered) haul rate.
 */
export function describeDeadheadPay(
  driverPaymentData: DriverPaymentData,
  distanceData: DistanceData,
): DriverPayBreakdown | null {
  if (!driverPaymentData || !distanceData) return null;

  const unit = driverPaymentData.payPerUnit;
  const value = tripValue(unit, distanceData);
  if (value === null) return null;

  const rateCents = driverPaymentData.deadheadRateCents ?? 0;
  const amount = (rateCents / 100) * value;
  if (!(amount > 0)) return null;

  const rate = `$${(rateCents / 100).toFixed(2)}`;
  const shownValue = value.toFixed(1);

  return {
    value,
    unit,
    rateCents,
    amount,
    text: `${shownValue}${unit} × ${rate}/${unit} (deadhead) = $${amount.toFixed(2)}`,
  };
}

export function calculateDeadheadPay(
  driverPaymentData: DriverPaymentData,
  distanceData: DistanceData,
): number | null {
  return describeDeadheadPay(driverPaymentData, distanceData)?.amount ?? null;
}
