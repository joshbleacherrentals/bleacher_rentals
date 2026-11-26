import type { WebRole } from "@/features/userAccess/logic/determineAccess";
import { weekDays } from "@/features/autoWorkTrackers/utils/week";
import type { CheckSummary } from "@/features/autoWorkTrackers/utils/checkSummaries";
import type { ProofStatus } from "./verdict";

/**
 * Where a work tracker stands on the Proof of Delivery page: its GPS verdict once checked, "unchecked"
 * when it is completed but the check has not looked yet; when it is not completed, "overdue" once its
 * day has passed, "not_completed" until then, and "cancelled" when nobody is making the trip.
 */
export type ProofCategory = ProofStatus | "unchecked" | "overdue" | "not_completed" | "cancelled";

/** Statuses where nobody makes the trip: never overdue, and not counted on the panel's badge. */
const OFF_STATUSES = ["cancelled", "declined", "abandoned"];

/** Worst first: what needs someone to look comes before what is pending or fine. */
export const PROOF_ORDER: ProofCategory[] = [
  "overdue",
  "not_found",
  "no_gps",
  "no_location",
  "waiting",
  "unchecked",
  "not_completed",
  "verified",
  "cancelled",
];

export const PROOF_LABEL: Record<ProofCategory, string> = {
  overdue: "overdue",
  not_found: "not found",
  no_gps: "no GPS",
  no_location: "no location",
  waiting: "waiting",
  unchecked: "not checked yet",
  not_completed: "not completed",
  verified: "verified",
  cancelled: "cancelled",
};

/**
 * A trip's category from its tracker status, its proof's status (null before any check), its day and
 * today (both "YYYY-MM-DD"): a trip not completed by the end of its day is overdue.
 */
export function proofCategory(
  trackerStatus: string | null,
  proofStatus: string | null,
  tripDate: string,
  today: string,
): ProofCategory {
  if (trackerStatus && OFF_STATUSES.includes(trackerStatus)) return "cancelled";
  if (trackerStatus !== "completed") return tripDate < today ? "overdue" : "not_completed";
  const known: string[] = ["verified", "not_found", "no_gps", "no_location", "waiting"];
  return known.includes(proofStatus ?? "") ? (proofStatus as ProofStatus) : "unchecked";
}

export type ProofTrip = {
  driverUuid: string;
  driverName: string;
  date: string;
  trackerStatus: string | null;
  proofStatus: string | null;
};

export type ProofDay = {
  date: string;
  counts: Partial<Record<ProofCategory, number>>;
  trips: number;
};
export type DriverProofs = { driverUuid: string; driverName: string; days: ProofDay[] };

/**
 * Each driver's trips per day of the week beginning `weekStart`, counted by proof category as of
 * `today`. Every trip counts, whatever its status; only drivers with a trip get a row, ordered by
 * name, and trips outside the week are ignored. Pure.
 */
export function buildDriverProofs(
  trips: ProofTrip[],
  weekStart: string,
  today: string,
): DriverProofs[] {
  const dates = weekDays(weekStart);
  const byDriver = new Map<string, DriverProofs>();
  for (const trip of trips) {
    if (!dates.includes(trip.date)) continue;
    let row = byDriver.get(trip.driverUuid);
    if (!row) {
      row = {
        driverUuid: trip.driverUuid,
        driverName: trip.driverName,
        days: dates.map((date) => ({ date, counts: {}, trips: 0 })),
      };
      byDriver.set(trip.driverUuid, row);
    }
    const day = row.days[dates.indexOf(trip.date)];
    const category = proofCategory(trip.trackerStatus, trip.proofStatus, trip.date, today);
    day.counts[category] = (day.counts[category] ?? 0) + 1;
    day.trips += 1;
  }
  return [...byDriver.values()].sort((a, b) => a.driverName.localeCompare(b.driverName));
}

/** A day's counts as lines, worst first: "2 waiting", "1 no GPS". */
export function dayLines(day: ProofDay): { category: ProofCategory; text: string }[] {
  return PROOF_ORDER.flatMap((category) => {
    const n = day.counts[category] ?? 0;
    return n > 0 ? [{ category, text: `${n} ${PROOF_LABEL[category]}` }] : [];
  });
}

/**
 * For the side panel: the week's trips that are happening (cancelled ones left out), passing when
 * the GPS verified the delivery.
 */
export function summarizeDeliveryProof(drivers: DriverProofs[]): CheckSummary {
  const days = drivers.flatMap((d) => d.days);
  return {
    passed: days.reduce((n, d) => n + (d.counts.verified ?? 0), 0),
    total: days.reduce((n, d) => n + d.trips - (d.counts.cancelled ?? 0), 0),
  };
}

/** Check now on the Proof of Delivery page runs the GPS check at once: administrators and AMs. */
export function canCheckDeliveryNow(roles: readonly WebRole[]): boolean {
  return roles.includes("admin") || roles.includes("account_manager");
}
