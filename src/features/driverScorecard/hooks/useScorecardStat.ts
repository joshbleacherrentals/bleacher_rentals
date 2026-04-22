"use client";

import { useMemo } from "react";
import { db } from "@/components/providers/SystemProvider";
import { expect, useTypedQuery } from "@/lib/powersync/typedQuery";
import { DriverScorecardStatKey } from "../constants";

type StatRow = { value: number | null };

/**
 * Reactive lookup of a single DriverScoreCardStats value for a given
 * (year, key). Returns 0 when no row exists yet.
 */
export function useScorecardStat(year: number, key: DriverScorecardStatKey): number {
  const compiled = useMemo(
    () =>
      db
        .selectFrom("DriverScoreCardStats")
        .select(["value"])
        .where("year", "=", year)
        .where("key", "=", key)
        .limit(1)
        .compile(),
    [year, key],
  );

  const { data = [] } = useTypedQuery(compiled, expect<StatRow>());
  return data[0]?.value ?? 0;
}
