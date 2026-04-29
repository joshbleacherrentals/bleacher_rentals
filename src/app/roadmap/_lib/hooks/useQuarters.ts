"use client";

import { db } from "@/components/providers/SystemProvider";
import { expect, useTypedQuery } from "@/lib/powersync/typedQuery";
import { useMemo } from "react";
import type { Quarter } from "../types";

type Row = {
  id: string;
  created_at: string | null;
  year: number | null;
  quarter: number | null;
};

export function useQuarters() {
  const compiled = useMemo(
    () =>
      db
        .selectFrom("RoadmapQuarters")
        .select(["id", "created_at", "year", "quarter"])
        .orderBy("year", "desc")
        .orderBy("quarter", "desc")
        .compile(),
    [],
  );

  const { data, isLoading, error } = useTypedQuery(compiled, expect<Row>());

  const quarters = useMemo<Quarter[]>(
    () =>
      (data ?? []).map((r) => ({
        id: r.id,
        created_at: r.created_at ?? "",
        year: r.year ?? 0,
        quarter: r.quarter ?? 0,
      })),
    [data],
  );

  return { quarters, isLoading, error };
}

export function useQuarter(quarterId: string | null) {
  const safeId = quarterId ?? "__none__";

  const compiled = useMemo(
    () =>
      db
        .selectFrom("RoadmapQuarters")
        .select(["id", "created_at", "year", "quarter"])
        .where("id", "=", safeId)
        .limit(1)
        .compile(),
    [safeId],
  );

  const { data, isLoading, error } = useTypedQuery(compiled, expect<Row>());

  const quarter = useMemo<Quarter | null>(() => {
    if (!quarterId) return null;
    const r = data?.[0];
    if (!r) return null;
    return {
      id: r.id,
      created_at: r.created_at ?? "",
      year: r.year ?? 0,
      quarter: r.quarter ?? 0,
    };
  }, [data, quarterId]);

  return { quarter, isLoading, error };
}
