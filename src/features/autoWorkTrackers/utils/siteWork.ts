import {
  reconcileRequirementLineItems,
  type DraftWorkTrackerLineItem,
} from "@/features/workTrackers/db/workTrackerLineItems";

/** Every setup and every teardown takes an hour, whoever does it. */
export const SETUP_MINUTES = 60;
export const TEARDOWN_MINUTES = 60;

export type SiteWork = { teardown: boolean; setup: boolean };

/**
 * The setup and teardown a trip needs: a teardown when it picks the bleacher up from the event it is
 * leaving, a setup when it drops it off at an event. Every trip the model plans ends at the next
 * event, so it always sets up; for now the driver who hauls the bleacher does both. Pure.
 */
export function siteWorkFor(trip: { pickupAtEvent: boolean }): SiteWork {
  return { teardown: trip.pickupAtEvent, setup: true };
}

/** A driver's pay for one setup and one teardown (Drivers.setup_cents / teardown_cents). */
export type SiteWorkRates = { setupCents: number | null; teardownCents: number | null };

export type PlannedLine = {
  workTrackerId: string;
  type: DraftWorkTrackerLineItem["type"];
  qtyDecimal: number;
  unitAmtCents: number;
  description: string | null;
  isAutomaticallyManaged: boolean;
};

/**
 * The Setup and Teardown line items of each created work tracker, made exactly as the work tracker
 * modal makes them when its Setup Required / Teardown Required boxes are ticked
 * (reconcileRequirementLineItems): one each, quantity 1, at the driver's rate, automatically
 * managed. Pure.
 */
export function planSiteWorkLines(
  created: { workTrackerId: string; driverUuid: string | null; work: SiteWork }[],
  ratesByDriver: Map<string, SiteWorkRates>,
  newId: () => string = () => crypto.randomUUID(),
): PlannedLine[] {
  return created.flatMap((t) => {
    const rates = t.driverUuid ? ratesByDriver.get(t.driverUuid) : undefined;
    return reconcileRequirementLineItems(
      [],
      {
        setupRequired: t.work.setup,
        teardownRequired: t.work.teardown,
        setupCents: rates?.setupCents,
        teardownCents: rates?.teardownCents,
      },
      newId,
    ).map((item) => ({
      workTrackerId: t.workTrackerId,
      type: item.type,
      qtyDecimal: item.qtyDecimal,
      unitAmtCents: item.unitAmtCents,
      description: item.description,
      isAutomaticallyManaged: item.isAutomaticallyManaged,
    }));
  });
}
