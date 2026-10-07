"use client";

import { useMemo } from "react";
import { expect, useTypedQuery } from "@/lib/powersync/typedQuery";
import {
  buildWorkTrackerGroupPaidQuery,
  type WorkTrackerGroupPaidRow,
} from "../db/workTrackerGroupPaid";

/**
 * A driver's week group and whether it is marked paid, live from the local database. For the
 * places that show one week of one driver (the driver's page, the payment window); the week's
 * driver list already holds every group and reads `is_paid` from its own query rather than
 * mounting one watcher per row. `groupId` is null until the week has a group.
 */
export function useWorkTrackerGroupPaid(
  driverUuid: string | null,
  weekStart: string,
): { groupId: string | null; isPaid: boolean } {
  const compiled = useMemo(
    () => buildWorkTrackerGroupPaidQuery(driverUuid, weekStart),
    [driverUuid, weekStart],
  );

  const { data } = useTypedQuery(compiled, expect<WorkTrackerGroupPaidRow>());
  const row = data?.[0];

  return { groupId: row?.id ?? null, isPaid: !!row?.is_paid };
}
