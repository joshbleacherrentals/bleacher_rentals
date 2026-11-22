import {
  describeDriverPay,
  type DistanceData,
  type DriverPaymentData,
} from "@/features/workTrackers/util";

/** A work tracker the planner created, with its haul (from the Python service's answer). */
export type CreatedHaul = {
  workTrackerId: string;
  driverUuid: string | null;
  haulDistanceMeters: number | null;
  haulDriveSeconds: number | null;
};

/** The Hauling line item to add to one work tracker, and the tracker's new total. */
export type PlannedHaulingLine = {
  workTrackerId: string;
  unitAmtCents: number;
  description: string;
};

/**
 * The Hauling line item for each created work tracker, worked out exactly as the work tracker
 * modal does: describeDriverPay with the driver's pay data (flat rate and tiers) and the haul's
 * distance and drive time; one at quantity 1 for the amount, the breakdown as its description. A
 * tracker with no driver, no pay data, no haul or nothing to pay gets no line. Pure.
 */
export function planHaulingLines(
  created: CreatedHaul[],
  payByDriver: Map<string, DriverPaymentData>,
): PlannedHaulingLine[] {
  return created.flatMap((t) => {
    const pay = t.driverUuid ? payByDriver.get(t.driverUuid) : undefined;
    if (!pay) return [];
    const leg: DistanceData = {
      distanceMeters: t.haulDistanceMeters,
      distanceText: null,
      durationSeconds: t.haulDriveSeconds,
      durationText: null,
    };
    const breakdown = describeDriverPay(pay, leg);
    if (!breakdown) return [];
    return [
      {
        workTrackerId: t.workTrackerId,
        // As the modal stores it (WorkTrackerModal: Math.round(payBreakdown.amount * 100)).
        unitAmtCents: Math.round(breakdown.amount * 100),
        description: breakdown.text,
      },
    ];
  });
}
