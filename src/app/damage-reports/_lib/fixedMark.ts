/**
 * "Fixed by driver" — the manager-facing half.
 *
 * Spec: br_driver/docs/specs/driver-fixed-damage-reports.md
 *
 * A driver marking a report fixed is a claim that the damage is gone, not a
 * closure: the report stays open, on every driver's phone, until someone here
 * closes it. What this module holds is the decision of when that claim earns
 * the one-click resolve — the shortcut past creating a maintenance event, for
 * the small stuff that never needed one.
 *
 * Pure functions on purpose: every rule here is a branch a manager sees as a
 * button appearing or not appearing, and those are worth pinning in tests that
 * do not need a database or a browser.
 */

/** The half of a report row these decisions read. */
export type FixedMarkRow = {
  fixed_by_driver: boolean | number | null;
  resolved_at: string | null;
};

function isMarkedFixed(value: boolean | number | null | undefined): boolean {
  return value === true || value === 1;
}

/**
 * Whether to offer `Mark as Resolved` beside `Create Maintenance to Resolve`.
 *
 * Only a driver's claim unlocks it. Without one there is no repair and nobody
 * vouching for the damage being gone, so closing the report would lose it
 * silently — that path stays the maintenance event.
 */
export function canResolveWithoutMaintenance(report: FixedMarkRow): boolean {
  return isMarkedFixed(report.fixed_by_driver) && !report.resolved_at;
}

/**
 * The update behind that button. `maintenance_event_uuid` is deliberately
 * untouched: there was no repair job, and inventing one would put a phantom
 * entry in the bleacher's maintenance history.
 */
export function buildResolveWithoutMaintenanceUpdate(nowIso: string): {
  resolved_at: string;
} {
  return { resolved_at: nowIso };
}

/**
 * Removing the mark. All three columns move together — Postgres rejects any
 * other combination (CHECK constraint in the migration), so a partial clear
 * would surface as a failed save rather than a wrong row.
 */
export function buildRemoveFixedMarkUpdate(): {
  fixed_by_driver: false;
  fixed_at: null;
  fixed_by_user_uuid: null;
} {
  return { fixed_by_driver: false, fixed_at: null, fixed_by_user_uuid: null };
}

/**
 * The sentence on the panel above the buttons. The name can be missing — the
 * user row may not have been joined, or may have no name on it — and the mark
 * is still worth stating when it is.
 */
export function describeFixedMark(mark: {
  fixed_at: string | null;
  first_name: string | null;
  last_name: string | null;
}): string {
  const name = [mark.first_name, mark.last_name].filter(Boolean).join(" ").trim();
  const when = mark.fixed_at ? new Date(mark.fixed_at).toLocaleDateString() : null;

  return [name ? `Fixed by ${name}` : "Fixed by a driver", when ? `on ${when}` : null]
    .filter(Boolean)
    .join(" ");
}
