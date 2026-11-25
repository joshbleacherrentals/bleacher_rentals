"use client";

import { useMemo } from "react";
import { expect, useTypedQuery } from "@/lib/powersync/typedQuery";
import { activeRunTripQuery } from "../db/runFeedback";

export type ModelRunTrip = { runUuid: string; runTripUuid: string };

/**
 * The model run a work tracker came from, when it was made by Create work trackers in a run that was
 * not discarded; null otherwise (a tracker made by hand, a new one, or a role that does not sync the
 * run log).
 */
export function useModelRunTrip(workTrackerUuid: string | null | undefined): ModelRunTrip | null {
  const compiled = useMemo(
    () => activeRunTripQuery(workTrackerUuid ?? "__none__"),
    [workTrackerUuid],
  );
  const { data } = useTypedQuery(compiled, expect<{ run_trip_uuid: string; run_uuid: string }>());
  const row = workTrackerUuid ? data?.[0] : undefined;
  return row ? { runUuid: row.run_uuid, runTripUuid: row.run_trip_uuid } : null;
}
