"use client";

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useClerkSupabaseClient } from "@/utils/supabase/useClerkSupabaseClient";
import {
  mapBreakdownRow,
  mapErrorRow,
  mapHealthRow,
  mapMetricRow,
  mapSqliteRows,
  mapVersionRow,
  periodToSince,
  type PerformanceFilters,
} from "../logic/stats";

/**
 * Reads the dashboard's numbers straight from Supabase through the database functions of
 * `20261009120000_perf_dashboard.sql`: not through PowerSync, so the page works whatever the state
 * of the local database. Row-level security is the fence: only a developer gets any rows.
 *
 * Nothing refetches by itself (spec D4): the numbers are read when the page opens and when
 * `anchor` changes, which is the Refresh button. The period is counted back from `anchor`, so it
 * does not creep forward on every render.
 */
export function usePerformanceStats(
  filters: PerformanceFilters,
  metric: string | null,
  anchor: Date,
) {
  const supabase = useClerkSupabaseClient();
  const since = useMemo(() => periodToSince(filters.period, anchor), [filters.period, anchor]);

  const args = { p_since: since, p_env: filters.env, p_version: filters.version };
  const scope = [since, filters.env, filters.version] as const;

  const options = {
    staleTime: Infinity,
    gcTime: 5 * 60 * 1000,
    retry: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  } as const;

  const metrics = useQuery({
    ...options,
    queryKey: ["perf", "percentiles", ...scope],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("perf_percentiles", args);
      if (error) throw error;
      return (data ?? []).map(mapMetricRow);
    },
  });

  const sqlite = useQuery({
    ...options,
    queryKey: ["perf", "sqlite", ...scope],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("perf_sqlite", args);
      if (error) throw error;
      return mapSqliteRows(data ?? []);
    },
  });

  const errors = useQuery({
    ...options,
    queryKey: ["perf", "errors", ...scope],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("perf_errors", args);
      if (error) throw error;
      return (data ?? []).map(mapErrorRow);
    },
  });

  const health = useQuery({
    ...options,
    queryKey: ["perf", "health", ...scope],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("perf_health", args);
      if (error) throw error;
      return (data ?? []).map(mapHealthRow);
    },
  });

  // The version filter lists what the period has, whichever version is chosen.
  const versions = useQuery({
    ...options,
    queryKey: ["perf", "versions", since, filters.env],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("perf_versions", {
        p_since: since,
        p_env: filters.env,
      });
      if (error) throw error;
      return (data ?? []).map(mapVersionRow);
    },
  });

  const breakdown = useQuery({
    ...options,
    enabled: metric !== null,
    queryKey: ["perf", "breakdown", metric, ...scope],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("perf_breakdown", { p_metric: metric!, ...args });
      if (error) throw error;
      return (data ?? []).map(mapBreakdownRow);
    },
  });

  return {
    metrics,
    sqlite,
    errors,
    health,
    versions,
    breakdown,
    /** When the numbers on screen were read (the latest of the blocks). */
    updatedAt: Math.max(
      metrics.dataUpdatedAt,
      sqlite.dataUpdatedAt,
      errors.dataUpdatedAt,
      health.dataUpdatedAt,
    ),
  };
}
