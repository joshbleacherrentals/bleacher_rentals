"use client";

import { useMemo } from "react";
import { expect, useTypedQuery } from "@/lib/powersync/typedQuery";
import { driverUserUuidsQuery } from "../db/driverQueries";

/** Driver id → user id for the zone's drivers, for links to their other pages. */
export function useDriverUserUuids(zoneId: string): Map<string, string> {
  const compiled = useMemo(() => driverUserUuidsQuery(zoneId), [zoneId]);
  const { data } = useTypedQuery(
    compiled,
    expect<{ driver_uuid: string; user_uuid: string | null }>(),
  );
  return useMemo(
    () =>
      new Map(
        (data ?? []).flatMap((r) => (r.user_uuid ? [[r.driver_uuid, r.user_uuid] as const] : [])),
      ),
    [data],
  );
}
