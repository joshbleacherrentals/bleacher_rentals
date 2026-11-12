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
  }[];
};

/**
 * Asks the Python service to find the trips the zone's bleachers need in the week starting
 * `weekStart` (a Monday) and create a draft work tracker for each. The service reads and writes
 * Supabase itself.
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
