/** The Python service's answer to "create the work trackers this zone needs this week". */
export type GenerateWorkTrackersResult = {
  bleachers_in_zone: number;
  bleachers_needing_trips: number;
  created: {
    work_tracker_id: string;
    bleacher_uuid: string;
    bleacher_number: number | null;
    from_street: string;
    to_street: string;
    date: string;
    driver_uuid: string | null;
    /** The trip's place in the driver's day: 1 for the first. */
    sequence: number;
    /** The work tracker it drives on from, straight from its drop-off; null: from home. */
    previous_work_tracker_id: string | null;
    /** Suggested times, ISO with the zone's offset. */
    planned_pickup_at: string | null;
    planned_dropoff_at: string | null;
  }[];
  /** Trips that got no driver and day, so no work tracker was created for them. */
  unassigned: {
    bleacher_uuid: string;
    bleacher_number: number | null;
    from_street: string;
    to_street: string;
    earliest_day: string | null;
    latest_day: string | null;
    reason: "no_window" | "outside_week" | "no_free_driver_day" | "too_long_for_a_day";
  }[];
  /**
   * Where the run's road legs came from: Google just now, the route cache, or a straight-line
   * estimate (no coordinates, no route found, or Google unreachable).
   */
  travel?: { google: number; cached: number; estimated: number };
};

/**
 * Asks the Python service to find the trips the zone's bleachers need in the week starting
 * `weekStart` (a Monday) and plan them as driver routes: several trips a day, one bleacher at a
 * time, at most 12 hours from leaving home to getting back. It creates a draft work tracker for each
 * trip that fits, with its driver, day, the trip it follows and suggested times. The service reads
 * and writes Supabase itself.
 */
export async function generateWorkTrackers(params: {
  zoneId: string;
  weekStart: string;
}): Promise<GenerateWorkTrackersResult> {
  const res = await fetch("/api/py/auto-work-trackers/generate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      zone_id: params.zoneId,
      week_start: params.weekStart,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    }),
  });
  if (!res.ok) {
    const hint =
      res.status === 404 && process.env.NODE_ENV === "development"
        ? " Is the Python dev server running? Start it with `npm run dev:py`."
        : "";
    throw new Error(`Could not create work trackers (status ${res.status}).${hint}`);
  }
  return res.json();
}
