"use client";

import { useMemo } from "react";
import { expect, useTypedQuery } from "@/lib/powersync/typedQuery";
import { driverKindsQuery } from "../db/driverQueries";
import { driverKindOf, type DriverKind } from "../utils/driverKind";

/** Driver id → employee or contractor, for the zone's drivers. */
export function useDriverKinds(zoneId: string): Map<string, DriverKind> {
  const compiled = useMemo(() => driverKindsQuery(zoneId), [zoneId]);
  const { data } = useTypedQuery(
    compiled,
    expect<{ driver_uuid: string; vendor_uuid: string | null; vendor_name: string | null }>(),
  );
  return useMemo(
    () => new Map((data ?? []).map((r) => [r.driver_uuid, driverKindOf(r)] as const)),
    [data],
  );
}
