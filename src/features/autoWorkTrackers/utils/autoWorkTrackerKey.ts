/**
 * The value the Auto Work Trackers model stamps on WorkTrackers.auto_work_tracker_id: the zone and
 * week it planned. Null on trackers made by hand, and cleared when a tracker is saved in the modal.
 */
export function autoWorkTrackerKey(zoneId: string, weekStart: string): string {
  return `${zoneId}|${weekStart}`;
}

export type ModelTrackerCounts = {
  /** Made by the model for this zone and week, and not edited since. */
  model: number;
  /** Of those, the drafts: the ones the bulk delete removes. */
  modelDrafts: number;
  /** Every other work tracker on the zone's bleachers dated in the week. */
  manual: number;
};

/** Counts the week's work trackers: the model's (by key) and everyone else's. Pure. */
export function countModelTrackers(
  rows: { auto_work_tracker_id: string | null; status: string | null }[],
  key: string,
): ModelTrackerCounts {
  let model = 0;
  let modelDrafts = 0;
  let manual = 0;
  for (const r of rows) {
    if (r.auto_work_tracker_id === key) {
      model++;
      if (r.status === "draft") modelDrafts++;
    } else manual++;
  }
  return { model, modelDrafts, manual };
}
